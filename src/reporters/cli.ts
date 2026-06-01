import { AuditSummary, CheckResult, CheckItem } from '../types';
import { getRiskLabel } from '../utils/scoring';

// =============================================
// Color helpers (no external deps)
// =============================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function green(text: string): string { return `${colors.green}${text}${colors.reset}`; }
function red(text: string): string { return `${colors.red}${text}${colors.reset}`; }
function yellow(text: string): string { return `${colors.yellow}${text}${colors.reset}`; }
function dim(text: string): string { return `${colors.dim}${text}${colors.reset}`; }
function bold(text: string): string { return `${colors.bold}${text}${colors.reset}`; }
function cyan(text: string): string { return `${colors.cyan}${text}${colors.reset}`; }

/**
 * Generate a human-readable CLI audit report.
 */
export function generateCliReport(summary: AuditSummary): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`  ${bold('🚀 ShipReady Production Readiness Audit')}`);
  lines.push(`  ${dim('═'.repeat(56))}`);
  lines.push(`  ${dim('Timestamp:')}    ${summary.timestamp}`);
  lines.push(`  ${dim('Duration:')}     ${summary.durationMs}ms`);
  lines.push('');

  // Risk Score
  const riskLabel = getRiskLabel(summary.riskScore);
  const riskColor = riskLabel === 'CRITICAL' || riskLabel === 'HIGH' ? colors.red :
    riskLabel === 'MEDIUM' ? colors.yellow : colors.green;

  lines.push(`  ${bold('Risk Score:')}  ${riskColor}${bold(String(summary.riskScore))}/10 (${riskLabel})${colors.reset}`);
  lines.push('');

  // Summary bar
  const passText = summary.passed > 0 ? green(`✓ ${summary.passed} passed`) : dim('0 passed');
  const failText = summary.failed > 0 ? red(`✗ ${summary.failed} failed`) : dim('0 failed');
  const warnText = summary.warnings > 0 ? yellow(`⚠ ${summary.warnings} warned`) : dim('0 warned');
  const skipText = summary.skipped > 0 ? dim(`? ${summary.skipped} skipped`) : dim('0 skipped');
  lines.push(`  ${passText}  ${failText}  ${warnText}  ${skipText}`);
  lines.push(`  ${dim('─'.repeat(56))}`);

  // Results by category
  const categories = groupByCategory(summary.results);
  for (const [category, results] of Object.entries(categories)) {
    const catIcon = category === 'security' ? '🔒' : category === 'reliability' ? '🛡️' :
      category === 'performance' ? '⚡' : '🛠️';
    lines.push(`\n  ${bold(`${catIcon} ${capitalize(category)}`)} (${results.length} checks)`);

    for (const result of results) {
      const statusIcon = result.status === 'PASS' ? green('✓') :
        result.status === 'FAIL' ? red('✗') :
        result.status === 'WARN' ? yellow('⚠') : dim('?');
      const statusColor = result.status === 'PASS' ? colors.green :
        result.status === 'FAIL' ? colors.red :
        result.status === 'WARN' ? colors.yellow : colors.dim;

      lines.push(`    ${statusIcon} ${bold(result.check)}`);
      lines.push(`       ${dim(result.summary)}`);
      lines.push(`       ${statusColor}Status: ${result.status}${colors.reset}  ${dim(`Confidence: ${Math.round(result.confidence * 100)}%`)}`);

      // Show first 3 items for failed/warn checks
      if (result.status !== 'PASS' && result.items.length > 0) {
        const shownItems = result.items.slice(0, 3);
        for (const item of shownItems) {
          const sevColor = item.severity === 'CRITICAL' || item.severity === 'HIGH' ? colors.red :
            item.severity === 'MEDIUM' ? colors.yellow : colors.dim;
          lines.push(`       ${sevColor}[${item.severity}]${colors.reset} ${item.message}`);
          if (item.file) {
            lines.push(`       ${dim('File:')} ${item.file}${item.line ? `:${item.line}` : ''}`);
          }
        }
        if (result.items.length > 3) {
          lines.push(`       ${dim(`... and ${result.items.length - 3} more issue(s)`)}`);
        }
      }
      lines.push('');
    }
  }

  // Risk Score breakdown
  if (summary.results.some(r => r.items.length > 0)) {
    lines.push(`  ${bold('📋 Top Findings')}`);
    lines.push(`  ${dim('─'.repeat(56))}`);

    const allItems = summary.results
      .flatMap(r => r.items.map(i => ({ ...i, check: r.check })))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 5);

    for (const item of allItems) {
      const sevColor = item.severity === 'CRITICAL' ? colors.bgRed :
        item.severity === 'HIGH' ? colors.red :
        item.severity === 'MEDIUM' ? colors.yellow : colors.dim;
      lines.push(`  ${sevColor}[${item.severity}]${colors.reset} ${bold((item as any).check)}: ${item.message}`);
      if (item.file) {
        lines.push(`       ${dim('File:')} ${item.file}${item.line ? `:${item.line}` : ''}`);
      }
      lines.push(`       ${dim('Fix:')} ${item.fix.length > 80 ? item.fix.substring(0, 80) + '...' : item.fix}`);
      lines.push('');
    }
  }

  // Footer
  lines.push(`  ${dim('═'.repeat(56))}`);
  const overallStatus = summary.failed > 0 ? red('✗ FAILED') :
    summary.warnings > 0 ? yellow('⚠ WARNINGS') : green('✓ PASSED');
  lines.push(`  ${bold('Overall:')} ${overallStatus}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a single-line summary (for quick display).
 */
export function generateCliSummary(summary: AuditSummary): string {
  const passed = summary.passed > 0 ? green(`✓ ${summary.passed}`) : dim('0');
  const failed = summary.failed > 0 ? red(`✗ ${summary.failed}`) : dim('0');
  const warnings = summary.warnings > 0 ? yellow(`⚠ ${summary.warnings}`) : dim('0');
  const skipped = dim(`? ${summary.skipped}`);
  const risk = getRiskLabel(summary.riskScore);

  return `  ${bold('ShipReady')} — ${passed} ${failed} ${warnings} ${skipped}  ${dim(`Risk: ${summary.riskScore}/${risk}  (${summary.durationMs}ms)`)}`;
}

// =============================================
// Helpers
// =============================================

function groupByCategory(results: CheckResult[]): Record<string, CheckResult[]> {
  const groups: Record<string, CheckResult[]> = {};
  for (const result of results) {
    if (!groups[result.category]) groups[result.category] = [];
    groups[result.category].push(result);
  }
  return groups;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function severityRank(severity: string): number {
  const ranks: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
  return ranks[severity] || 0;
}
