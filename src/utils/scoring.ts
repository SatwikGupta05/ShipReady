import { Severity, CheckResult, CheckItem } from '../types';

/**
 * Severity weights used for risk score calculation.
 */
const SEVERITY_WEIGHTS: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 7,
  MEDIUM: 4,
  LOW: 1,
  INFO: 0,
};

/**
 * Calculate an overall risk score on a 0-10 scale.
 *
 * Formula:
 * - Sum weighted scores (severity weight × confidence) for each item
 * - Normalize against maximum possible score
 * - Return a 0-10 value
 */
export function calculateRiskScore(results: CheckResult[]): number {
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  if (totalItems === 0) return 0;

  const weightedScore = results.reduce((sum, r) => {
    return sum + r.items.reduce((itemSum: number, item: CheckItem) => {
      const weight = SEVERITY_WEIGHTS[item.severity] || 0;
      const confidence = item.confidence ?? 0.5;
      return itemSum + weight * confidence;
    }, 0);
  }, 0);

  // Max possible: all items at CRITICAL (10) with confidence 1.0
  const maxPossibleScore = totalItems * 10 * 1.0;

  if (maxPossibleScore === 0) return 0;

  // Normalize to 0-10 scale
  const rawScore = (weightedScore / maxPossibleScore) * 10;
  return Math.round(Math.min(rawScore, 10) * 10) / 10;
}

/**
 * Calculate confidence score from a set of boolean indicators with weights.
 *
 * @param indicators - Array of { found: boolean, weight: number } indicators
 * @returns confidence score between 0 and 1
 */
export function calculateConfidence(
  indicators: Array<{ found: boolean; weight: number }>
): number {
  const totalWeight = indicators.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) return 0;

  const foundWeight = indicators
    .filter(i => i.found)
    .reduce((sum, i) => sum + i.weight, 0);

  return Math.round((foundWeight / totalWeight) * 100) / 100;
}

/**
 * Determine overall check status based on items present and severity thresholds.
 */
export function determineCheckStatus(
  items: CheckItem[],
  config: { fail: Severity[]; warn: Severity[]; pass: Severity[] }
): { status: 'FAIL' | 'WARN' | 'PASS'; items: CheckItem[] } {
  if (items.length === 0) {
    return { status: 'PASS', items };
  }

  const failSeverities = new Set(config.fail);
  const warnSeverities = new Set(config.warn);

  const hasFail = items.some(item => failSeverities.has(item.severity));
  if (hasFail) {
    return { status: 'FAIL', items };
  }

  const hasWarn = items.some(item => warnSeverities.has(item.severity));
  if (hasWarn) {
    return { status: 'WARN', items };
  }

  return { status: 'PASS', items };
}

/**
 * Get a human-readable label for a risk score.
 */
export function getRiskLabel(score: number): string {
  if (score >= 8) return 'CRITICAL';
  if (score >= 6) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  if (score >= 2) return 'LOW';
  return 'MINIMAL';
}
