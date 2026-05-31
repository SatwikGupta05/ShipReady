import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

export class HttpsCheck implements ShipReadyCheck {
  name = 'https';
  category = 'security' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return context.config.project.isProd !== false;
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.rs'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 300 }
    );

    let hasHttpsServer = false;
    let hasHttpRedirect = false;
    let hasHsts = false;
    let hasSslConfig = false;
    let hasHttpsEnforced = false;

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for HTTPS server creation
      if (/https\.createServer|createServer\s*\(\s*\{[^}]*key|tls\.createServer|ssl_context/i.test(content)) {
        hasHttpsServer = true;
      }

      // Check for HTTP to HTTPS redirect
      if (/redirect.*https|https.*redirect|\.use\(.*redirect|res\.redirect.*https/i.test(content)) {
        hasHttpRedirect = true;
      }

      // Check for HSTS header
      if (/Strict-Transport-Security|strictTransportSecurity|hsts/i.test(content)) {
        hasHsts = true;
      }

      // Check for SSL/TLS configuration files
      if (/\.crt|\.pem|\.key|\.cert|certificate|ssl_certificate/i.test(relativePath)) {
        hasSslConfig = true;
      }

      // Check for HTTPS enforcement in config
      if (/forceHttps|force_https|enforceHttps|enforce_https|httpsOnly|https_only/i.test(content)) {
        hasHttpsEnforced = true;
      }
    }

    // Check for production flag and missing HTTPS
    if (context.config.project.isProd && !hasHttpsServer && !hasHttpRedirect) {
      items.push({
        type: 'MISSING_HTTPS',
        severity: 'CRITICAL',
        message: 'No HTTPS configuration detected for production project',
        impact: 'Traffic is sent over unencrypted HTTP, allowing man-in-the-middle attacks',
        fix: 'Configure HTTPS with TLS certificates. Use services like Let\'s Encrypt, or a reverse proxy (nginx, Caddy)',
        confidence: 0.8,
      });
    }

    // Check for missing HSTS
    if (context.config.project.isProd && !hasHsts) {
      items.push({
        type: 'MISSING_HSTS',
        severity: 'MEDIUM',
        message: 'No HSTS (HTTP Strict-Transport-Security) header configured',
        impact: 'Browsers may allow HTTP connections on subsequent visits, enabling downgrade attacks',
        fix: 'Add Strict-Transport-Security header with a long max-age in production',
        confidence: 0.6,
      });
    }

    // Check for HTTP -> HTTPS redirect missing
    if (hasHttpsServer && !hasHttpRedirect) {
      items.push({
        type: 'NO_HTTPS_REDIRECT',
        severity: 'MEDIUM',
        message: 'HTTPS server configured but no HTTP-to-HTTPS redirect detected',
        impact: 'Users accessing the HTTP endpoint will not be automatically redirected to HTTPS',
        fix: 'Add middleware to redirect all HTTP traffic to HTTPS',
        confidence: 0.5,
      });
    }

    indicators.push({ found: hasHttpsServer, weight: 1 });
    indicators.push({ found: hasHttpRedirect, weight: 0.5 });
    indicators.push({ found: hasHsts, weight: 0.5 });
    indicators.push({ found: hasSslConfig, weight: 1 });
    indicators.push({ found: hasHttpsEnforced, weight: 1 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'HTTPS configuration looks secure'
      : `Found ${items.length} HTTPS issue(s)`;

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
