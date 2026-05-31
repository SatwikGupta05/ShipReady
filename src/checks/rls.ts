import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage', 'migrations'];

export class RlsCheck implements ShipReadyCheck {
  name = 'rls';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return Object.keys(deps).some(d => /supabase/i.test(d));
    });
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx', '.sql'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 300 }
    );

    let hasSupabaseClient = false;
    let hasRlsEnabled = false;
    let hasDirectTableAccess = false;
    let hasDatabaseQueries = false;
    let hasRlsPolicies = false;
    let hasServiceRoleUsage = false;

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for Supabase client
      if (/createClient|supabase\.createClient|SupabaseClient/i.test(content)) {
        hasSupabaseClient = true;
      }

      // Check for RLS enablement in SQL/migrations
      if (/enable row level security|ALTER TABLE.*ENABLE ROW LEVEL SECURITY|rls_enabled|rls\.enable/i.test(content)) {
        hasRlsEnabled = true;
      }

      // Check for RLS policy definitions
      if (/CREATE POLICY|create policy|rls\.policy/i.test(content)) {
        hasRlsPolicies = true;
      }

      // Check for direct table access (potential security issue)
      if (/\.from\s*\(\s*['"`][a-zA-Z_]+['"`]\s*\)\s*\./i.test(content) && !/\.from\s*\(\s*['"`]rls['"`]/i.test(content)) {
        hasDatabaseQueries = true;
      }

      // Check for service_role key usage (dangerous in client)
      if (/service_role|serviceRole|SERVICE_ROLE/i.test(content)) {
        hasServiceRoleUsage = true;
        const lines = content.split('\n');
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/service_role|serviceRole/i.test(lines[i])) {
            lineNumber = i + 1;
            break;
          }
        }

        items.push({
          type: 'SERVICE_ROLE_KEY',
          severity: 'CRITICAL',
          message: 'Supabase service_role key detected in code',
          impact: 'Service role key bypasses RLS policies and allows full database access. Never expose it client-side.',
          fix: 'Remove the service_role key from client code. Use anon/public key with proper RLS policies for client requests.',
          file: relativePath,
          line: lineNumber,
          confidence: 0.95,
        });
      }

      // Check for .select('*') on tables without RLS
      if (/\.select\s*\(\s*['"]\*['"]\s*\)/i.test(content) && !/rls|policy/i.test(content)) {
        hasDirectTableAccess = true;
      }

      // Check for Supabase SQL queries
      if (/\.rpc\s*\(|supabase.*sql|\.query.*select|\.raw/i.test(content)) {
        hasDatabaseQueries = true;
      }
    }

    // If Supabase is used but no RLS policies found
    if (hasSupabaseClient && !hasRlsPolicies) {
      items.push({
        type: 'MISSING_RLS_POLICIES',
        severity: 'HIGH',
        message: 'Supabase detected but no Row-Level Security policies found',
        impact: 'Without RLS policies, all authenticated users can read/write all table data',
        fix: 'Enable RLS on your Supabase tables and create policies to restrict access based on user roles',
        confidence: 0.7,
      });
    }

    // If direct table access without RLS
    if (hasDatabaseQueries && !hasRlsEnabled && hasSupabaseClient) {
      items.push({
        type: 'DIRECT_TABLE_ACCESS',
        severity: 'MEDIUM',
        message: 'Direct table access used without confirmed RLS policies',
        impact: 'Tables may be accessible to all users if RLS is not properly configured',
        fix: 'Enable RLS on all tables and use RLS policies to control data access',
        confidence: 0.5,
      });
    }

    indicators.push({ found: hasSupabaseClient, weight: 1 });
    indicators.push({ found: hasRlsEnabled, weight: 1 });
    indicators.push({ found: hasRlsPolicies, weight: 1.5 });
    indicators.push({ found: hasServiceRoleUsage, weight: 3 });
    indicators.push({ found: hasDirectTableAccess, weight: 0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Supabase RLS configuration looks secure'
      : `Found ${items.length} RLS issue(s)`;

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
