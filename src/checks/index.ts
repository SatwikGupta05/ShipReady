import { ShipReadyCheck } from '../types';

/**
 * Registry of all available checks.
 * Checks are progressively added in upcoming commits.
 */

const checkRegistry = new Map<string, ShipReadyCheck>();

/**
 * Register a check in the registry.
 */
export function registerCheck(check: ShipReadyCheck): void {
  checkRegistry.set(check.name, check);
}

/**
 * Get a check by name.
 */
export function getCheck(name: string): ShipReadyCheck | undefined {
  return checkRegistry.get(name);
}

/**
 * Get all registered checks, optionally filtered by language support.
 */
export function getAllChecks(language?: string): ShipReadyCheck[] {
  const checks = Array.from(checkRegistry.values());
  if (language) {
    return checks.filter(c => c.supportedLanguages.includes(language as any));
  }
  return checks;
}

/**
 * Get enabled checks based on config.
 */
export function getEnabledChecks(
  enabledChecks: Record<string, boolean>,
  language?: string
): ShipReadyCheck[] {
  return getAllChecks(language).filter(check => {
    return enabledChecks[check.name] !== false;
  });
}

/**
 * Initialize the check registry.
 * Check implementations will be registered in upcoming commits
 * as they are added to the project.
 */
export function initializeChecks(): void {
  // Future check registrations will go here:
  // e.g. registerCheck(new SecretsCheck());
  // e.g. registerCheck(new CorsCheck());
}
