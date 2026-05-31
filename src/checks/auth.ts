import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const AUTH_LIBRARIES = [
  'passport', 'passport-jwt', 'passport-local', 'passport-google-oauth20',
  'jsonwebtoken', 'jose', 'next-auth', 'auth0', 'firebase-admin',
  'supertokens-node', 'clerk-sdk-node', 'lucia', 'lucia-auth',
];

export class AuthCheck implements ShipReadyCheck {
  name = 'auth';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return AUTH_LIBRARIES.some(lib => deps[lib]);
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

    let hasAuthMiddleware = false;
    let hasJwtSecret = false;
    let hasWeakSecret = false;
    let hasNoAuthRoutes = false;
    let hasSessionConfig = false;
    const installedLibs: string[] = [];

    // Check package.json for auth libraries
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of AUTH_LIBRARIES) {
        if (deps[lib]) installedLibs.push(lib);
      }
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for auth middleware usage
      if (/authenticate|isAuthenticated|requireAuth|protectRoute|verifyToken|authMiddleware|middleware\.auth/i.test(content)) {
        hasAuthMiddleware = true;
      }

      // Check for JWT secret configuration
      const jwtSecretMatch = content.match(/jwt[_-]?secret\s*[:=]\s*['"]([^'"]{1,15})['"]/i);
      if (jwtSecretMatch) {
        hasJwtSecret = true;
        const secret = jwtSecretMatch[1];
        if (secret.length < 16 || secret === 'secret' || secret === 'jwt_secret' || secret === 'mysecret') {
          hasWeakSecret = true;
          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(jwtSecretMatch[0])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'WEAK_JWT_SECRET',
            severity: 'CRITICAL',
            message: 'Weak or default JWT secret detected',
            impact: 'Weak JWT secrets can be brute-forced, allowing attackers to forge authentication tokens',
            fix: 'Use a strong, randomly generated JWT secret of at least 32 characters via environment variables',
            file: relativePath,
            line: lineNumber,
            confidence: 0.95,
          });
        }
      }

      // Check for routes without auth protection
      if (/router\.(get|post|put|delete|patch)\s*\(['"]\/[^'"]*['"]\s*,/.test(content)) {
        // Check if protected routes exist at all
        if (!hasAuthMiddleware) {
          hasNoAuthRoutes = true;
        }
      }
    }

    // If auth libraries are installed but no middleware detected
    if (installedLibs.length > 0 && !hasAuthMiddleware) {
      items.push({
        type: 'MISSING_AUTH_MIDDLEWARE',
        severity: 'HIGH',
        message: 'Auth libraries installed but no auth middleware detected in routes',
        impact: 'API routes may be unprotected despite having auth libraries available',
        fix: 'Apply authentication middleware to all protected routes',
        confidence: 0.6,
      });
    }

    // If JWT library is installed but no secret configuration found
    if (installedLibs.some(l => l.includes('jwt') || l.includes('jose')) && !hasJwtSecret) {
      items.push({
        type: 'MISSING_JWT_SECRET',
        severity: 'HIGH',
        message: 'JWT library detected but no JWT secret configuration found',
        impact: 'JWT tokens may be using a weak or default secret',
        fix: 'Configure JWT with a strong secret via environment variables',
        confidence: 0.5,
      });
    }

    // No auth libraries at all for a production API
    if (context.config.project.isProd && context.config.project.type === 'api' && installedLibs.length === 0) {
      items.push({
        type: 'NO_AUTH_LIBRARY',
        severity: 'CRITICAL',
        message: 'No authentication library detected in production API project',
        impact: 'API endpoints may be completely unprotected',
        fix: 'Install and configure an authentication library (e.g., passport, next-auth, jsonwebtoken)',
        confidence: 0.7,
      });
    }

    indicators.push({ found: installedLibs.length > 0, weight: 1 });
    indicators.push({ found: hasAuthMiddleware, weight: 1.5 });
    indicators.push({ found: hasJwtSecret, weight: 0.5 });
    indicators.push({ found: hasWeakSecret, weight: 2 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Authentication configuration looks secure'
      : `Found ${items.length} authentication issue(s)`;

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
