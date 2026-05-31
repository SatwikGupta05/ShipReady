import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

export class EnvCheck implements ShipReadyCheck {
  name = 'env';
  category = 'ops' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return true; // Always relevant — env config matters for all projects
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    for (const pkg of context.packages) {
      const pkgPath = pkg.path;
      const relativePkgPath = path.relative(context.rootDir, pkgPath);

      // Check for .env.example
      const envExamplePath = path.join(pkgPath, '.env.example');
      const envExampleExists = fs.existsSync(envExamplePath);

      // Check for .env
      const envPath = path.join(pkgPath, '.env');
      const envExists = fs.existsSync(envPath);

      // Check for dotenv usage
      const hasDotenv = pkg.packageJson.dependencies?.dotenv ||
                        pkg.packageJson.devDependencies?.dotenv;

      // Check for env validation library
      const envDeps = ['dotenv', 'envalid', 'env-var', 'zod', 'joi'];
      const hasEnvValidation = envDeps.some(dep =>
        pkg.packageJson.dependencies?.[dep] || pkg.packageJson.devDependencies?.[dep]
      );

      // Check for .env in .gitignore
      const gitignorePath = path.join(context.rootDir, '.gitignore');
      let envInGitignore = false;
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        envInGitignore = gitignoreContent.split('\n').some(line =>
          line.trim() === '.env' || line.trim() === '.env.*'
        );
      }

      // Warn if .env exists but not in .gitignore
      if (envExists && !envInGitignore) {
        items.push({
          type: 'ENV_NOT_IGNORED',
          severity: 'CRITICAL',
          message: '.env file exists but is not in .gitignore',
          impact: 'Environment variables with secrets may be committed to version control',
          fix: 'Add `.env` to .gitignore to prevent accidental commits of sensitive data',
          file: relativePkgPath,
          confidence: 0.95,
        });
      }

      // Warn if no .env.example
      if (!envExampleExists) {
        items.push({
          type: 'MISSING_ENV_EXAMPLE',
          severity: 'MEDIUM',
          message: 'No .env.example file found',
          impact: 'New developers have no reference for required environment variables',
          fix: 'Create a .env.example file with all required env vars (without real values)',
          file: relativePkgPath,
          confidence: 0.7,
        });
      }

      // Check .env.example content quality
      if (envExampleExists) {
        const envContent = readFileSafely(envExamplePath, 100);
        if (envContent) {
          const lines = envContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
          const hasDescriptions = envContent.includes('#');

          if (lines.length === 0) {
            items.push({
              type: 'EMPTY_ENV_EXAMPLE',
              severity: 'LOW',
              message: '.env.example file is empty',
              impact: 'Provides no guidance on required environment variables',
              fix: 'Populate .env.example with all necessary environment variable names',
              file: relativePkgPath + '/.env.example',
              confidence: 0.8,
            });
          }

          if (!hasDescriptions && lines.length > 0) {
            items.push({
              type: 'ENV_EXAMPLE_NO_DESCRIPTIONS',
              severity: 'LOW',
              message: '.env.example lacks descriptions for environment variables',
              impact: 'Makes it harder for developers to understand what each variable does',
              fix: 'Add comments above each environment variable explaining its purpose',
              file: relativePkgPath + '/.env.example',
              confidence: 0.5,
            });
          }

          indicators.push({ found: lines.length > 0, weight: 0.5 });
        }
      }

      // Check for process.env usage to see if env vars are actually used
      const sourceDirs = context.packages.map(p => p.path);
      let envVarsUsed = false;

      for (const dir of sourceDirs) {
        if (fs.existsSync(dir)) {
          const files = walkDirForEnv(dir);
          for (const file of files) {
            const content = readFileSafely(file, 256);
            if (content && /process\.env\.\w+|process\.env\[\s*['"`]\w+/i.test(content)) {
              envVarsUsed = true;
              break;
            }
          }
        }
        if (envVarsUsed) break;
      }

      // If dotenv exists but no .env.example
      if (hasDotenv && !envExampleExists) {
        // Already added MISSING_ENV_EXAMPLE above
      }

      // Warn if no env validation
      if (context.config.project.isProd && !hasEnvValidation) {
        items.push({
          type: 'NO_ENV_VALIDATION',
          severity: 'MEDIUM',
          message: 'No environment variable validation library detected',
          impact: 'Missing required environment variables may cause runtime crashes',
          fix: 'Use a validation library (e.g., envalid, env-var) or validate env vars early in app startup',
          confidence: 0.4,
        });
      }

      indicators.push({ found: envExampleExists, weight: 1 });
      indicators.push({ found: envInGitignore, weight: 1 });
      indicators.push({ found: !!hasDotenv, weight: 0.5 });
      indicators.push({ found: envVarsUsed, weight: 0.5 });
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Environment variable configuration looks good'
      : `Found ${items.length} environment configuration issue(s)`;

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

/**
 * Walk a directory tree to find source files for env var checking.
 */
function walkDirForEnv(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'build') {
          results.push(...walkDirForEnv(fullPath));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'].includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch { /* skip */ }
  return results;
}
