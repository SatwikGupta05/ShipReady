import { ShipReadyCheck } from '../types';
import { SecretsCheck } from './secrets';
import { CorsCheck } from './cors';
import { AuthCheck } from './auth';
import { SqlInjectionCheck } from './sqlInjection';
import { SessionCheck } from './session';
import { FileUploadCheck } from './fileUpload';
import { ValidationCheck } from './validation';
import { SanitizationCheck } from './sanitization';
import { HttpsCheck } from './https';
import { RlsCheck } from './rls';
import { DockerCheck } from './docker';
import { EnvCheck } from './env';
import { RateLimitCheck } from './rateLimit';
import { ErrorsCheck } from './errors';
import { LoggingCheck } from './logging';
import { DependencyCheck } from './dependencyCheck';
import { CachingCheck } from './caching';
import { LoadBalancerCheck } from './loadBalancer';
import { BackupCheck } from './backup';
import { CiCdCheck } from './cicd';
import { MonorepoCheck } from './monorepo';

/**
 * Registry of all available checks.
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
 * Initialize the check registry with all available checks.
 */
export function initializeChecks(): void {
  registerCheck(new SecretsCheck());
  registerCheck(new CorsCheck());
  registerCheck(new AuthCheck());
  registerCheck(new SqlInjectionCheck());
  registerCheck(new SessionCheck());
  registerCheck(new FileUploadCheck());
  registerCheck(new ValidationCheck());
  registerCheck(new SanitizationCheck());
  registerCheck(new HttpsCheck());
  registerCheck(new RlsCheck());
  registerCheck(new DockerCheck());
  registerCheck(new EnvCheck());
  registerCheck(new RateLimitCheck());
  registerCheck(new ErrorsCheck());
  registerCheck(new LoggingCheck());
  registerCheck(new DependencyCheck());
  registerCheck(new CachingCheck());
  registerCheck(new LoadBalancerCheck());
  registerCheck(new BackupCheck());
  registerCheck(new CiCdCheck());
  registerCheck(new MonorepoCheck());
}
