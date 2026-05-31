import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

interface SecretPattern {
  name: string;
  patterns: RegExp[];
  severity: 'CRITICAL' | 'HIGH';
  message: string;
  impact: string;
  fix: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'API Key',
    severity: 'CRITICAL',
    patterns: [
      /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
      /(?:sk[-_])[a-zA-Z0-9]{20,}/,
      /(?:pk[-_])[a-zA-Z0-9]{20,}/,
    ],
    message: 'Hardcoded API key detected',
    impact: 'Exposed API keys can lead to unauthorized access and financial loss',
    fix: 'Move the API key to environment variables and use process.env in code',
  },
  {
    name: 'Password',
    severity: 'CRITICAL',
    patterns: [
      /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{3,})['"]/i,
      /(?:db[_-]?password|db_password)\s*[:=]\s*['"]([^'"]{3,})['"]/i,
    ],
    message: 'Hardcoded password detected',
    impact: 'Hardcoded passwords compromise all environments using this code',
    fix: 'Remove hardcoded password and use a secrets manager or environment variables',
  },
  {
    name: 'Private Key',
    severity: 'CRITICAL',
    patterns: [
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
      /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
      /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
    ],
    message: 'Private key detected in source code',
    impact: 'Compromised private keys allow man-in-the-middle attacks and identity theft',
    fix: 'Remove private key from source and use a secrets manager or SSH agent',
  },
  {
    name: 'Token/Secret',
    severity: 'HIGH',
    patterns: [
      /(?:secret|token)\s*[:=]\s*['"]([a-zA-Z0-9_\-.]{16,})['"]/i,
      /(?:auth[_-]?token|auth_token)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
      /(?:jwt[_-]?secret|jwt_secret)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
    ],
    message: 'Hardcoded secret or token detected',
    impact: 'Exposed secrets can lead to unauthorized access to your application',
    fix: 'Store secrets in environment variables and access them via process.env',
  },
  {
    name: 'Connection String',
    severity: 'CRITICAL',
    patterns: [
      /mongodb(?:\+srv)?:\/\/[^@]+:[^@]+@/i,
      /postgres(?:\+ssl)?:\/\/[^:]+:[^@]+@/i,
      /mysql:\/\/[^:]+:[^@]+@/i,
      /redis:\/\/[^:]+:[^@]+@/i,
    ],
    message: 'Database connection string with credentials detected',
    impact: 'Exposed database credentials can lead to data breaches',
    fix: 'Use environment variables for database URL and never commit credentials',
  },
  {
    name: 'OAuth Token',
    severity: 'CRITICAL',
    patterns: [
      /ya29\.[a-zA-Z0-9_-]{50,}/, // Google OAuth
      /ghp_[a-zA-Z0-9]{36}/,      // GitHub personal access token
      /gho_[a-zA-Z0-9]{36}/,      // GitHub OAuth access token
      /xox[baprs]-[a-zA-Z0-9-]{20,}/, // Slack tokens
      /sk-[a-zA-Z0-9]{20,}/,      // OpenAI key format
    ],
    message: 'OAuth or service token detected',
    impact: 'Compromised OAuth tokens allow attackers to impersonate your service',
    fix: 'Rotate the token immediately and use environment variables or a secrets vault',
  },
];

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

export class SecretsCheck implements ShipReadyCheck {
  name = 'secrets';
  category = 'security' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return context.files.some(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.rs', '.env', '.yml', '.yaml'].includes(ext);
    });
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];
    const scannedFiles = new Set<string>();

    // Collect source files and config files
    const sourceDirs = context.packages.map(p => p.path);
    const files = collectFilesByExtension(
      sourceDirs,
      ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.rs', '.env', '.yml', '.yaml'],
      { extraIgnoreDirs: IGNORE_DIRS, maxFiles: 500 }
    );

    // Also check .env files manually (they may not have the right extension)
    for (const pkg of context.packages) {
      const envPath = path.join(pkg.path, '.env');
      if (fs.existsSync(envPath) && !scannedFiles.has(envPath)) {
        files.push(envPath);
        scannedFiles.add(envPath);
      }
    }

    for (const file of files) {
      const content = readFileSafely(file, 256); // 256KB limit per file
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      for (const secretPattern of SECRET_PATTERNS) {
        for (const regex of secretPattern.patterns) {
          const matches = content.match(regex);
          if (matches) {
            // Find line number
            const lines = content.split('\n');
            let lineNumber = 1;
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                lineNumber = i + 1;
                break;
              }
            }

            const isTestFile = relativePath.includes('test') || relativePath.includes('spec') || relativePath.includes('fixture');
            const isExample = relativePath.includes('.example');

            // Skip test files and examples — they're expected to have fake values
            if (isTestFile || isExample) continue;

            items.push({
              type: 'HARDCODED_SECRET',
              severity: secretPattern.severity,
              message: `${secretPattern.message}: ${secretPattern.name}`,
              impact: secretPattern.impact,
              fix: secretPattern.fix,
              file: relativePath,
              line: lineNumber,
              confidence: 0.9,
              context: `Found in ${relativePath}:${lineNumber}`,
            });
          }
        }
      }

      indicators.push({ found: items.length > 0, weight: 1 });
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'No hardcoded secrets detected in source files'
      : `Found ${items.length} potential secret(s) in source code`;

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
