import { AuditSummary, CheckResult, CheckItem } from '../types';
import { getRiskLabel } from '../utils/scoring';

/**
 * Generate an HTML-formatted audit report with dark theme and risk gauge.
 */
export function generateHtmlReport(summary: AuditSummary): string {
  const riskLabel = getRiskLabel(summary.riskScore);
  const riskColor = getRiskColor(summary.riskScore);
  const gaugeAngle = (summary.riskScore / 10) * 180; // 0-180 degrees

  const resultsByCategory = groupByCategory(summary.results);
  const categoryOrder = ['security', 'ops', 'performance', 'reliability'];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShipReady Audit Report</title>
  <style>
    /* Reset & Base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0f1117;
      color: #e1e4e8;
      line-height: 1.6;
      padding: 0;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 40px 24px; }

    /* Header */
    .header {
      text-align: center;
      padding: 48px 24px;
      background: linear-gradient(135deg, #161b22 0%, #0d1117 100%);
      border-bottom: 1px solid #21262d;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      color: #f0f6fc;
      margin-bottom: 8px;
    }
    .header h1 span { color: #58a6ff; }
    .header .subtitle { color: #8b949e; font-size: 14px; }
    .header .meta { color: #6e7681; font-size: 12px; margin-top: 4px; }

    /* Risk Gauge */
    .gauge-container {
      display: flex;
      justify-content: center;
      margin: 32px 0;
    }
    .gauge {
      width: 200px;
      height: 100px;
      position: relative;
      overflow: hidden;
    }
    .gauge-bg {
      width: 200px;
      height: 100px;
      background: conic-gradient(
        #238636 0deg,
        #238636 36deg,
        #d29922 36deg,
        #d29922 90deg,
        #f85149 90deg,
        #f85149 180deg
      );
      border-radius: 100px 100px 0 0;
      position: absolute;
      top: 0;
    }
    .gauge-cover {
      width: 140px;
      height: 70px;
      background: #0f1117;
      border-radius: 70px 70px 0 0;
      position: absolute;
      bottom: 0;
      left: 30px;
    }
    .gauge-needle {
      width: 4px;
      height: 80px;
      background: #f0f6fc;
      position: absolute;
      bottom: 0;
      left: 98px;
      transform-origin: bottom center;
      transform: rotate(${gaugeAngle - 90}deg);
      transition: transform 1s ease;
      border-radius: 2px;
      z-index: 2;
    }
    .gauge-needle::after {
      content: '';
      width: 12px;
      height: 12px;
      background: #f0f6fc;
      border-radius: 50%;
      position: absolute;
      top: -6px;
      left: -4px;
    }
    .gauge-labels {
      display: flex;
      justify-content: space-between;
      width: 200px;
      margin: 4px auto 0;
      padding: 0 8px;
    }
    .gauge-labels span { font-size: 10px; color: #6e7681; }

    /* Risk Score Display */
    .risk-score {
      text-align: center;
      margin: 16px 0 32px;
    }
    .risk-score .score {
      font-size: 48px;
      font-weight: 800;
      color: ${riskColor};
    }
    .risk-score .label {
      font-size: 20px;
      font-weight: 600;
      color: ${riskColor};
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-left: 12px;
    }

    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .summary-card .number {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .summary-card .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #8b949e;
    }
    .card-pass .number { color: #3fb950; }
    .card-fail .number { color: #f85149; }
    .card-warn .number { color: #d29922; }
    .card-skip .number { color: #6e7681; }

    /* Category Sections */
    .category { margin-bottom: 24px; }
    .category h2 {
      font-size: 18px;
      font-weight: 600;
      color: #f0f6fc;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #21262d;
    }

    /* Check Result Cards */
    .check-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .check-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      cursor: pointer;
      user-select: none;
    }
    .check-header:hover { background: #1c2128; }
    .check-status {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }
    .status-PASS { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
    .status-FAIL { background: rgba(248, 81, 73, 0.15); color: #f85149; }
    .status-WARN { background: rgba(210, 153, 34, 0.15); color: #d29922; }
    .status-SKIP { background: rgba(110, 118, 129, 0.15); color: #6e7681; }
    .check-name { font-weight: 600; color: #f0f6fc; flex: 1; }
    .check-confidence { font-size: 12px; color: #6e7681; }
    .check-summary { font-size: 13px; color: #8b949e; padding: 0 16px 12px; }
    .check-arrow { color: #6e7681; transition: transform 0.2s; }
    .check-arrow.open { transform: rotate(180deg); }

    /* Items */
    .check-items { display: none; }
    .check-items.open { display: block; }
    .check-item {
      padding: 12px 16px 12px 60px;
      border-top: 1px solid #21262d;
    }
    .item-severity {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .sev-CRITICAL { background: rgba(248, 81, 73, 0.2); color: #f85149; }
    .sev-HIGH { background: rgba(248, 81, 73, 0.12); color: #f85149; }
    .sev-MEDIUM { background: rgba(210, 153, 34, 0.15); color: #d29922; }
    .sev-LOW { background: rgba(139, 148, 158, 0.15); color: #8b949e; }
    .sev-INFO { background: rgba(88, 166, 255, 0.15); color: #58a6ff; }
    .item-message { font-size: 14px; color: #e1e4e8; margin: 4px 0; }
    .item-impact { font-size: 12px; color: #8b949e; margin: 4px 0; }
    .item-fix {
      font-size: 12px;
      color: #58a6ff;
      margin: 4px 0;
      padding: 8px 12px;
      background: rgba(88, 166, 255, 0.08);
      border-radius: 4px;
      border-left: 3px solid #58a6ff;
    }
    .item-file { font-size: 11px; color: #6e7681; font-family: monospace; margin: 4px 0; }

    /* Footer */
    .footer {
      text-align: center;
      padding: 32px;
      color: #6e7681;
      font-size: 12px;
      border-top: 1px solid #21262d;
      margin-top: 40px;
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .check-card { animation: fadeIn 0.3s ease; }
    .check-card:nth-child(2) { animation-delay: 0.05s; }
    .check-card:nth-child(3) { animation-delay: 0.1s; }

    @media (max-width: 640px) {
      .container { padding: 16px; }
      .header h1 { font-size: 22px; }
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      .risk-score .score { font-size: 36px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 <span>ShipReady</span> Audit Report</h1>
    <p class="subtitle">Production Readiness Assessment</p>
    <p class="meta">${summary.timestamp} &middot; ${summary.durationMs}ms</p>
  </div>

  <div class="container">
    <!-- Risk Gauge -->
    <div class="gauge-container">
      <div>
        <div class="gauge">
          <div class="gauge-bg"></div>
          <div class="gauge-needle"></div>
          <div class="gauge-cover"></div>
        </div>
        <div class="gauge-labels">
          <span>Safe</span>
          <span>Moderate</span>
          <span>Critical</span>
        </div>
      </div>
    </div>

    <div class="risk-score">
      <span class="score">${summary.riskScore}</span>
      <span class="label">${riskLabel}</span>
      <p style="color: #6e7681; font-size: 14px; margin-top: 4px;">out of 10 &middot; ${summary.passed}/${summary.totalChecks} checks passing</p>
    </div>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card card-pass">
        <div class="number">${summary.passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-card card-fail">
        <div class="number">${summary.failed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-card card-warn">
        <div class="number">${summary.warnings}</div>
        <div class="label">Warnings</div>
      </div>
      <div class="summary-card card-skip">
        <div class="number">${summary.skipped}</div>
        <div class="label">Skipped</div>
      </div>
    </div>

    <!-- Detailed Results -->
    ${categoryOrder.map(cat => {
      const results = resultsByCategory[cat];
      if (!results || results.length === 0) return '';
      return `
    <div class="category">
      <h2>${cat.charAt(0).toUpperCase() + cat.slice(1)}</h2>
      ${results.map(r => `
      <div class="check-card">
        <div class="check-header" onclick="toggleItems(this)">
          <div class="check-status status-${r.status}">${r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : r.status === 'WARN' ? '⚠' : '?'}</div>
          <div class="check-name">${r.check}</div>
          <div class="check-confidence">${Math.round(r.confidence * 100)}%</div>
          <div class="check-arrow">▼</div>
        </div>
        <div class="check-summary">${r.summary}</div>
        <div class="check-items">
          ${r.items.map(i => `
          <div class="check-item">
            <span class="item-severity sev-${i.severity}">${i.severity}</span>
            <div class="item-message">${escapeHtml(i.message)}</div>
            <div class="item-impact">${escapeHtml(i.impact)}</div>
            ${i.file ? `<div class="item-file">${escapeHtml(i.file)}${i.line ? `:${i.line}` : ''}</div>` : ''}
            <div class="item-fix">💡 ${escapeHtml(i.fix)}</div>
          </div>
          `).join('')}
          ${r.items.length === 0 ? '<div class="check-item" style="color:#6e7681;font-size:13px;">No issues found</div>' : ''}
        </div>
      </div>
      `).join('')}
    </div>
    `;
    }).join('')}

    <!-- Top Findings -->
    ${(() => {
      const allItems = summary.results
        .flatMap(r => r.items.map(i => ({ ...i, check: r.check })))
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
        .slice(0, 5);
      if (allItems.length === 0) return '';
      return `
    <div class="category">
      <h2>🔔 Top Findings</h2>
      ${allItems.map(i => `
      <div class="check-card">
        <div class="check-header" onclick="toggleItems(this)">
          <div class="check-status status-FAIL">!</div>
          <div class="check-name">${i.check}</div>
          <div class="check-confidence">${i.severity}</div>
        </div>
        <div class="check-items open">
          <div class="check-item">
            <span class="item-severity sev-${i.severity}">${i.severity}</span>
            <div class="item-message">${escapeHtml(i.message)}</div>
            <div class="item-impact">${escapeHtml(i.impact)}</div>
            ${i.file ? `<div class="item-file">${escapeHtml(i.file)}${i.line ? `:${i.line}` : ''}</div>` : ''}
            <div class="item-fix">💡 ${escapeHtml(i.fix)}</div>
          </div>
        </div>
      </div>
      `).join('')}
    </div>
    `;
    })()}
  </div>

  <div class="footer">
    Generated by ShipReady v0.1.0 &middot; ${summary.timestamp}
  </div>

  <script>
    function toggleItems(header) {
      const card = header.parentElement;
      const items = card.querySelector('.check-items');
      const arrow = card.querySelector('.check-arrow');
      items.classList.toggle('open');
      arrow.classList.toggle('open');
    }
  </script>
</body>
</html>`;
}

// =============================================
// Helpers
// =============================================

function getRiskColor(score: number): string {
  if (score >= 7) return '#f85149';
  if (score >= 4) return '#d29922';
  return '#3fb950';
}

function severityRank(severity: string): number {
  const ranks: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
  return ranks[severity] || 0;
}

function groupByCategory(results: CheckResult[]): Record<string, CheckResult[]> {
  const groups: Record<string, CheckResult[]> = {};
  for (const result of results) {
    if (!groups[result.category]) groups[result.category] = [];
    groups[result.category].push(result);
  }
  return groups;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
