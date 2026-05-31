import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const SESSION_LIBRARIES = ['express-session', 'cookie-session', 'client-sessions', 'session-file-store', 'connect-redis', 'connect-mongo', 'connect-pg-simple'];

export class SessionCheck implements ShipReadyCheck {
  name = 'session';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return SESSION_LIBRARIES.some(lib => deps[lib]) || /session/.test(JSON.stringify(deps));
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

    let hasSessionLib = false;
    let hasSecureCookies = false;
    let hasHttpOnly = false;
    let hasSameSite = false;
    let hasSessionSecret = false;
    let hasWeakSessionSecret = false;
    let hasRedisStore = false;
    let hasSessionConfig = false;

    // Check package.json for session libraries
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of SESSION_LIBRARIES) {
        if (deps[lib]) hasSessionLib = true;
      }
      // Check for redis/mongo session stores
      if (deps['connect-redis'] || deps['ioredis']) hasRedisStore = true;
      if (deps['connect-mongo']) hasRedisStore = true; // mongo as session store
    }

    if (!hasSessionLib) {
      // No session library — nothing to check
      return {
        check: this.name,
        status: 'SKIP',
        confidence: 0,
        items: [],
        summary: 'Skipped — no session management library detected in project',
        category: this.category,
      };
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for session configuration
      if (/session\s*\(/i.test(content)) {
        hasSessionConfig = true;
      }

      // Check for cookie configuration
      if (/cookie\s*:/i.test(content)) {
        // Check secure flag
        if (/secure\s*:\s*true/i.test(content)) hasSecureCookies = true;
        if (/secure\s*:\s*false/i.test(content)) {
          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (/secure\s*:\s*false/i.test(lines[i])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'COOKIE_SECURE_FALSE',
            severity: 'HIGH',
            message: 'Session cookie secure flag is set to false',
            impact: 'Cookies can be transmitted over unencrypted HTTP connections',
            fix: 'Set secure: true in production to ensure cookies are only sent over HTTPS',
            file: relativePath,
            line: lineNumber,
            confidence: 0.9,
          });
        }

        // Check httpOnly flag
        if (/httpOnly\s*:\s*true/i.test(content)) hasHttpOnly = true;
        if (/httpOnly\s*:\s*false/i.test(content)) {
          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (/httpOnly\s*:\s*false/i.test(lines[i])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'COOKIE_HTTPONLY_FALSE',
            severity: 'HIGH',
            message: 'Session cookie httpOnly flag is set to false',
            impact: 'Client-side JavaScript can access session cookies, enabling XSS-based session theft',
            fix: 'Set httpOnly: true to prevent JavaScript access to session cookies',
            file: relativePath,
            line: lineNumber,
            confidence: 0.9,
          });
        }

        // Check sameSite
        if (/sameSite\s*:/i.test(content)) hasSameSite = true;
        if (/sameSite\s*:\s*['"]none['"]/i.test(content)) {
          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (/sameSite\s*:\s*['"]none['"]/i.test(lines[i])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'COOKIE_SAMESITE_NONE',
            severity: 'MEDIUM',
            message: 'Session cookie sameSite is set to "none"',
            impact: 'Cookies are sent on cross-site requests, increasing CSRF risk',
            fix: 'Use sameSite: "lax" or "strict" unless you have a specific cross-site requirement',
            file: relativePath,
            line: lineNumber,
            confidence: 0.8,
          });
        }
      }

      // Check session secret
      const secretMatch = content.match(/secret\s*:\s*['"]([^'"]{1,20})['"]/);
      if (secretMatch) {
        hasSessionSecret = true;
        const secret = secretMatch[1];
        if (secret.length < 16 || secret === 'secret' || secret === 'session_secret' || secret === 'keyboard cat') {
          hasWeakSessionSecret = true;
          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(secretMatch[0])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'WEAK_SESSION_SECRET',
            severity: 'CRITICAL',
            message: 'Weak or default session secret detected',
            impact: 'Weak session secrets can be brute-forced, allowing session hijacking',
            fix: 'Use a strong, randomly generated session secret via environment variables',
            file: relativePath,
            line: lineNumber,
            confidence: 0.95,
          });
        }
      }
    }

    // Check for missing secure cookie in production
    if (context.config.project.isProd && hasSessionLib && !hasSecureCookies) {
      items.push({
        type: 'MISSING_SECURE_COOKIE',
        severity: 'HIGH',
        message: 'Session cookies missing "secure" flag in production',
        impact: 'Session cookies may be transmitted over unencrypted connections',
        fix: 'Add secure: true to your session cookie configuration',
        confidence: 0.7,
      });
    }

    // Check for missing httpOnly
    if (hasSessionLib && !hasHttpOnly) {
      items.push({
        type: 'MISSING_HTTPONLY',
        severity: 'MEDIUM',
        message: 'Session cookies may be missing "httpOnly" flag',
        impact: 'Client-side JavaScript may have access to session cookies',
        fix: 'Add httpOnly: true to your session cookie configuration',
        confidence: 0.5,
      });
    }

    // Check for missing session store (memory store in production)
    if (context.config.project.isProd && hasSessionLib && !hasRedisStore) {
      items.push({
        type: 'MEMORY_STORE_WARNING',
        severity: 'MEDIUM',
        message: 'Session may be using the default memory store in production',
        impact: 'Memory store does not scale across processes and leaks memory',
        fix: 'Use a production session store like connect-redis, connect-mongo, or connect-pg-simple',
        confidence: 0.5,
      });
    }

    indicators.push({ found: hasSessionLib, weight: 1 });
    indicators.push({ found: hasSecureCookies, weight: 1 });
    indicators.push({ found: hasHttpOnly, weight: 0.5 });
    indicators.push({ found: hasSameSite, weight: 0.5 });
    indicators.push({ found: hasSessionSecret, weight: 1 });
    indicators.push({ found: hasWeakSessionSecret, weight: 2 });
    indicators.push({ found: hasRedisStore, weight: 0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Session configuration looks secure'
      : `Found ${items.length} session configuration issue(s)`;

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
