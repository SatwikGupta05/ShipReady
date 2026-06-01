# 🚀 ShipReady

**Catch production bugs before they catch you.**

ShipReady is a production readiness audit tool that scans your project for common security vulnerabilities, operational gaps, and configuration issues before you deploy.

## Quick Start

```bash
# Run an audit on your project
npx shipready audit

# Run with strict mode (fail on MEDIUM issues too)
npx shipready audit --strict

# Output as JSON
npx shipready audit --json

# Generate an HTML report
npx shipready audit --format html --output report.html

# Auto-fix fixable issues
npx shipready audit --fix
```

## Installation

```bash
# Install globally
npm install -g shipready

# Or use directly with npx
npx shipready audit
```

## Configuration

Create a `.shipready.yml` file in your project root:

```yaml
project:
  name: my-app
  type: fullstack        # api | frontend | fullstack | mobile
  isProd: true
  maturity: beta         # mvp | alpha | beta | stable

checks:
  secrets: true
  cors: true
  dependencies: true
  # Disable a check:
  docker: false

severity:
  fail:
    - CRITICAL
    - HIGH
  warn:
    - MEDIUM
  pass:
    - LOW
    - INFO

output:
  format: human          # human | json | html
```

## Available Checks

### Security
| Check | Description |
|-------|-------------|
| `secrets` | Detects hardcoded API keys, passwords, tokens, and credentials |
| `cors` | Scans for CORS misconfigurations |
| `auth` | Validates authentication library usage |
| `sqlInjection` | Detects raw SQL query patterns |
| `session` | Reviews session configuration |
| `fileUpload` | Checks file upload security |
| `validation` | Detects input validation libraries |
| `sanitization` | Checks XSS prevention, CSP headers, output encoding |
| `https` | Verifies HTTPS enforcement |
| `rls` | Analyzes Supabase Row-Level Security |
| `dependencies` | Scans for vulnerable or deprecated dependencies |

### Operations
| Check | Description |
|-------|-------------|
| `docker` | Reviews Dockerfile security best practices |
| `env` | Scans for environment variable exposure |
| `rateLimit` | Checks rate limiting configuration |
| `errors` | Reviews error handling patterns |
| `logging` | Validates logging library and configuration |
| `ci` | Checks CI/CD pipeline configuration |
| `monorepo` | Validates monorepo tooling and workspace setup |
| `backup` | Reviews backup strategies and disaster recovery |
| `loadBalancer` | Checks load balancer and health endpoint config |
| `caching` | Reviews caching strategy and configuration |

## Reporters

### Human (CLI)
Default output format. Color-coded summary with categorized results.

### JSON
Machine-readable output for CI/CD integration:
```bash
shipready audit --json > report.json
```

### HTML
Interactive HTML report with risk gauge visualization and dark theme:
```bash
shipready audit --format html --output report.html
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-d, --dir <path>` | Project directory to audit (default: current directory) |
| `-c, --config <path>` | Path to `.shipready.yml` config file |
| `-f, --format <format>` | Output format: `human`, `json`, or `html` |
| `--json` | Shorthand for `--format=json` |
| `--strict` | Fail on MEDIUM issues too (not just CRITICAL/HIGH) |
| `-o, --output <path>` | Output file path (for JSON or HTML) |
| `--no-color` | Disable colored output |
| `--fix` | Auto-fix fixable issues |

## False Positive Management

Configure false positive patterns in `.shipready.yml`:

```yaml
falsePositive:
  toleranceLevel: normal  # strict | normal | permissive
  ignorePatterns:
    - file: "test/**"
      reason: "Test files may contain hardcoded values"
    - check: "secrets"
      pattern: "EXAMPLE_KEY"
      reason: "This is a well-known test key"
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (or only warnings) |
| `1` | One or more checks failed |
