import path from 'path';
import fs from 'fs';
import { AuditContext, CheckResult, ShipReadyCheck, AuditSummary, ShipReadyConfig } from './types';
import { initializeChecks, getEnabledChecks } from './checks';
import { detectWorkspaces } from './workspace';
import { loadConfig } from './config';
import { calculateRiskScore } from './utils/scoring';
import { walkFiles } from './utils/files';
import { runFixer } from './fixer';

export interface AuditOptions {
  dir?: string;
  configPath?: string;
  format?: 'human' | 'json' | 'html';
  strict?: boolean;
  fix?: boolean;
  /** Called as each check completes — useful for progress displays */
  onProgress?: (completed: number, total: number, checkName: string, status: string) => void;
}

/**
 * Run a complete audit on the specified project.
 *
 * Orchestrates:
 * 1. Config loading
 * 2. Workspace detection (monorepo support)
 * 3. File collection
 * 4. Check execution (in parallel)
 * 5. Result aggregation and scoring
 */
export async function runAudit(options: AuditOptions = {}): Promise<AuditSummary> {
  const startTime = Date.now();
  const rootDir = options.dir ? path.resolve(options.dir) : process.cwd();

  // 1. Load configuration
  const config = loadConfig(options.configPath);

  // Apply strict mode: fail on MEDIUM issues too
  if (options.strict) {
    config.severity.fail = ['CRITICAL', 'HIGH', 'MEDIUM'];
    config.severity.warn = ['LOW'];
  }

  // 2. Detect workspace packages (monorepo support)
  const packages = await detectWorkspaces(rootDir);

  // 3. Initialize check registry
  initializeChecks();

  // 4. Collect source files
  const files = walkFiles(rootDir);

  // 5. Auto-detect project language
  const language = detectLanguage(rootDir, packages);

  // 6. Auto-detect project type if not explicitly configured
  if (!config.project.type || config.project.type === 'fullstack') {
    const detectedType = detectProjectType(packages, rootDir);
    if (detectedType) {
      config.project.type = detectedType;
    }
  }

  // 7. Get enabled checks
  const enabledChecks = getEnabledChecks(config.checks, language);

  // 8. Build audit context
  const context: AuditContext = {
    rootDir,
    config,
    packages,
    files,
    language,
  };

  // 9. Run all checks in parallel with progress tracking
  let completedCount = 0;
  const totalCount = enabledChecks.length;

  const results = await Promise.all(
    enabledChecks.map(async (check) => {
      // Fast relevance check — skip irrelevant checks immediately
      if (check.isRelevant && !check.isRelevant(context)) {
        const result = {
          check: check.name,
          status: 'SKIP' as const,
          confidence: 0,
          items: [],
          summary: `Skipped — no ${check.category} infrastructure detected in project`,
          category: check.category,
        };
        completedCount++;
        options.onProgress?.(completedCount, totalCount, check.name, result.status);
        return result;
      }
      try {
        const result = await check.run(context);
        completedCount++;
        options.onProgress?.(completedCount, totalCount, check.name, result.status);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result = {
          check: check.name,
          status: 'FAIL' as const,
          confidence: 0,
          items: [{
            type: 'CHECK_ERROR',
            severity: 'HIGH' as const,
            message: `Check crashed: ${message}`,
            impact: 'This check failed to complete',
            fix: 'Check the error logs and fix the check implementation',
          }],
          summary: `Error: ${message}`,
          category: check.category,
        };
        completedCount++;
        options.onProgress?.(completedCount, totalCount, check.name, result.status);
        return result;
      }
    })
  );

  // 10. Aggregate results
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  const riskScore = calculateRiskScore(results);

  const summary: AuditSummary = {
    totalChecks: results.length,
    passed,
    failed,
    warnings,
    skipped,
    riskScore,
    results,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  // 11. Run auto-fix if requested
  if (options.fix) {
    const fixerContext: AuditContext = {
      rootDir,
      config,
      packages,
      files,
      language,
    };
    const fixResults = await runFixer(results, fixerContext);
    const fixed = fixResults.filter(r => r.success).length;
    const failed = fixResults.filter(r => !r.success).length;
    console.log(`\n  🔧 Auto-Fix: ${fixed} fixed, ${failed} unfixable`);
  }

  return summary;
}

/**
 * Helper: read all package.json deps from immediate subdirectories.
 */
function scanSubdirectoryDeps(rootDir: string, frontendDeps: string[], backendDeps: string[]): { hasFrontend: boolean; hasBackend: boolean } {
  let hasFrontend = false;
  let hasBackend = false;

  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const pkgJsonPath = path.join(rootDir, entry.name, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;
      try {
        const subPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const subDeps = { ...(subPkg.dependencies || {}), ...(subPkg.devDependencies || {}) };
        for (const dep of Object.keys(subDeps)) {
          if (!hasFrontend && frontendDeps.includes(dep)) hasFrontend = true;
          if (!hasBackend && backendDeps.includes(dep)) hasBackend = true;
          if (hasFrontend && hasBackend) break;
        }
      } catch { /* skip unparseable */ }
      if (hasFrontend && hasBackend) break;
    }
  } catch { /* skip unreadable directories */ }

  return { hasFrontend, hasBackend };
}

