import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const LOGGING_LIBRARIES = ['winston', 'pino', 'bunyan', 'loglevel', 'signale', 'consola', 'roarr', 'tslog', 'loglevelnext'];

export class LoggingCheck implements ShipReadyCheck {
  name = 'logging';
  category = 'reliability' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return true; // Logging is relevant for all Node.js projects
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

    let hasLoggingLib = false;
    let hasStructuredLogging = false;
    let hasConsoleLog = false;
    let hasLogLevels = false;
    let hasProductionConfig = false;
    let hasSensitiveDataLogging = false;
    let hasTransportConfig = false;
    const installedLibs: string[] = [];

    // Check package.json
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of LOGGING_LIBRARIES) {
        if (deps[lib]) {
          hasLoggingLib = true;
          installedLibs.push(lib);
        }
      }
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);
      if (relativePath.includes('/test/') || relativePath.includes('/spec/') || relativePath.includes('/migrations/')) continue;

      // Check for console.log usage
      const consoleLogCount = (content.match(/\bconsole\.(log|warn|error|info|debug)\s*\(/g) || []).length;
      if (consoleLogCount > 0) {
        hasConsoleLog = true;
      }

      // Check for heavy console.log usage (more than 10 occurrences across files)
      if (consoleLogCount > 10) {
        indicators.push({ found: true, weight: 0.5 });
      }

      // Check for structured logging
      if (/winston\.createLogger|pino\s*\(|bunyan\.createLogger|new\s+Logger|log\.info\s*\(\{[^)]*\}/i.test(content)) {
        hasStructuredLogging = true;
      }

      // Check for log levels
      if (/\.info\s*\(|\.warn\s*\(|\.error\s*\(|\.debug\s*\(|\.fatal\s*\(|level\s*:/i.test(content)) {
        hasLogLevels = true;
      }

      // Check for logging sensitive data
      if (/(?:password|secret|token|api[_-]?key|authorization)\s*[=:].*\.(?:log|info|warn|error|debug)\s*\(/i.test(content) ||
          /\.(?:log|info|warn|error|debug)\([^)]*(?:password|secret|token)/i.test(content)) {
        hasSensitiveDataLogging = true;
        const lines = content.split('\n');
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/(?:password|secret|token).*(?:log|info|warn|error|debug)\s*\(|\.(?:log|info|warn|error|debug)\([^)]*(?:password|secret)/i.test(lines[i])) {
            lineNumber = i + 1;
            break;
          }
        }

        items.push({
          type: 'SENSITIVE_DATA_LOGGING',
          severity: 'HIGH',
          message: 'Potential sensitive data being logged (passwords, secrets, or tokens)',
          impact: 'Sensitive data in logs can be exposed through log aggregation systems',
          fix: 'Sanitize or mask sensitive fields before logging. Never log passwords, tokens, or secrets.',
          file: relativePath,
          line: lineNumber,
          confidence: 0.7,
        });
      }

      // Check for transport/file logging configuration
      if (/new\s+winston\.transports|transport\s*:|pino\.destination|bunyan.*stream|logs\s*:|logDir/i.test(content)) {
        hasTransportConfig = true;
      }

      // Check for production log level config
      if (/level\s*:\s*['"]info['"]|level\s*:\s*['"]warn['"]|level\s*:\s*['"]error['"]/i.test(content) ||
          /NODE_ENV.*info|level.*process\.env/i.test(content)) {
        hasProductionConfig = true;
      }
    }

    // No logging library but using console.log in production
    if (context.config.project.isProd && !hasLoggingLib && hasConsoleLog) {
      items.push({
        type: 'CONSOLE_LOG_IN_PRODUCTION',
        severity: 'MEDIUM',
        message: 'Using console.log in production without a logging library',
        impact: 'Console logs lack log levels, structured output, and proper transport configuration',
        fix: 'Use a structured logging library (e.g., winston, pino) for production logging',
        confidence: 0.6,
      });
    }

    // Console.log with no logging library in any project
    if (!hasLoggingLib && hasConsoleLog) {
      items.push({
        type: 'NO_LOGGING_LIBRARY',
        severity: 'LOW',
        message: 'No structured logging library detected, using console.log',
        impact: 'Logs are unstructured and hard to parse in production environments',
        fix: 'Consider using a logging library like winston or pino for better log management',
        confidence: 0.4,
      });
    }

    // Logging library installed but no structured logging usage
    if (hasLoggingLib && !hasStructuredLogging) {
      items.push({
        type: 'LOGGING_LIB_NOT_CONFIGURED',
        severity: 'LOW',
        message: `Logging library (${installedLibs.join(', ')}) installed but not configured`,
        impact: 'Library may be using defaults or not properly set up',
        fix: 'Configure the logger with appropriate transports, formats, and log levels',
        confidence: 0.5,
      });
    }

    // Missing log levels
    if (hasLoggingLib && !hasLogLevels) {
      items.push({
        type: 'NO_LOG_LEVELS',
        severity: 'LOW',
        message: 'Logging library configured but log levels not detected',
        impact: 'All log messages may be treated equally, making filtering difficult',
        fix: 'Use appropriate log levels (info, warn, error, debug) for different message types',
        confidence: 0.3,
      });
    }

    // Missing transport config in production
    if (context.config.project.isProd && hasLoggingLib && !hasTransportConfig) {
      items.push({
        type: 'NO_LOG_TRANSPORT',
        severity: 'MEDIUM',
        message: 'No log transport configuration detected for production',
        impact: 'Logs may only go to stdout/stderr without proper persistence or rotation',
        fix: 'Configure log transports to output to files, log aggregation services, or both',
        confidence: 0.4,
      });
    }

    indicators.push({ found: hasLoggingLib, weight: 1 });
    indicators.push({ found: hasStructuredLogging, weight: 1 });
    indicators.push({ found: hasLogLevels, weight: 0.5 });
    indicators.push({ found: hasTransportConfig, weight: 0.5 });
    indicators.push({ found: hasProductionConfig, weight: 0.5 });
    indicators.push({ found: hasSensitiveDataLogging, weight: 2 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Logging configuration looks adequate'
      : `Found ${items.length} logging issue(s)`;

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
