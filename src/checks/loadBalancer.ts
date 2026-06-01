import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const LOAD_BALANCER_CONFIG_FILES = [
  'nginx.conf', '.nginx.conf',
  'haproxy.cfg', 'haproxy.config',
  'traefik.yml', 'traefik.yaml',
  'caddyfile', 'Caddyfile',
  'envoy.yaml', 'envoy.yml',
];

const HEALTH_CHECK_PATTERNS = [
  /healthz/i, /health-check/i, /healthcheck/i, /health_check/i,
  /\/health\b/i, /\/ping\b/i, /\/readyz/i, /\/livez/i,
  /readinessProbe/i, /livenessProbe/i, /startupProbe/i,
  /grpc\.health/i,
];

const LOAD_BALANCER_DEPENDENCIES = [
  'http-proxy', 'http-proxy-middleware', 'node-http-proxy',
  'reverse-proxy', 'proxy-agent', 'express-http-proxy',
];

export class LoadBalancerCheck implements ShipReadyCheck {
  name = 'loadBalancer';
  category = 'ops' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    if (context.config.project.isProd === false) return false;
    // Check for production infrastructure files
    return context.files.some(f => {
      const basename = path.basename(f).toLowerCase();
      return LOAD_BALANCER_CONFIG_FILES.includes(basename) ||
             basename === 'docker-compose.yml' ||
             basename === 'docker-compose.yaml' ||
             basename === 'Dockerfile';
    });
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    let hasLbConfig = false;
    let hasHealthEndpoint = false;
    let hasStickySession = false;
    let hasSslTermination = false;
    let hasRateLimiting = false;

    // 1. Check for load balancer config files
    for (const pkg of context.packages) {
      for (const cfgFile of LOAD_BALANCER_CONFIG_FILES) {
        const cfgPath = path.join(pkg.path, cfgFile);
        if (fs.existsSync(cfgPath)) {
          hasLbConfig = true;
          const content = readFileSafely(cfgPath, 128);
          if (content) {
            if (/sticky|session|ip_hash|ip_hash/i.test(content)) hasStickySession = true;
            if (/ssl|certificate|https|tls/i.test(content)) hasSslTermination = true;
            if (/limit_req|rate_limit|burst/i.test(content)) hasRateLimiting = true;
            if (HEALTH_CHECK_PATTERNS.some(p => p.test(content))) hasHealthEndpoint = true;
          }
        }
      }
    }

    indicators.push({ found: hasLbConfig, weight: 0.3 });

    // 2. Check source code for health check endpoints
    const sourceFiles = context.files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.rs'].includes(ext);
    }).slice(0, 200);

    for (const file of sourceFiles) {
      const content = readFileSafely(file, 64);
      if (!content) continue;

      for (const pattern of HEALTH_CHECK_PATTERNS) {
        if (pattern.test(content)) {
          hasHealthEndpoint = true;
          break;
        }
      }
      if (hasHealthEndpoint) break;
    }

    indicators.push({ found: hasHealthEndpoint, weight: 0.25 });

    if (!hasHealthEndpoint && context.config.project.isProd !== false) {
      items.push({
        type: 'NO_HEALTH_ENDPOINT',
        severity: 'HIGH',
        message: 'No health check endpoint detected',
        impact: 'Load balancers cannot determine instance health without a health check endpoint, risking traffic to unhealthy instances',
        fix: 'Add a /health or /healthz endpoint that returns the application status (database connection, memory, etc.)',
        confidence: 0.7,
      });
    }

    if (!hasLbConfig && context.config.project.isProd !== false) {
      items.push({
        type: 'NO_LB_CONFIG',
        severity: 'MEDIUM',
        message: 'No load balancer configuration detected',
        impact: 'Without load balancing, there is no traffic distribution or failover for multi-instance deployments',
        fix: 'Configure a reverse proxy / load balancer (nginx, HAProxy, Traefik) or use a cloud load balancer (ELB, ALB, GCLB)',
        confidence: 0.5,
      });
    }

    // 3. Check for reverse proxy dependencies
    for (const pkg of context.packages) {
      const allDeps = { ...(pkg.packageJson.dependencies || {}) };
      const depNames = Object.keys(allDeps);
      for (const dep of LOAD_BALANCER_DEPENDENCIES) {
        if (depNames.includes(dep)) {
          hasLbConfig = true;
        }
      }
    }

    // 4. Check docker-compose for load balancer services
    for (const pkg of context.packages) {
      for (const dcFile of ['docker-compose.yml', 'docker-compose.yaml']) {
        const dcPath = path.join(pkg.path, dcFile);
        if (fs.existsSync(dcPath)) {
          const content = readFileSafely(dcPath, 256);
          if (content) {
            if (/nginx|traefik|haproxy|caddy|envoy/i.test(content)) hasLbConfig = true;
          }
        }
      }
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Load balancing appears properly configured'
      : `Found ${items.length} load balancer issue(s)`;

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
