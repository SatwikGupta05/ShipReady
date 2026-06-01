import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

// Known vulnerable or deprecated dependency patterns
const KNOWN_ISSUE_PATTERNS: Array<{
  package: RegExp;
  versionPattern?: RegExp;
  severity: 'HIGH' | 'MEDIUM';
  message: string;
  impact: string;
  fix: string;
}> = [
  {
    package: /^lodash$/,
    versionPattern: /^[<~^]?[01]\./,
    severity: 'MEDIUM',
    message: 'Known vulnerable version of lodash detected',
    impact: 'Older lodash versions contain prototype pollution vulnerabilities',
    fix: 'Update lodash to the latest version: `npm install lodash@latest`',
  },
  {
    package: /^moment$/,
    severity: 'MEDIUM',
    message: 'Moment.js is deprecated — consider using a modern alternative',
    impact: 'Moment.js is in maintenance mode and not recommended for new projects',
    fix: 'Replace moment with dayjs, date-fns, or the native Intl API',
  },
  {
    package: /^request$/,
    severity: 'HIGH',
    message: 'The `request` library is deprecated',
    impact: 'The request library is fully deprecated and no longer receives security updates',
    fix: 'Replace with native fetch, axios, got, or node-fetch',
  },
  {
    package: /^jquery$/,
    versionPattern: /^[<~^]?[123]\./,
    severity: 'MEDIUM',
    message: 'jQuery is outdated — consider using native DOM APIs or a modern framework',
    impact: 'jQuery adds unnecessary bundle weight and may have unpatched vulnerabilities',
    fix: 'Replace jQuery with native DOM APIs, Alpine.js, or a modern framework',
  },
  {
    package: /^gulp$/,
    severity: 'MEDIUM',
    message: 'Gulp is outdated — consider using npm scripts or a modern build tool',
    impact: 'Gulp-based build pipelines are harder to maintain than modern alternatives',
    fix: 'Migrate to npm scripts, Vite, or Turborepo',
  },
  {
    package: /^bower$/,
    severity: 'HIGH',
    message: 'Bower is deprecated',
    impact: 'Bower has been fully deprecated; packages are no longer maintained',
    fix: 'Migrate dependencies to npm or yarn',
  },
];

export class DependencyCheck implements ShipReadyCheck {
  name = 'dependencies';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(p => p.packageJson.dependencies || p.packageJson.devDependencies);
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    for (const pkg of context.packages) {
      const pkgJson = pkg.packageJson;
      const allDeps = {
        ...(pkgJson.dependencies || {}),
        ...(pkgJson.devDependencies || {}),
      };

      const depNames = Object.keys(allDeps);
      indicators.push({ found: depNames.length > 0, weight: 0.3 });

      // Check for missing lockfile
      const hasLockfile = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].some(lf =>
        fs.existsSync(path.join(pkg.path, lf))
      );
      if (!hasLockfile) {
        items.push({
          type: 'MISSING_LOCKFILE',
          severity: 'HIGH',
          message: 'No lockfile found — dependency versions are not pinned',
          impact: 'Without a lockfile, different installs may get different dependency versions, leading to inconsistent behavior and potential security issues',
          fix: 'Run `npm install` (generates package-lock.json), `yarn install` (yarn.lock), or `pnpm install` (pnpm-lock.yaml)',
          file: path.relative(context.rootDir, pkg.path),
          confidence: 1.0,
        });
      }

      // Check for deprecation patterns
      for (const [depName, depVersion] of Object.entries(allDeps)) {
        const version = typeof depVersion === 'string' ? depVersion : '*';

        for (const issue of KNOWN_ISSUE_PATTERNS) {
          if (issue.package.test(depName)) {
            // If version specific, check it
            if (issue.versionPattern && !issue.versionPattern.test(version)) {
              continue;
            }

            items.push({
              type: 'DEPRECATED_DEPENDENCY',
              severity: issue.severity,
              message: issue.message,
              impact: issue.impact,
              fix: issue.fix,
              file: path.join(path.relative(context.rootDir, pkg.path), 'package.json'),
              confidence: 0.9,
              context: `${depName}@${version} in ${pkg.name}`,
            });
          }
        }
      }

      // Check for pinned versions (no ^ or ~ range) — actually this can be good
      // But we want to flag exact pinned versions without ranges as potentially problematic for updates
      const flatPinnedDeps = Object.entries(allDeps)
        .filter(([, ver]) => typeof ver === 'string' && /^\d+\.\d+\.\d+$/.test(ver))
        .slice(0, 5); // Cap at 5

      if (flatPinnedDeps.length > 3) {
        items.push({
          type: 'OVERLY_PINNED',
          severity: 'LOW',
          message: `${flatPinnedDeps.length} dependencies are pinned to exact versions`,
          impact: 'Exact version pinning can prevent critical security patches from being installed automatically',
          fix: 'Use semver ranges (^ or ~) for dependencies, or use a lockfile for reproducible builds',
          file: path.join(path.relative(context.rootDir, pkg.path), 'package.json'),
          confidence: 0.4,
        });
      }

      // Check for too many dependencies
      if (depNames.length > 100) {
        items.push({
          type: 'MANY_DEPENDENCIES',
          severity: 'LOW',
          message: `${depNames.length} dependencies found — consider auditing for unused ones`,
          impact: 'Unnecessary dependencies increase attack surface and bundle size',
          fix: 'Run `npx depcheck` to find unused dependencies and remove them',
          file: path.join(path.relative(context.rootDir, pkg.path), 'package.json'),
          confidence: 0.3,
        });
      }
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'No dependency issues detected'
      : `Found ${items.length} dependency issue(s) across ${context.packages.length} package(s)`;

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
