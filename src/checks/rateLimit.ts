import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const RATE_LIMIT_LIBRARIES = ['express-rate-limit', 'rate-limiter-flexible', 'bottleneck', 'p-limit', 'limiter', 'express-brute'];

export class RateLimitCheck implements ShipReadyCheck {
  name = 'rateLimit';
  category = 'reliability' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return RATE_LIMIT_LIBRARIES.some(lib => deps[lib]);
    });
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

    let hasRateLimitLib = false;
    let hasRateLimitConfig = false;
    let hasGlobalRateLimit = false;
    let hasSpecificRateLimit = false;
    let hasWeakRateLimit = false;
    let hasRedisBackend = false;
    const installedLibs: string[] = [];

    // Check package.json
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of RATE_LIMIT_LIBRARIES) {
        if (deps[lib]) {
          hasRateLimitLib = true;
          installedLibs.push(lib);
        }
      }
      if (deps['ioredis'] || deps['redis']) hasRedisBackend = true;
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for rate limit configuration
      if (/rateLimit\s*\(/i.test(content) || /RateLimiter|rateLimiter/i.test(content)) {
        hasRateLimitConfig = true;

        // Check if it's applied globally (app.use)
        if (/app\.use\s*\(\s*rateLimit|app\.use\s*\(\s*\w+RateLimit/i.test(content)) {
          hasGlobalRateLimit = true;
        } else {
          hasSpecificRateLimit = true;
        }

        // Check for weak rate limits
        const windowMatch = content.match(/windowMs\s*:\s*(\d+)/i);
        const maxMatch = content.match(/max\s*:\s*(\d+)/i);

        if (maxMatch) {
          const max = parseInt(maxMatch[1], 10);
          if (max > 1000) {
            hasWeakRateLimit = true;
            const lines = content.split('\n');
            let lineNumber = 1;
            for (let i = 0; i < lines.length; i++) {
              if (content.includes(maxMatch[0])) {
                lineNumber = i + 1;
                break;
              }
            }

            items.push({
              type: 'WEAK_RATE_LIMIT',
              severity: 'MEDIUM',
              message: `Rate limit threshold is very high (max: ${max} requests)`,
              impact: 'High rate limits may not effectively prevent abuse or brute force attacks',
              fix: 'Set a more restrictive limit (e.g., 100-200 requests per window for API endpoints)',
              file: relativePath,
              line: lineNumber,
              confidence: 0.6,
            });
          }
        }
      }
    }

    // If API routes exist but no rate limiting
    const apiRoutesExist = files.some(f => {
      const content = readFileSafely(f, 100);
      return content && /router\.(get|post|put|delete|patch)\s*\(/i.test(content);
    });

    if (apiRoutesExist && !hasRateLimitLib) {
      items.push({
        type: 'MISSING_RATE_LIMIT',
        severity: 'HIGH',
        message: 'API routes detected but no rate limiting configured',
        impact: 'Without rate limiting, API is vulnerable to DoS attacks and abuse',
        fix: 'Install and configure a rate limiter (e.g., `npm install express-rate-limit`)',
        confidence: 0.7,
      });
    }

    // If rate limit is installed but not configured
    if (hasRateLimitLib && !hasRateLimitConfig) {
      items.push({
        type: 'RATE_LIMIT_NOT_CONFIGURED',
        severity: 'MEDIUM',
        message: `Rate limiting library (${installedLibs.join(', ')}) installed but not configured`,
        impact: 'Rate limiting library is not being applied to any routes',
        fix: 'Configure and apply rate limiting middleware to your API routes',
        confidence: 0.6,
      });
    }

    // Recommend Redis-backed rate limiting for production
    if (context.config.project.isProd && hasRateLimitLib && !hasRedisBackend) {
      items.push({
        type: 'MEMORY_RATE_LIMIT',
        severity: 'LOW',
        message: 'Rate limiting may use in-memory storage (not shared across instances)',
        impact: 'Rate limits reset per server instance, making them ineffective with multiple instances',
        fix: 'Use a shared store like Redis for rate limiting in production',
        confidence: 0.4,
      });
    }

    indicators.push({ found: hasRateLimitLib, weight: 1 });
    indicators.push({ found: hasRateLimitConfig, weight: 1.5 });
    indicators.push({ found: hasGlobalRateLimit, weight: 0.5 });
    indicators.push({ found: hasWeakRateLimit, weight: -1 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Rate limiting is properly configured'
      : `Found ${items.length} rate limiting issue(s)`;

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
