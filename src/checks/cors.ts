import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

export class CorsCheck implements ShipReadyCheck {
  name = 'cors';
  category = 'security' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    // Check if any package has CORS-related dependencies
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return Object.keys(deps).some(d => /^cors$/i.test(d));
    });
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.rs'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 300 }
    );

    // Check for wildcard CORS origin
    let hasWildcardCors = false;
    let hasCorsPackage = false;
    let hasCustomCors = false;
    let hasHelmet = false;

    // Check package.json for cors and helmet
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      if (deps.cors) hasCorsPackage = true;
      if (deps.helmet) hasHelmet = true;
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for wildcard origin patterns
      if (/origin\s*:\s*['"]\*['"]/i.test(content) ||
          /Access-Control-Allow-Origin\s*:\s*\*/i.test(content) ||
          /allowOrigin\s*:\s*['"]\*['"]/i.test(content) ||
          /origins\s*:\s*\[['"]\*['"]\]/i.test(content)) {
        const lines = content.split('\n');
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin\s*:\s*\*/i.test(lines[i])) {
            lineNumber = i + 1;
            break;
          }
        }

        hasWildcardCors = true;
        items.push({
          type: 'WILDCARD_CORS',
          severity: 'CRITICAL',
          message: 'Wildcard CORS origin detected',
          impact: 'Allows any website to make cross-origin requests, enabling data theft and CSRF attacks',
          fix: 'Restrict CORS to specific trusted origins. Use environment variables to configure allowed origins.',
          file: relativePath,
          line: lineNumber,
          confidence: 0.95,
        });
      }

      // Check for CORS configuration (custom CORS setup)
      if (/cors\s*\(/i.test(content) || /corsMiddleware/i.test(content)) {
        hasCustomCors = true;
      }

      // Check for reflect-origin patterns (dangerous)
      if (/reflectOrigin|reflect_origin|origin\s*:\s*req\.get/i.test(content)) {
        const lines = content.split('\n');
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/reflectOrigin|reflect_origin|origin\s*:\s*req\.get/i.test(lines[i])) {
            lineNumber = i + 1;
            break;
          }
        }

        items.push({
          type: 'REFLECTED_ORIGIN',
          severity: 'HIGH',
          message: 'CORS origin is being reflected from request',
          impact: 'Reflecting the Origin header allows any site to bypass CORS',
          fix: 'Use a whitelist of allowed origins instead of reflecting the request origin',
          file: relativePath,
          line: lineNumber,
          confidence: 0.85,
        });
      }
    }

    // If cors package is used but no explicit configuration found, warn
    if (hasCorsPackage && !hasCustomCors) {
      items.push({
        type: 'DEFAULT_CORS',
        severity: 'MEDIUM',
        message: 'CORS package is installed but may be using default permissive configuration',
        impact: 'Default CORS configuration allows all origins in many setups',
        fix: 'Explicitly configure CORS with allowed origins, methods, and headers',
        confidence: 0.6,
      });
    }

    // If no helmet/cors in production environment, warn
    if (context.config.project.isProd && !hasCorsPackage && !hasHelmet) {
      items.push({
        type: 'MISSING_CORS',
        severity: 'MEDIUM',
        message: 'No CORS middleware detected in production project',
        impact: 'API endpoints may be accessible from unauthorized origins',
        fix: 'Install and configure a CORS middleware (e.g., `npm install cors`)',
        confidence: 0.5,
      });
    }

    indicators.push({ found: hasCorsPackage, weight: 1 });
    indicators.push({ found: hasCustomCors, weight: 1 });
    indicators.push({ found: hasWildcardCors, weight: 2 });
    indicators.push({ found: hasHelmet, weight: 0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'CORS configuration looks secure'
      : `Found ${items.length} CORS issue(s)`;

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
