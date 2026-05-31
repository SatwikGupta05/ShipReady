import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

// SQL injection vulnerable patterns
const SQLI_PATTERNS = [
  { pattern: /\$\{.*\}\s*`\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)/i, name: 'Template literal in SQL query' },
  { pattern: /`\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)[^`]*\$\{/i, name: 'Template literal in SQL query' },
  { pattern: /['"]\s*\+\s*(?:req\.(?:body|query|params)|request\.(?:body|query|params))\s*\+\s*['"]/i, name: 'String concatenation in query' },
  { pattern: /\.exec\s*\(\s*(?:req\.(?:body|query|params)|request\.(?:body|query|params))/i, name: 'Direct user input in query execution' },
  { pattern: /\.query\s*\(\s*(?:req\.(?:body|query|params)|request\.(?:body|query|params))/i, name: 'Direct user input in query execution' },
  { pattern: /\.raw\s*\(\s*`[^`]*\$\{/i, name: 'Raw query with template literals' },
  { pattern: /query\(['"`].*(?:SELECT|INSERT|UPDATE|DELETE|DROP).*['"`]\s*\)/i, name: 'Raw SQL query execution' },
  { pattern: /execute\(['"`].*(?:SELECT|INSERT|UPDATE|DELETE|DROP).*['"`]\s*\)/i, name: 'Raw SQL execution' },
];

const ORM_LIBRARIES = ['prisma', 'typeorm', 'sequelize', 'knex', 'drizzle-orm', 'mongoose', 'micro-orm', 'objection'];

const SAFE_PATTERNS = [
  /prisma\.\w+\.\w+\s*\(/i,
  /\.find(?:One|Many|First|Unique|Raw)?\s*\(/i,
  /\.create\s*\(/i,
  /\.update\s*\(/i,
  /\.delete\s*\(/i,
  /\$queryRaw\s*`/i,
  /\$executeRaw\s*`/i,
  /knex\./i,
  /queryBuilder/i,
  /parameterized|prepared statement/i,
  /\$\d+|:\w+|%s|%d|%L/,
];

export class SqlInjectionCheck implements ShipReadyCheck {
  name = 'sqlInjection';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return Object.keys(deps).some(d =>
        /sql|db|mongo|postgres|mysql|sqlite|prisma|typeorm|sequelize/i.test(d)
      );
    });
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

    let hasDatabase = false;
    let hasORM = false;
    let hasRawQueries = false;
    let hasParameterizedQueries = false;
    let hasSqliPatterns = false;
    const installedLibs: string[] = [];

    // Check package.json for database/ORM libraries
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of ORM_LIBRARIES) {
        if (deps[lib]) {
          hasORM = true;
          installedLibs.push(lib);
        }
      }

      // Check for any database driver
      const dbDeps = Object.keys(deps).filter(d =>
        /sql|mongo|postgres|mysql|sqlite|redis/i.test(d)
      );
      if (dbDeps.length > 0) hasDatabase = true;
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Skip test/migration files
      if (relativePath.includes('/test/') || relativePath.includes('/migrations/') || relativePath.includes('/seeds/')) continue;

      // Check for unsafe SQL patterns
      for (const sqliPattern of SQLI_PATTERNS) {
        const match = content.match(sqliPattern.pattern);
        if (match) {
          hasSqliPatterns = true;
          hasRawQueries = true;

          const lines = content.split('\n');
          let lineNumber = 1;
          for (let i = 0; i < lines.length; i++) {
            if (sqliPattern.pattern.test(lines[i])) {
              lineNumber = i + 1;
              break;
            }
          }

          items.push({
            type: 'SQL_INJECTION_VULNERABLE',
            severity: 'CRITICAL',
            message: `SQL Injection vulnerability: ${sqliPattern.name}`,
            impact: 'Attackers can execute arbitrary SQL commands, leading to data breaches, deletion, or corruption',
            fix: 'Use parameterized queries or an ORM. Never concatenate user input directly into SQL strings.',
            file: relativePath,
            line: lineNumber,
            confidence: 0.85,
          });
          break; // One issue per file is enough
        }
      }

      // Check for parameterized query patterns (good)
      for (const safePattern of SAFE_PATTERNS) {
        if (safePattern.test(content)) {
          hasParameterizedQueries = true;
          break;
        }
      }
    }

    // If project has a database but no ORM and no parameterized queries
    if (hasDatabase && !hasORM && !hasParameterizedQueries && !hasSqliPatterns) {
      items.push({
        type: 'NO_ORM_OR_PARAMETERIZED',
        severity: 'HIGH',
        message: 'Database detected but no ORM or parameterized queries found',
        impact: 'Raw queries without parameterization are vulnerable to SQL injection',
        fix: 'Use an ORM (Prisma, TypeORM) or parameterized queries with your database driver',
        confidence: 0.5,
      });
    }

    indicators.push({ found: hasDatabase, weight: 1 });
    indicators.push({ found: hasORM, weight: 1.5 });
    indicators.push({ found: hasRawQueries, weight: 2 });
    indicators.push({ found: hasParameterizedQueries, weight: -0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'No SQL injection vulnerabilities detected'
      : `Found ${items.length} SQL injection vulnerability(ies)`;

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
