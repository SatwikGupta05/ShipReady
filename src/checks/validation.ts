import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const VALIDATION_LIBRARIES = ['zod', 'joi', 'express-validator', 'yup', 'class-validator', 'ajv', 'superstruct', 'valibot', 'io-ts', '@hapi/joi', 'vinejs'];

export class ValidationCheck implements ShipReadyCheck {
  name = 'validation';
  category = 'security' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return VALIDATION_LIBRARIES.some(lib => deps[lib]);
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

    let hasValidationLib = false;
    let hasSchemaValidation = false;
    let hasApiRoutes = false;
    let hasBodyParsing = false;
    const installedLibs: string[] = [];

    // Check package.json
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of VALIDATION_LIBRARIES) {
        if (deps[lib]) {
          hasValidationLib = true;
          installedLibs.push(lib);
        }
      }
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for schema validation usage
      if (/\.parse\s*\(|\.validate\s*\(|\.validateSync\s*\(|safeParse|z\.object|Joi\.object|yup\.object|z\.string|z\.number/i.test(content)) {
        hasSchemaValidation = true;
      }

      // Check for API route definitions
      if (/router\.(get|post|put|delete|patch)\s*\(/i.test(content) || /app\.(get|post|put|delete|patch)\s*\(/i.test(content)) {
        hasApiRoutes = true;
      }

      // Check for body parsing
      if (/bodyParser|express\.json|express\.urlencoded|\.json\s*\(/i.test(content)) {
        hasBodyParsing = true;
      }
    }

    // If API routes exist but no validation
    if (hasApiRoutes && !hasValidationLib) {
      items.push({
        type: 'MISSING_INPUT_VALIDATION',
        severity: 'HIGH',
        message: 'API routes detected but no input validation library found',
        impact: 'Unvalidated input can lead to injection attacks, data corruption, and unexpected behavior',
        fix: 'Install a validation library (e.g., zod, joi, express-validator) and validate all request inputs',
        confidence: 0.6,
      });
    }

    // If validation library exists but no schema usage detected
    if (hasValidationLib && !hasSchemaValidation) {
      items.push({
        type: 'VALIDATION_LIB_NOT_USED',
        severity: 'MEDIUM',
        message: `Validation library (${installedLibs.join(', ')}) installed but no schema validation detected in code`,
        impact: 'Installed validation libraries are not being used to validate inputs',
        fix: 'Create validation schemas for all API endpoints and use them in request handlers',
        confidence: 0.5,
      });
    }

    // In production API, recommend validation
    if (context.config.project.isProd && context.config.project.type === 'api' && !hasValidationLib && !hasSchemaValidation) {
      items.push({
        type: 'PROD_NO_VALIDATION',
        severity: 'HIGH',
        message: 'Production API project without input validation',
        impact: 'Production APIs without input validation are at high risk of injection attacks',
        fix: 'Implement input validation for all API endpoints as a security best practice',
        confidence: 0.7,
      });
    }

    indicators.push({ found: hasValidationLib, weight: 1 });
    indicators.push({ found: hasSchemaValidation, weight: 1.5 });
    indicators.push({ found: hasApiRoutes, weight: 0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Input validation is properly configured'
      : `Found ${items.length} input validation issue(s)`;

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
