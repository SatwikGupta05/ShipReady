import { calculateRiskScore, calculateConfidence, determineCheckStatus, getRiskLabel } from '../../src/utils/scoring';
import { DEFAULT_CONFIG } from '../../src/types';

describe('calculateRiskScore', () => {
  it('returns 0 for empty results', () => {
    expect(calculateRiskScore([])).toBe(0);
  });

  it('returns 0 when all items pass', () => {
    const results = [{
      check: 'test',
      status: 'PASS' as const,
      confidence: 1,
      items: [],
      summary: 'All good',
      category: 'security' as const,
    }];
    expect(calculateRiskScore(results)).toBe(0);
  });
});

describe('calculateConfidence', () => {
  it('returns 0 for empty indicators', () => {
    expect(calculateConfidence([])).toBe(0);
  });

  it('returns 0.5 when half the indicators are found', () => {
    const indicators = [
      { found: true, weight: 1 },
      { found: false, weight: 1 },
    ];
    expect(calculateConfidence(indicators)).toBe(0.5);
  });
});

describe('determineCheckStatus', () => {
  it('returns PASS for empty items', () => {
    const result = determineCheckStatus([], DEFAULT_CONFIG.severity);
    expect(result.status).toBe('PASS');
  });
});

describe('getRiskLabel', () => {
  it('returns CRITICAL for scores >= 8', () => {
    expect(getRiskLabel(8)).toBe('CRITICAL');
    expect(getRiskLabel(9.5)).toBe('CRITICAL');
  });

  it('returns MINIMAL for scores < 2', () => {
    expect(getRiskLabel(0)).toBe('MINIMAL');
    expect(getRiskLabel(1)).toBe('MINIMAL');
  });
});