/**
 * Detect project type (frontend / api / fullstack) from dependencies.
 */
function detectProjectType(packages: any[], rootDir: string): 'frontend' | 'api' | 'fullstack' | null {
  let hasFrontendFramework = false;
  let hasBackendFramework = false;

  const frontendDeps = ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'gatsby', 'remix', 'solid-js', 'preact'];
  const backendDeps = ['express', 'fastify', 'koa', 'hapi', 'nest', 'django', 'flask', 'fastapi', 'gin', 'echo', 'actix'];

  // Check workspace packages first
  for (const pkg of packages) {
    const deps = { ...(pkg.packageJson.dependencies || {}) };
    const allDeps = Object.keys(deps);

    for (const dep of allDeps) {
      if (frontendDeps.includes(dep)) hasFrontendFramework = true;
      if (backendDeps.includes(dep)) hasBackendFramework = true;
    }
  }

  // Scan immediate subdirectories
  const subDirs = scanSubdirectoryDeps(rootDir, frontendDeps, backendDeps);
  if (subDirs.hasFrontend) hasFrontendFramework = true;
  if (subDirs.hasBackend) hasBackendFramework = true;

  // Check for common frontend config files as a fallback
  if (!hasFrontendFramework) {
    const frontendConfigFiles = [
      'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
      'next.config.js', 'next.config.mjs', 'next.config.ts',
      'angular.json', 'svelte.config.js', 'svelte.config.ts',
      'vue.config.js', 'nuxt.config.ts', 'nuxt.config.js',
      'webpack.config.js', 'webpack.config.ts',
      '.parcelrc', 'snowpack.config.js', 'astro.config.mjs',
    ];
    for (const cfg of frontendConfigFiles) {
      if (fs.existsSync(path.join(rootDir, cfg))) {
        hasFrontendFramework = true;
        break;
      }
    }
    if (!hasFrontendFramework) {
      for (const subDir of ['frontend', 'client', 'app', 'web', 'ui', 'src']) {
        for (const cfg of frontendConfigFiles) {
          if (fs.existsSync(path.join(rootDir, subDir, cfg))) {
            hasFrontendFramework = true;
            break;
          }
        }
        if (hasFrontendFramework) break;
      }
    }
  }

  if (hasFrontendFramework && hasBackendFramework) return 'fullstack';
  if (hasFrontendFramework) return 'frontend';
  if (hasBackendFramework) return 'api';

  if (packages.some(p => {
    const deps = Object.keys(p.packageJson.dependencies || {});
    return deps.some(d => /^(body-parser|cors|helmet|passport|jsonwebtoken|socket\.io)$/i.test(d));
  })) return 'api';

  return null;
}

/**
 * Detect the primary programming language of the project.
 */
function detectLanguage(rootDir: string, packages: any[]): 'node' | 'python' | 'go' | 'java' | 'rust' {
  for (const pkg of packages) {
    const pkgPath = pkg.path || rootDir;

    if (fs.existsSync(path.join(pkgPath, 'package.json'))) return 'node';
    if (fs.existsSync(path.join(pkgPath, 'requirements.txt')) ||
        fs.existsSync(path.join(pkgPath, 'Pipfile')) ||
        fs.existsSync(path.join(pkgPath, 'pyproject.toml'))) return 'python';
    if (fs.existsSync(path.join(pkgPath, 'go.mod'))) return 'go';
    if (fs.existsSync(path.join(pkgPath, 'pom.xml')) ||
        fs.existsSync(path.join(pkgPath, 'build.gradle'))) return 'java';
    if (fs.existsSync(path.join(pkgPath, 'Cargo.toml'))) return 'rust';
  }

  return 'node';
}

export { loadConfig, detectWorkspaces };
