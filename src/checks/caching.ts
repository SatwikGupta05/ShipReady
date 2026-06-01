import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const CACHING_LIBRARIES = [
  'redis', 'ioredis', 'cache-manager', 'node-cache', 'memory-cache',
  'lru-cache', 'node-redis', 'redis-client', 'cacheable',
  'apollo-server-caching', 'keyv', 'async-cache', 'quick-lru',
];

const CACHING_CONFIG_FILES = [
  'nginx.conf', '.nginx.conf', 'nginx.cfg',
  '.htaccess', 'varnish.vcl',
  'sw.js', 'service-worker.js',
];

// CDN indicators
const CDN_PATTERNS = [
  /cdn\./i, /cloudflare/i, /cloudfront/i, /fastly/i, /akamai/i,
  /keycdn/i, /stackpath/i, /bunnycdn/i, /cdnjs/i,
];

export class CachingCheck implements ShipReadyCheck {
  name = 'caching';
  category = 'performance' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(p => p.packageJson.dependencies) ||
           context.files.some(f => {
             const name = path.basename(f).toLowerCase();
             return name === 'nginx.conf' || name === '.htaccess' || name === 'sw.js';
           });
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    let hasCacheLib = false;
    let hasRedis = false;
    let hasCdn = false;
    let hasCacheHeaders = false;
    let hasServiceWorker = false;

    // 1. Check for caching libraries in dependencies
    for (const pkg of context.packages) {
      const allDeps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      const depNames = Object.keys(allDeps);

      for (const lib of CACHING_LIBRARIES) {
        if (depNames.includes(lib)) {
          hasCacheLib = true;
          if (lib === 'redis' || lib === 'ioredis') hasRedis = true;
        }
      }
    }

    indicators.push({ found: hasCacheLib, weight: 0.3 });
    indicators.push({ found: hasRedis, weight: 0.2 });

    if (!hasCacheLib) {
      items.push({
        type: 'NO_CACHING_LIBRARY',
        severity: 'MEDIUM',
        message: 'No caching library detected',
        impact: 'Without caching, repeated computations and database queries can degrade performance under load',
        fix: 'Implement caching using redis/ioredis for distributed caching or lru-cache/node-cache for in-memory caching',
        confidence: 0.6,
      });
    }

    if (!hasRedis) {
      items.push({
        type: 'NO_REDIS',
        severity: 'LOW',
        message: 'Redis not detected — consider adding for production-grade caching',
        impact: 'Redis provides distributed, persistent caching essential for multi-instance deployments',
        fix: 'Install and configure redis/ioredis for production caching',
        confidence: 0.4,
      });
    }

    // 2. Check for CDN presence in code and config
    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx', '.yml', '.yaml', '.json', '.env'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 300 }
    );

    for (const file of files) {
      const content = readFileSafely(file, 128);
      if (!content) continue;

      for (const pattern of CDN_PATTERNS) {
        if (pattern.test(content)) {
          hasCdn = true;
          break;
        }
      }
      if (hasCdn) break;
    }

    indicators.push({ found: hasCdn, weight: 0.2 });

    // 3. Check for caching config files
    for (const pkg of context.packages) {
      for (const cfgFile of CACHING_CONFIG_FILES) {
        const cfgPath = path.join(pkg.path, cfgFile);
        if (fs.existsSync(cfgPath)) {
          const content = readFileSafely(cfgPath, 64);
          if (content) {
            if (/expires|Cache-Control|max-age|etag/i.test(content)) {
              hasCacheHeaders = true;
            }
          }
        }
      }
    }

    indicators.push({ found: hasCacheHeaders, weight: 0.15 });

    if (!hasCacheHeaders) {
      items.push({
        type: 'NO_CACHE_HEADERS',
        severity: 'MEDIUM',
        message: 'No cache-control headers configured for static assets',
        impact: 'Without cache headers, browsers and CDNs will re-fetch assets on every request, increasing load times',
        fix: 'Configure Cache-Control headers for static assets (e.g., in nginx, .htaccess, or your framework)',
        confidence: 0.5,
      });
    }

    // 4. Check for service worker (PWA caching)
    for (const pkg of context.packages) {
      const swPath = path.join(pkg.path, 'sw.js');
      const swPublicPath = path.join(pkg.path, 'public', 'sw.js');
      const swStaticPath = path.join(pkg.path, 'static', 'sw.js');

      if (fs.existsSync(swPath) || fs.existsSync(swPublicPath) || fs.existsSync(swStaticPath)) {
        hasServiceWorker = true;
        break;
      }
    }

    // Check files for service worker registration
    if (!hasServiceWorker) {
      for (const file of files) {
        const content = readFileSafely(file, 64);
        if (content && /navigator\.serviceWorker|serviceWorker\.register/i.test(content)) {
          hasServiceWorker = true;
          break;
        }
      }
    }

    indicators.push({ found: hasServiceWorker, weight: 0.15 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Caching is properly configured'
      : `Found ${items.length} caching improvement(s)`;

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
