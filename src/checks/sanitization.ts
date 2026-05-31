import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

export class SanitizationCheck implements ShipReadyCheck {
  name = 'sanitization';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    // Always relevant — even frontend projects need XSS protection awareness
    return true;
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 300 }
    );

    let hasHelmet = false;
    let hasXssProtection = false;
    let hasSanitizationLib = false;
    let hasDangerousHtml = false;
    let hasCspHeader = false;
    let isBackendProject = false;

    // Check package.json
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      if (deps.helmet) hasHelmet = true;
      if (deps['xss'] || deps['xss-filters'] || deps['sanitize-html'] || deps['dompurify'] || deps['DOMPurify']) hasSanitizationLib = true;
      // Detect backend frameworks
      if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi'] || deps['nest']) isBackendProject = true;
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Skip test files
      if (relativePath.includes('/test/') || relativePath.includes('/spec/')) continue;

      // Check for helmet usage
      if (/helmet\s*\(/i.test(content)) {
        hasHelmet = true;
      }

      // Check for CSP header
      if (/contentSecurityPolicy|content-security-policy/i.test(content)) {
        hasCspHeader = true;
      }

      // Check for dangerous HTML patterns
      if (/\.innerHTML\s*=|[.]insertAdjacentHTML|dangerouslySetInnerHTML/i.test(content)) {
        hasDangerousHtml = true;

        // Check if it's sanitized
        const isSanitized = /sanitize|purify|escape|xss/i.test(content);
        if (!isSanitized) {
          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (/\.innerHTML\s*=|dangerouslySetInnerHTML/i.test(lines[i])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'DANGEROUS_HTML_INTERPOLATION',
            severity: 'HIGH',
            message: 'Unsafe HTML interpolation detected without sanitization',
            impact: 'Can lead to Cross-Site Scripting (XSS) attacks if user input is rendered',
            fix: 'Sanitize user input before rendering HTML. Use libraries like DOMPurify or sanitize-html.',
            file: relativePath,
            line: lineNumber,
            confidence: 0.8,
          });
        }
      }

      // Check for XSS protection middleware
      if (/xss\s*\(/i.test(content) || /xssProtection/i.test(content)) {
        hasXssProtection = true;
      }

      // Check for template engine auto-escaping bypass
      if (/\.render\s*\([^)]*\)\s*\.*html/i.test(content)) {
        const lines = content.split('\n');
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/\.render\s*\([^)]*\)\s*\.*html/i.test(lines[i])) {
            lineNumber = i + 1;
            break;
          }
        }

        items.push({
          type: 'UNESCAPED_RENDER',
          severity: 'MEDIUM',
          message: 'Template rendering without auto-escaping detected',
          impact: 'User input in templates could lead to XSS if not properly escaped',
          fix: 'Use template engine auto-escaping features or manually escape user-supplied data',
          file: relativePath,
          line: lineNumber,
          confidence: 0.6,
        });
      }

      // Check for eval-like patterns
      if (/eval\s*\(|new\s+Function\s*\(|setTimeout\s*\([^)]*['"]/i.test(content)) {
        items.push({
          type: 'DANGEROUS_EVAL',
          severity: 'HIGH',
          message: 'Code execution via eval() or similar detected',
          impact: 'eval() execution of user data can lead to arbitrary code execution',
          fix: 'Avoid eval(). Use safer alternatives like JSON.parse() or Function constructors only with trusted input.',
          file: relativePath,
          line: 1,
          confidence: 0.75,
        });
      }
    }

    // If helmet is used but no CSP configured
    if (hasHelmet && !hasCspHeader) {
      items.push({
        type: 'MISSING_CSP',
        severity: 'MEDIUM',
        message: 'Helmet is used but no Content Security Policy header configured',
        impact: 'Without CSP, the application is more vulnerable to XSS and data injection attacks',
        fix: 'Configure a CSP header via helmet.contentSecurityPolicy()',
        confidence: 0.5,
      });
    }

    // Only recommend helmet for backend/server projects, not frontend-only
    if (!hasHelmet && isBackendProject) {
      items.push({
        type: 'MISSING_HELMET',
        severity: 'MEDIUM',
        message: 'Helmet middleware not detected in backend project',
        impact: 'Without helmet, the app is missing security headers that protect against common attacks',
        fix: 'Install and use helmet middleware: `npm install helmet`',
        confidence: 0.5,
      });
    }

    indicators.push({ found: hasHelmet, weight: 1 });
    indicators.push({ found: hasSanitizationLib, weight: 1 });
    indicators.push({ found: hasXssProtection, weight: 0.5 });
    indicators.push({ found: hasCspHeader, weight: 0.5 });
    indicators.push({ found: hasDangerousHtml, weight: 2 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Output sanitization looks adequate'
      : `Found ${items.length} sanitization issue(s)`;

    return {
      check: this.name,
      status,
      confidence,
      items,
      summary,
      category: this.category,
    };
  }
}
