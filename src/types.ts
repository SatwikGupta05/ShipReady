/** Severity levels for findings */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/** Overall check result status */
export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

/** False positive tolerance level */
export type ToleranceLevel = 'strict' | 'normal' | 'permissive';

/** Project type classification */
export type ProjectType = 'api' | 'frontend' | 'fullstack' | 'mobile';

/** Project maturity level */
export type Maturity = 'mvp' | 'alpha' | 'beta' | 'stable';

/** Output format options */
export type OutputFormat = 'human' | 'json' | 'html';

/** Supported programming languages */
export type Language = 'node' | 'python' | 'go' | 'java' | 'rust';

/** Check category classification */
export type CheckCategory = 'security' | 'reliability' | 'performance' | 'ops';

/**
 * Represents a single package in a monorepo workspace.
 * For single-package projects, this represents the root project.
 */
export interface WorkspacePackage {
  name: string;
  path: string;
  relativePath: string;
  packageJson: Record<string, any>;
}

/**
 * Context passed to every check during an audit.
 */
export interface AuditContext {
  rootDir: string;
  config: ShipReadyConfig;
  packages: WorkspacePackage[];
  files: string[];
  language: Language;
}

/**
 * A single finding within a check result.
 */
export interface CheckItem {
  type: string;
  severity: Severity;
  message: string;
  impact: string;
  fix: string;
  file?: string;
  line?: number;
  confidence?: number;
  context?: string;
  suggestion?: string;
}

/**
 * Result of running a single check.
 */
export interface CheckResult {
  check: string;
  status: CheckStatus;
  confidence: number;
  items: CheckItem[];
  summary: string;
  category: CheckCategory;
}

/**
 * Interface that every check plugin must implement.
 */
export interface ShipReadyCheck {
  name: string;
  category: CheckCategory;
  supportedLanguages: Language[];
  /**
   * Optional fast pre-check to determine if this check is relevant for the project.
   * Should do a lightweight check (file existence, config inspection) and return false
   * when the check has nothing to scan. If omitted, the check always runs.
   */
  isRelevant?(context: AuditContext): boolean;
  run(context: AuditContext): Promise<CheckResult>;
}

/**
 * Complete ShipReady configuration.
 */
export interface ShipReadyConfig {
  project: {
    name?: string;
    type?: ProjectType;
    isProd?: boolean;
    maturity?: Maturity;
  };
  checks: Record<string, boolean>;
  severity: {
    fail: Severity[];
    warn: Severity[];
    pass: Severity[];
  };
  falsePositive: {
    toleranceLevel: ToleranceLevel;
    ignorePatterns: Array<{
      file?: string;
      check?: string;
      pattern?: string;
      reason: string;
    }>;
    customWhitelist?: string[];
  };
  customRules?: Array<{
    name: string;
    enabled: boolean;
    pattern: string;
    files: string[];
    severity: Severity;
  }>;
  output: {
    format: OutputFormat;
    html?: { generatePDF?: boolean };
    json?: { includeContext?: boolean };
  };
  github?: {
    commentOnPR?: boolean;
    failCI?: Severity[];
  };
  thresholds?: {
    maxRiskScore?: number;
    minPassRate?: number;
  };
}

/**
 * Complete audit summary returned to the user.
 */
export interface AuditSummary {
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  riskScore: number;
  results: CheckResult[];
  timestamp: string;
  durationMs: number;
}

/** Default configuration values */
export const DEFAULT_CONFIG: ShipReadyConfig = {
  project: {
    name: 'unknown',
    type: 'fullstack',
    isProd: false,
    maturity: 'mvp',
  },
  checks: {
    secrets: true,
    cve: true,
    https: true,
    rateLimit: true,
    auth: true,
    cors: true,
    sqlInjection: true,
    rls: true,
    caching: true,
    loadBalancer: true,
    backup: true,
    errors: true,
    session: true,
    fileUpload: true,
    env: true,
    logging: true,
    docker: true,
    dependencies: true,
    validation: true,
    sanitization: true,
    ci: true,
    monorepo: true,
  },
  severity: {
    fail: ['CRITICAL', 'HIGH'],
    warn: ['MEDIUM'],
    pass: ['LOW', 'INFO'],
  },
  falsePositive: {
    toleranceLevel: 'normal',
    ignorePatterns: [],
  },
  output: {
    format: 'human',
  },
};
