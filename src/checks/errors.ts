import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

export class ErrorsCheck implements ShipReadyCheck {
  name = 'errors';
  category = 'reliability' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return true; // Error handling is always relevant
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 300 }
    );

    let hasErrorMiddleware = false;
    let hasTryCatch = false;
    let hasUncaughtHandler = false;
    let hasProcessErrorHandler = false;
    let hasAsyncErrorHandler = false;

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);
      if (relativePath.includes('/test/') || relativePath.includes('/spec/')) continue;

      // Check for Express error middleware (4-parameter middleware)
      if (/app\.use\s*\(.*err|errorHandler|errorMiddleware|error\[|ErrorHandler/i.test(content)) {
        hasErrorMiddleware = true;
      }

      // Check for async error wrapper
      if (/asyncHandler|asyncErrorHandler|catchAsync|wrapAsync|express-async-errors/i.test(content)) {
        hasAsyncErrorHandler = true;
      }

      // Check for try/catch patterns
      const tryCatchCount = (content.match(/try\s*\{/g) || []).length;
      if (tryCatchCount > 0) {
        hasTryCatch = true;
      }

      // Check for process-level error handlers
      if (/process\.on\s*\(\s*['"]uncaughtException['"]/i.test(content)) {
        hasUncaughtHandler = true;
      }

      if (/process\.on\s*\(\s*['"]unhandledRejection['"]/i.test(content)) {
        hasProcessErrorHandler = true;
      }

      // Check for bare .catch() without error handling
      const catchCount = (content.match(/\.catch\s*\(/g) || []).length;
      const catchWithHandler = (content.match(/\.catch\s*\(\s*(?:\(?\w+\)?\s*=>|function|console|next)/g) || []).length;
      if (catchCount > catchWithHandler && catchCount > 2) {
        // Findings for unhandled promises - but this is very common, only flag if no error handling at all
        indicators.push({ found: false, weight: 0.3 });
      }
    }

    // Check for missing global error handler in API projects
    if (context.config.project.type === 'api' && !hasErrorMiddleware) {
      items.push({
        type: 'MISSING_ERROR_MIDDLEWARE',
        severity: 'HIGH',
        message: 'No global error handler middleware detected in API project',
        impact: 'Unhandled errors will crash the server or leak stack traces to users',
        fix: 'Implement a global error handler middleware that catches and safely handles errors',
        confidence: 0.7,
      });
    }

    // Check for missing process error handlers in production
    if (context.config.project.isProd && !hasUncaughtHandler) {
      items.push({
        type: 'MISSING_UNCAUGHT_HANDLER',
        severity: 'HIGH',
        message: 'No uncaught exception handler detected',
        impact: 'Uncaught exceptions will crash the Node.js process without cleanup',
        fix: 'Add process.on("uncaughtException") handler for graceful shutdown',
        confidence: 0.6,
      });
    }

    // Check for missing unhandled rejection handler in production
    if (context.config.project.isProd && !hasProcessErrorHandler) {
      items.push({
        type: 'MISSING_UNHANDLED_REJECTION',
        severity: 'MEDIUM',
        message: 'No unhandled promise rejection handler detected',
        impact: 'Unhandled rejections could crash future Node.js versions',
        fix: 'Add process.on("unhandledRejection") handler for logging and graceful shutdown',
        confidence: 0.5,
      });
    }

    // Check for missing async error handling in Express apps
    if (hasErrorMiddleware && !hasAsyncErrorHandler) {
      const hasExpress = files.some(f => {
        const content = readFileSafely(f, 100);
        return content && /express/.test(content);
      });

      if (hasExpress) {
        items.push({
          type: 'NO_ASYNC_ERROR_WRAPPER',
          severity: 'MEDIUM',
          message: 'Express app detected without async error wrapper',
          impact: 'Errors thrown in async route handlers will not be caught by error middleware',
          fix: 'Use express-async-errors package or wrap async handlers to forward errors to next()',
          confidence: 0.5,
        });
      }
    }

    indicators.push({ found: hasErrorMiddleware, weight: 1 });
    indicators.push({ found: hasTryCatch, weight: 0.5 });
    indicators.push({ found: hasUncaughtHandler, weight: 0.5 });
    indicators.push({ found: hasProcessErrorHandler, weight: 0.5 });
    indicators.push({ found: hasAsyncErrorHandler, weight: 0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Error handling configuration looks robust'
      : `Found ${items.length} error handling issue(s)`;

    return {
      check: this.name,
      status,
      confidence,
      items,
      summary,
      category: this.category,
    };
  }
}
