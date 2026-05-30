import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ShipReadyConfig, DEFAULT_CONFIG } from './types';

/**
 * Load configuration from a .shipready.yml file.
 * Searches in the following order:
 * 1. Explicit config path passed by the user
 * 2. .shipready.yml in the project root
 * 3. Default configuration
 */
export function loadConfig(configPath?: string): ShipReadyConfig {
  if (configPath) {
    const resolvedPath = path.resolve(configPath);
    if (fs.existsSync(resolvedPath)) {
      return parseConfigFile(resolvedPath);
    }
    console.warn(`[WARN] Config file not found: ${configPath}. Using defaults.`);
    return { ...DEFAULT_CONFIG };
  }

  // Search for .shipready.yml in current and parent directories
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (true) {
    const ymlPath = path.join(currentDir, '.shipready.yml');
    const yamlPath = path.join(currentDir, '.shipready.yaml');
    
    if (fs.existsSync(ymlPath)) {
      return parseConfigFile(ymlPath);
    }
    if (fs.existsSync(yamlPath)) {
      return parseConfigFile(yamlPath);
    }

    if (currentDir === root) break;
    currentDir = path.dirname(currentDir);
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Parse a YAML config file and merge with defaults.
 */
function parseConfigFile(filePath: string): ShipReadyConfig {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const rawParsed = yaml.load(raw);
    const parsed = (rawParsed ? rawParsed : {}) as Partial<ShipReadyConfig>;

    // Deep merge with defaults
    const config: ShipReadyConfig = deepMerge(DEFAULT_CONFIG, parsed);

    // Normalize check names and merge with defaults
    if (parsed.checks) {
      const normalized = normalizeCheckKeys(parsed.checks as Record<string, boolean>);
      for (const [key, value] of Object.entries(normalized)) {
        config.checks[key] = value;
      }
    }

    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[WARN] Failed to parse config file: ${message}. Using defaults.`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Deep merge two objects (mutates the target).
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const val = source[key as keyof typeof source];
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !Array.isArray(val)) {
        result[key as keyof T] = deepMerge(
          result[key as keyof T] || {},
          val as Record<string, any>
        ) as any;
      } else {
        result[key as keyof T] = val as any;
      }
    }
  }

  return result;
}

/**
 * Normalize check config keys (camelCase to camelCase).
 * In the future, could also handle kebab-case -> camelCase mapping.
 */
function normalizeCheckKeys(checks: Record<string, boolean>): Record<string, boolean> {
  const normalized: Record<string, boolean> = {};
  const keyMap: Record<string, string> = {
    'rate-limit': 'rateLimit',
    'rate_limit': 'rateLimit',
    'sql-injection': 'sqlInjection',
    'sql_injection': 'sqlInjection',
    'load-balancer': 'loadBalancer',
    'load_balancer': 'loadBalancer',
    'file-upload': 'fileUpload',
    'file_upload': 'fileUpload',
  };

  for (const [key, value] of Object.entries(checks)) {
    normalized[keyMap[key] || key] = value;
  }

  return normalized;
}

export { parseConfigFile, deepMerge };
