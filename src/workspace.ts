import fs from 'fs';
import path from 'path';
import { WorkspacePackage } from './types';

/**
 * Detect all packages in a workspace (monorepo support).
 *
 * - Auto-detects pnpm/npm/yarn workspaces from root package.json or pnpm-workspace.yaml
 * - Returns the root as a single package if no workspace is detected
 * - Falls back gracefully for non-monorepo projects
 */
export async function detectWorkspaces(rootDir: string): Promise<WorkspacePackage[]> {
  const rootPkgPath = path.join(rootDir, 'package.json');

  if (!fs.existsSync(rootPkgPath)) {
    // No package.json at all — scan subdirectories for packages
    const subPackages = scanImmediateSubdirs(rootDir);
    if (subPackages.length > 0) {
      return subPackages;
    }
    // Fallback: treat the directory itself as a package
    return [createRootPackage(rootDir)];
  }

  const rootPkg = readJsonFile(rootPkgPath);
  if (!rootPkg) {
    return [createRootPackage(rootDir)];
  }

  // Priority 1: pnpm workspace (pnpm-workspace.yaml)
  const pnpmPackages = detectPnpmWorkspace(rootDir);
  if (pnpmPackages.length > 0) {
    return pnpmPackages;
  }

  // Priority 2: npm/yarn workspaces (package.json workspaces field)
  const npmPackages = detectNpmWorkspaces(rootDir, rootPkg);
  if (npmPackages.length > 0) {
    return npmPackages;
  }

  // No workspace detected — scan immediate subdirectories for packages
  const subPackages = scanImmediateSubdirs(rootDir);
  const rootPackage: WorkspacePackage = {
    name: rootPkg.name || path.basename(rootDir),
    path: rootDir,
    relativePath: '.',
    packageJson: rootPkg,
  };
  if (subPackages.length > 0) {
    return [rootPackage, ...subPackages];
  }
  return [rootPackage];
}

/**
 * Create a fallback root package entry.
 */
function createRootPackage(rootDir: string): WorkspacePackage {
  return {
    name: path.basename(rootDir),
    path: rootDir,
    relativePath: '.',
    packageJson: {},
  };
}

/**
 * Detect packages from pnpm-workspace.yaml.
 */
function detectPnpmWorkspace(rootDir: string): WorkspacePackage[] {
  const yamlPath = path.join(rootDir, 'pnpm-workspace.yaml');
  const ymlPath = path.join(rootDir, 'pnpm-workspace.yml');

  let filePath: string | null = null;
  if (fs.existsSync(yamlPath)) filePath = yamlPath;
  else if (fs.existsSync(ymlPath)) filePath = ymlPath;

  if (!filePath) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const patterns = parsePnpmWorkspaceYaml(content);

    if (patterns.length === 0) return [];

    return findMatchingPackages(rootDir, patterns);
  } catch {
    return [];
  }
}

/**
 * Parse a simple pnpm-workspace.yaml to extract package patterns.
 */
function parsePnpmWorkspaceYaml(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split('\n');
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      if (trimmed.startsWith('- ')) {
        patterns.push(trimmed.slice(2).trim());
      } else if (trimmed.startsWith('-')) {
        patterns.push(trimmed.slice(1).trim());
      } else if (!trimmed.startsWith('#') && trimmed !== '') {
        inPackages = false;
      }
    }
  }

  return patterns;
}

/**
 * Detect packages from npm/yarn workspaces defined in package.json.
 */
function detectNpmWorkspaces(rootDir: string, rootPkg: Record<string, any>): WorkspacePackage[] {
  const workspaces = rootPkg.workspaces;
  if (!workspaces) return [];

  const patterns: string[] = Array.isArray(workspaces)
    ? workspaces
    : workspaces.packages || [];

  if (patterns.length === 0) return [];

  return findMatchingPackages(rootDir, patterns);
}

/**
 * Given glob-like patterns (e.g., "packages/*"), find all matching package directories.
 */
function findMatchingPackages(rootDir: string, patterns: string[]): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];

  for (const pattern of patterns) {
    const basePattern = pattern.replace(/\*+/g, '').replace(/\/$/, '');
    const baseDir = path.join(rootDir, basePattern);

    if (!fs.existsSync(baseDir)) continue;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const isDeep = pattern.includes('**');

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const pkgPath = path.join(baseDir, entry.name);
        const pkgJsonPath = path.join(pkgPath, 'package.json');

        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = readJsonFile(pkgJsonPath);
          packages.push({
            name: pkgJson?.name || entry.name,
            path: pkgPath,
            relativePath: path.relative(rootDir, pkgPath),
            packageJson: pkgJson || {},
          });
        } else if (isDeep) {
          const subPackages = scanDeep(rootDir, pkgPath);
          packages.push(...subPackages);
        }
      }
    }
  }

  // Deduplicate by path
  const seen = new Set<string>();
  return packages.filter(pkg => {
    if (seen.has(pkg.path)) return false;
    seen.add(pkg.path);
    return true;
  });
}

/**
 * Recursively scan directories for package.json files.
 */
function scanDeep(rootDir: string, dir: string): WorkspacePackage[] {
  const results: WorkspacePackage[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      const subPath = path.join(dir, entry.name);
      const pkgJsonPath = path.join(subPath, 'package.json');

      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = readJsonFile(pkgJsonPath);
        results.push({
          name: pkgJson?.name || entry.name,
          path: subPath,
          relativePath: path.relative(rootDir, subPath),
          packageJson: pkgJson || {},
        });
      }

      // Recurse (one level deep)
      const deeper = scanDeep(rootDir, subPath);
      results.push(...deeper);
    }
  } catch {
    // Permission denied or other error, skip this directory
  }

  return results;
}

/**
 * Scan immediate subdirectories for package.json files.
 * Used as a fallback when no workspace is detected.
 */
function scanImmediateSubdirs(rootDir: string): WorkspacePackage[] {
  const results: WorkspacePackage[] = [];
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const pkgJsonPath = path.join(rootDir, entry.name, 'package.json');
      const reqTxtPath = path.join(rootDir, entry.name, 'requirements.txt');

      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = readJsonFile(pkgJsonPath);
        if (pkgJson) {
          results.push({
            name: pkgJson.name || entry.name,
            path: path.join(rootDir, entry.name),
            relativePath: entry.name,
            packageJson: pkgJson,
          });
        }
        continue;
      }

      if (fs.existsSync(reqTxtPath)) {
        try {
          const content = fs.readFileSync(reqTxtPath, 'utf-8');
          const pythonDeps: Record<string, string> = {};
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
            const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)/);
            if (match) {
              const depName = match[1].replace(/-/g, '_').toLowerCase();
              pythonDeps[depName] = '*';
            }
          }
          results.push({
            name: entry.name,
            path: path.join(rootDir, entry.name),
            relativePath: entry.name,
            packageJson: { dependencies: pythonDeps },
          });
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* skip unreadable directories */ }
  return results;
}

/**
 * Safely read and parse a JSON file.
 */
function readJsonFile(filePath: string): Record<string, any> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
