import { AuditSummary, CheckResult, CheckItem } from '../types';
import { getRiskLabel } from '../utils/scoring';

/**
 * JSON reporter output format.
 */
export interface JsonReport {
  meta: {
    tool: string;
    version: string;
    timestamp: string;
    durationMs: number;
  };
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
    riskScore: number;
    riskLabel: string;
    passRate: number;
  };
  results: JsonCheckResult[];
}

interface JsonCheckResult {
  check: string;
  category: string;
  status: string;
  confidence: number;
  summary: string;
  items: JsonCheckItem[];
}

interface JsonCheckItem {
  type: string;
  severity: string;
  message: string;
  impact: string;
  fix: string;
  file?: string;
  line?: number;
  confidence?: number;
  context?: string;
}

/**
 * Generate a JSON-formatted audit report.
 */
export function generateJsonReport(summary: AuditSummary): string {
  const report: JsonReport = {
    meta: {
      tool: 'ShipReady',
      version: '0.1.0',
      timestamp: summary.timestamp,
      durationMs: summary.durationMs,
    },
    summary: {
      totalChecks: summary.totalChecks,
      passed: summary.passed,
      failed: summary.failed,
      warnings: summary.warnings,
      skipped: summary.skipped,
      riskScore: summary.riskScore,
      riskLabel: getRiskLabel(summary.riskScore),
      passRate: summary.totalChecks > 0
        ? Math.round((summary.passed / summary.totalChecks) * 100)
        : 100,
    },
    results: summary.results.map(r => ({
      check: r.check,
      category: r.category,
      status: r.status,
      confidence: r.confidence,
      summary: r.summary,
      items: r.items.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        impact: i.impact,
        fix: i.fix,
        file: i.file,
        line: i.line,
        confidence: i.confidence,
        context: i.context,
      })),
    })),
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Parse a JSON report string back into a JsonReport object.
 */
export function parseJsonReport(json: string): JsonReport {
  return JSON.parse(json) as JsonReport;
}
