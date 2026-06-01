import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const MONOREPO_TOOLS = [
  { name: 'Turborepo', deps: ['turbo'], files: ['turbo.json', 'turbo.jsonc'] },
  { name: 'Nx', deps: ['nx', '@nrwl/workspace', '@nx/workspace'], files: ['nx.json', 'workspace.json'] },
  { name: 'Lerna', deps: ['lerna'], files: ['lerna.json'] },
  { name: 'Rush', deps: ['@microsoft/rush'], files: ['rush.json'] },
  { name: 'pnpm workspace', deps: [], files: ['pnpm-workspace.yaml'] },
  { name: 'Yarn workspaces', deps: [], files: [] }, // detected via package.json
  { name: 'npm workspaces', deps: [], files: [] }, // detected via package.json
];

const MONOREPO_BEST_PRACTICES = [
  { field: 'scripts.build', label: 'build script', severity: 'MEDIUM' as const },
  { field: 'scripts.test', label: 'test script', severity: 'HIGH' as const },
  { field: 'scripts.lint', label: 'lint script', severity: 'LOW' as const },
];

export class MonorepoCheck implements ShipReadyCheck {
  name = 'monorepo';
  category = 'ops' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.length > 1;
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    let hasMonorepoTool = false;
    let detectedTools: string[] = [];
    let hasTaskRunner = false;
    let hasCaching = false;
    let hasPackageScripts = false;
    let hasSharedConfig = false;

    // 1. Detect monorepo tools
    const rootPkg = context.packages[0]?.packageJson || {};
    const allRootDeps = { ...(rootPkg.dependencies || {}), ...(rootPkg.devDependencies || {}) };
    const rootDepNames = Object.keys(allRootDeps);

    for (const tool of MONOREPO_TOOLS) {
      // Check dependencies
      if (tool.deps.length > 0 && tool.deps.some(d => rootDepNames.includes(d))) {
        hasMonorepoTool = true;
        detectedTools.push(tool.name);
      }

      // Check config files at root
      for (const file of tool.files) {
        const filePath = path.join(context.rootDir, file);
        if (fs.existsSync(filePath)) {
          hasMonorepoTool = true;
          detectedTools.push(tool.name);

          // Parse turbo.json or nx.json for caching config
          const content = readFileSafely(filePath, 64);
          if (content) {
            if (/cache|outputs|inputs/i.test(content)) hasCaching = true;
            if (/pipeline|targets|tasks/i.test(content)) hasTaskRunner = true;
          }
        }
      }
    }

    // Check for yarn/npm workspaces in root package.json
    const workspaces = rootPkg.workspaces;
    if (workspaces) {
      hasMonorepoTool = true;
      if (!detectedTools.some(t => t.includes('workspace'))) {
        detectedTools.push(workspaces ? `${rootPkg.packageManager?.split('@')[0] || 'npm'} workspaces` : 'workspaces');
      }
    }

    indicators.push({ found: hasMonorepoTool, weight: 0.3 });

    if (!hasMonorepoTool && context.packages.length > 1) {
      items.push({
        type: 'NO_MONOREPO_TOOL',
        severity: 'MEDIUM',
        message: 'Multiple packages detected but no monorepo tool configured',
        impact: 'Without a monorepo tool, packages lack coordinated builds, caching, and dependency management',
        fix: 'Configure Turborepo, Nx, or Lerna to manage your monorepo efficiently',
        confidence: 0.8,
      });
    }

    // 2. Check for shared TypeScript config
    const tsconfigBase = path.join(context.rootDir, 'tsconfig.base.json');
    const tsconfigRoot = path.join(context.rootDir, 'tsconfig.json');

    if (fs.existsSync(tsconfigBase) || fs.existsSync(tsconfigRoot)) {
      hasSharedConfig = true;
    }

    // Check if packages extend a root config
    if (hasMonorepoTool) {
      for (const pkg of context.packages.slice(1)) {
        const pkgTsconfig = path.join(pkg.path, 'tsconfig.json');
        if (fs.existsSync(pkgTsconfig)) {
          const content = readFileSafely(pkgTsconfig, 32);
          if (content && /\.\.\/tsconfig(\.base)?\.json/.test(content)) {
            hasSharedConfig = true;
            break;
          }
        }
      }
    }

    indicators.push({ found: hasSharedConfig, weight: 0.15 });

    if (!hasSharedConfig && context.packages.length > 1) {
      items.push({
        type: 'NO_SHARED_TSCONFIG',
        severity: 'LOW',
        message: 'No shared TypeScript configuration across packages',
        impact: 'Packages may have inconsistent TypeScript settings, leading to type errors across boundaries',
        fix: 'Create a tsconfig.base.json at the root and extend it in each package',
        confidence: 0.5,
      });
    }

    // 3. Check for scripts in each package
    if (hasMonorepoTool) {
      let packagesWithScripts = 0;
      for (const pkg of context.packages) {
        const scripts = pkg.packageJson.scripts || {};
        if (Object.keys(scripts).length > 0) {
          packagesWithScripts++;
        }
      }

      hasPackageScripts = packagesWithScripts === context.packages.length;
      indicators.push({ found: hasPackageScripts, weight: 0.1 });

      if (!hasPackageScripts) {
        const missing = context.packages.length - packagesWithScripts;
        items.push({
          type: 'MISSING_PACKAGE_SCRIPTS',
          severity: 'LOW',
          message: `${missing} package(s) have no npm scripts defined`,
          impact: 'Packages without scripts cannot be easily integrated into monorepo task pipelines',
          fix: 'Add basic scripts (build, test, lint) to each package',
          confidence: 0.4,
        });
      }

      // Check for task runner caching
      if (!hasCaching && (detectedTools.some(t => ['Turborepo', 'Nx'].includes(t)))) {
        items.push({
          type: 'MONOREPO_NO_CACHING',
          severity: 'MEDIUM',
          message: 'Monorepo task caching is not configured',
          impact: 'Without caching, every CI run rebuilds and retests all packages, wasting compute time',
          fix: 'Configure caching in turbo.json (Turborepo) or nx.json (Nx) to skip unchanged package tasks',
          confidence: 0.7,
        });
      }
    }

    // 4. Check for consistent dependency versions across packages
    if (context.packages.length > 1) {
      const depVersions: Record<string, Set<string>> = {};
      for (const pkg of context.packages) {
        const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
        for (const [name, version] of Object.entries(deps)) {
          if (!depVersions[name]) depVersions[name] = new Set();
          depVersions[name].add(String(version));
        }
      }

      const inconsistentDeps = Object.entries(depVersions)
        .filter(([, versions]) => versions.size > 1)
        .slice(0, 5);

      if (inconsistentDeps.length > 0) {
        items.push({
          type: 'INCONSISTENT_DEP_VERSIONS',
          severity: 'LOW',
          message: `${inconsistentDeps.length} dependency(ies) have different versions across packages`,
          impact: 'Inconsistent dependency versions can cause subtle bugs and increase bundle size',
          fix: 'Use consistent dependency versions across the monorepo, or use the root package.json for shared dependencies',
          context: inconsistentDeps.map(([name, versions]) => `${name}: ${[...versions].join(', ')}`).join('; '),
          confidence: 0.5,
        });
      }
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Monorepo configuration looks good'
      : `Found ${items.length} monorepo improvement(s)`;

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
