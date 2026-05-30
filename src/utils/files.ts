import fs from 'fs';
import path from 'path';

/**
 * Default directories and files to ignore when walking.
 */
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

const DEFAULT_IGNORE_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

/**
 * Ignore patterns used by check plugins when collecting files to scan.
 * More restrictive than general walkFiles since checks need to be fast.
 */
const CHECK_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
]);

/**
 * Safely read a file, returning null on error or if file exceeds size limit.
 *
 * @param filePath - Path to the file
 * @param maxSizeKB - Maximum file size in KB (default: 1024 = 1MB)
 */
export function readFileSafely(filePath: string, maxSizeKB: number = 1024): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxSizeKB * 1024) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Recursively collect files matching given extensions from one or more directories.
 * Skips hidden dirs, node_modules, dist, build, etc.
 *
 * @param dirs - Directories to scan
 * @param extensions - File extensions to include (e.g., ['.js', '.ts'])
 * @param options - Additional options
 * @param options.maxFiles - Maximum files to collect (default: 5000)
 * @param options.maxDepth - Maximum recursion depth (default: 10)
 * @param options.extraIgnoreDirs - Additional directory names to skip
 * @param options.extraIncludeNames - Basenames to include regardless of extension
 */
export function collectFilesByExtension(
  dirs: string[],
  extensions: string[],
  options?: {
    maxFiles?: number;
    maxDepth?: number;
    extraIgnoreDirs?: string[];
    extraIncludeNames?: string[];
  }
): string[] {
  const extensionSet = new Set(extensions.map(e => e.toLowerCase()));
  const files: string[] = [];
  const seen = new Set<string>();
  const maxFiles = options?.maxFiles ?? 5000;
  const maxDepth = options?.maxDepth ?? 10;
  const extraIgnoreDirs = new Set(options?.extraIgnoreDirs ?? []);
  const extraIncludeNames = new Set(
    (options?.extraIncludeNames ?? []).map(n => n.toLowerCase())
  );

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    collectRecursive(dir, files, seen, extensionSet, extraIgnoreDirs, extraIncludeNames, maxFiles, maxDepth, 0);
  }

  return files;
}

/**
 * Recursively walk a directory collecting matching files.
 */
function collectRecursive(
  dir: string,
  files: string[],
  seen: Set<string>,
  extensions: Set<string>,
  extraIgnoreDirs: Set<string>,
  extraIncludeNames: Set<string>,
  maxFiles: number,
  maxDepth: number,
  depth: number
): void {
  if (depth > maxDepth || files.length >= maxFiles) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        entry.name.startsWith('.') ||
        CHECK_IGNORE_DIRS.has(entry.name) ||
        extraIgnoreDirs.has(entry.name)
      ) {
        continue;
      }
      collectRecursive(fullPath, files, seen, extensions, extraIgnoreDirs, extraIncludeNames, maxFiles, maxDepth, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const basename = entry.name.toLowerCase();
      if (
        (extensions.has(ext) || extraIncludeNames.has(basename)) &&
        !seen.has(fullPath)
      ) {
        seen.add(fullPath);
        files.push(fullPath);
      }
    }
  }
}

/**
 * Walk a directory and return all source files.
 * Respects .gitignore patterns (basic support) and default ignore list.
 *
 * @param rootDir - Directory to scan
 * @param extensions - File extensions to include (e.g., ['.js', '.ts', '.jsx', '.tsx'])
 * @param maxFiles - Maximum number of files to return (prevents memory issues)
 */
export function walkFiles(
  rootDir: string,
  extensions: string[] = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
  maxFiles: number = 10000
): string[] {
  const files: string[] = [];
  const gitignorePatterns = loadGitignore(rootDir);

  walkSync(rootDir, rootDir, files, extensions, maxFiles, gitignorePatterns);

  return files;
}

/**
 * Synchronous directory walker.
 */
function walkSync(
  baseDir: string,
  currentDir: string,
  files: string[],
  extensions: string[],
  maxFiles: number,
  gitignorePatterns: string[]
): void {
  if (files.length >= maxFiles) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (files.length >= maxFiles) return;

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (isIgnored(entry, relativePath, gitignorePatterns)) continue;

    if (entry.isDirectory()) {
      walkSync(baseDir, fullPath, files, extensions, maxFiles, gitignorePatterns);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.length === 0 || extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
}

/**
 * Check if a file or directory should be ignored.
 */
function isIgnored(
  entry: fs.Dirent,
  relativePath: string,
  gitignorePatterns: string[]
): boolean {
  const name = entry.name;

  if (entry.isDirectory() && DEFAULT_IGNORE_DIRS.has(name)) {
    return true;
  }

  if (entry.isFile() && DEFAULT_IGNORE_FILES.has(name)) {
    return true;
  }

  for (const pattern of gitignorePatterns) {
    if (matchesGitignorePattern(relativePath, pattern)) {
      return true;
    }
  }

  if (entry.isDirectory() && name.startsWith('.')) {
    return true;
  }

  return false;
}

/**
 * Load .gitignore patterns from the root directory.
 */
function loadGitignore(rootDir: string): string[] {
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];

  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
  } catch {
    return [];
  }
}

/**
 * Simple .gitignore pattern matching.
 * Supports basic glob patterns (**, *).
 */
function matchesGitignorePattern(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  if (normalizedPath === normalizedPattern) return true;

  if (normalizedPattern.endsWith('/') && normalizedPath.startsWith(normalizedPattern)) {
    return true;
  }

  if (normalizedPattern.includes('*')) {
    const regexStr = normalizedPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '(.+/)?.+')
      .replace(/\*/g, '[^/]*');
    try {
      const regex = new RegExp(`^${regexStr}$`);
      return regex.test(normalizedPath);
    } catch {
      return false;
    }
  }

  if (normalizedPath.startsWith(normalizedPattern)) return true;

  return false;
}
