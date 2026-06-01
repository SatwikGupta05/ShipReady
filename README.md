<div align="center">
  <h1>🚀 ShipReady</h1>
  <p><strong>Catch production bugs before they catch you.</strong></p>
  
  [![GitHub License](https://img.shields.io/github/license/SatwikGupta05/ShipReady?style=flat-square)](https://github.com/SatwikGupta05/ShipReady)
  [![Node.js Version](https://img.shields.io/badge/Node.js-18+-green?style=flat-square)](https://nodejs.org)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/SatwikGupta05/ShipReady/pulls)
  
  <p>
    <a href="#-why-shipready">Why ShipReady</a> •
    <a href="#-features">Features</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-installation">Installation</a> •
    <a href="#-usage">Usage</a> •
    <a href="#-checks">Checks</a> •
    <a href="#-faq">FAQ</a>
  </p>
  <br>
</div>

**ShipReady** is a production readiness audit CLI tool that scans your project for security vulnerabilities, operational gaps, configuration issues, and performance anti-patterns in seconds.

Instead of manually reviewing checklists before every release, run one command and get a comprehensive report with risk scores, fix suggestions, and auto-fix capabilities.

---

## 🤔 Why ShipReady?

**The Problem:**
- Enterprise tools (Snyk, Checkmarx, SonarQube) cost $$$ and require days of setup
- Free tools only catch CVEs or code style, missing config/ops issues
- Manual pre-launch checklists are tedious and error-prone
- You ship fast, but unsecured

**ShipReady Solves This:**
- ✓ **Comprehensive** — 21 checks covering security + operations + performance
- ✓ **Free & Open Source** — MIT license, no paywalls
- ✓ **Zero-Config** — Works out of the box, optional `.shipready.yml`
- ✓ **Fast** — Scans most projects in 10-30 seconds
- ✓ **Unique Checks** — Validates caching, load balancing, backups, monorepos
- ✓ **Auto-Fix** — Quick remediation with `--fix` flag
- ✓ **CI-Ready** — GitHub Actions workflow included
- ✓ **Smart** — Confidence scoring reduces false positives

### Comparison with Alternatives

| Feature | ShipReady | Snyk | CodeQL | npm audit |
|---------|-----------|------|--------|-----------|
| CVE Scanning | ✓ | ✓ | ✓ | ✓ |
| SAST (code patterns) | ✓ | ✓ | ✓ | ✗ |
| Config Validation | ✓ | ✗ | ✗ | ✗ |
| Ops Checks (backup, caching, load balancer) | ✓ | ✗ | ✗ | ✗ |
| Monorepo Support | ✓ | ✓ | ✗ | ✗ |
| Auto-Fix | ✓ | ✓ | ✗ | ✓ |
| CI/CD Integration | ✓ | ✓ | ✓ | ✓ |
| Cost | **FREE** | **$$$** | **FREE** | **FREE** |
| Setup Time | **<5 min** | **Days** | **Days** | **Minutes** |
| Learning Curve | **Easy** | **Steep** | **Steep** | **Easy** |

**ShipReady excels at:** Config validation, ops readiness, monorepo support, free + easy setup

---

## ✨ Features

- **🔒 Security Checks** — Secrets, CORS, auth, SQL injection, session, XSS, HTTPS, RLS, file uploads, dependency vulns
- **🛠️ Operations Checks** — Docker, CI/CD, env vars, rate limiting, error handling, logging, monorepo, backups, load balancing, caching
- **📊 Smart Scoring** — Risk score (0-10) with severity-weighted confidence scoring
- **🎨 Multiple Reporters** — Human-readable CLI, JSON for pipelines, interactive HTML with risk gauge
- **🔧 Auto-Fix** — `--fix` flag auto-creates configs, updates .gitignore, fixes common issues
- **📦 Monorepo Support** — Auto-detects pnpm/npm/yarn workspaces, Turborepo, Nx, Lerna
- **⚡ Parallel Execution** — All checks run concurrently with real-time progress
- **🎯 Zero Config** — Works out of the box with sensible defaults
- **🧠 Smart False Positive Handling** — Configurable tolerance, ignore patterns, whitelists

---

## 🚀 Quick Start

```bash
# Run a full audit on your project (30 seconds)
npx shipready audit

# View the output
# Risk Score: 6.8/10 (HIGH)
# ✓ 18 passed  ✗ 3 failed  ⚠ 4 warned
# 🔴 CRITICAL: secrets found in config.js:42
# 🟠 HIGH: CORS allows all origins
# ...
```

### Example Output

```
  🚀 ShipReady scanning /home/user/my-app
  ════════════════════════════════════════════

  Risk Score:  6.8/10 (HIGH)

  ✓ 18 passed  ✗ 3 failed  ⚠ 4 warned  ○ 1 skipped
  ─────────────────────────────────────────────────

  🔴 CRITICAL
    ✗ secrets
       → Found hardcoded API key in config.js:42
       → Stripe key: sk_live_abc123xyz...
       Fix: Use process.env.STRIPE_KEY instead

  🟠 HIGH
    ✗ cors
       → CORS allows all origins (wildcard detected)
       → Access-Control-Allow-Origin: *
       Fix: Set specific origin in cors config

    ✗ validation
       → Missing input validation on POST /api/users
       → No joi/zod/yup library detected
       Fix: Add schema validation with Zod or Joi

  🟡 MEDIUM
    ⚠ caching
       → No Redis/Memcached detected
       → Sessions not cached, DB under heavy load
       Fix: Set up Redis and cache middleware

  📋 Top Fixes (Priority Order)
    1. ⏱ 5 min  — Remove hardcoded secrets
    2. ⏱ 3 min  — Configure CORS whitelist
    3. ⏱ 10 min — Add input validation

  ✅ Passed: secrets (with env), auth, https, rateLimit, sqlInjection, ...
```

---

## 📦 Installation

**Requirements:** Node.js 18+

```bash
# Install globally
npm install -g shipready

# Or run directly (no installation needed)
npx shipready audit

# Or install locally in your project
npm install --save-dev shipready
npx shipready audit
```

---

## 📋 Usage

### Basic Audit

```bash
shipready audit
```

### Command-Line Options

| Option | Description |
|--------|-------------|
| `-d, --dir <path>` | Project directory to audit (default: current) |
| `-c, --config <path>` | Path to `.shipready.yml` config file |
| `-f, --format <fmt>` | Output format: `human`, `json`, or `html` |
| `--json` | Shorthand for `--format=json` |
| `--strict` | Fail on MEDIUM issues too (not just CRITICAL/HIGH) |
| `-o, --output <path>` | Output file path (for JSON or HTML) |
| `--no-color` | Disable colored output |
| `--fix` | Auto-fix fixable issues (e.g. missing `.dockerignore`, `.env.example`) |
| `--version` | Show version |
| `--help` | Show help |

### Examples

```bash
# Audit a specific directory
shipready audit --dir ./src

# Use custom config
shipready audit --config ./configs/.shipready.yml

# Generate HTML report
shipready audit --format html --output report.html
open report.html

# JSON output for CI/CD
shipready audit --json > report.json

# Auto-fix issues
shipready audit --fix

# Strict mode (fail on MEDIUM issues too)
shipready audit --strict

# Combine multiple options
shipready audit --dir=./api --strict --format=json --output=audit.json
```

---

## 🔄 CI/CD Integration

### GitHub Actions

Add to `.github/workflows/shipready.yml`:

```yaml
name: ShipReady Audit
on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  audit:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Run ShipReady Audit
        run: npx shipready audit --strict
        continue-on-error: true
      
      - name: Generate HTML Report
        if: always()
        run: npx shipready audit --format html --output shipready-report.html
      
      - name: Upload Report as Artifact
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: shipready-report
          path: shipready-report.html
          retention-days: 30
```

### GitLab CI

Add to `.gitlab-ci.yml`:

```yaml
shipready-audit:
  image: node:18
  stage: test
  script:
    - npm install
    - npx shipready audit --strict
  artifacts:
    paths:
      - shipready-report.html
    expire_in: 30 days
  allow_failure: true
```

### CircleCI

Add to `.circleci/config.yml`:

```yaml
jobs:
  shipready:
    docker:
      - image: cimg/node:18.0
    steps:
      - checkout
      - run: npm install
      - run: npx shipready audit --strict
      - store_artifacts:
          path: shipready-report.html
```

---

## 📦 Monorepo Support

ShipReady automatically detects and scans all packages in your monorepo:

```bash
# Scans all packages in pnpm/npm/yarn workspaces, Turborepo, Nx, Lerna
shipready audit
```

### Example Output for Monorepos

```
  🚀 ShipReady scanning monorepo
  ═══════════════════════════════════════════

  📦 packages/web (Next.js)
    Risk: 4.2/10
    ✓ 20 passed  ✗ 1 failed  ⚠ 2 warned
    ✗ secrets: 1 API key found
    ⚠ caching: No Redis configured

  📦 packages/api (Express)
    Risk: 2.1/10
    ✓ 22 passed  ⚠ 1 warned
    ⚠ rateLimit: Using memory store (not distributed)

  📦 packages/shared (Shared lib)
    Risk: 1.0/10
    ✓ 23 passed
    ✅ All checks passed!

  ─────────────────────────────────────────
  📊 Monorepo Summary
    Total Risk: 2.4/10 (LOW)
    Packages: 3
    Total Issues: 4
```

### Supported Monorepo Tools

- ✓ pnpm workspaces
- ✓ npm workspaces
- ✓ yarn workspaces
- ✓ Turborepo
- ✓ Nx
- ✓ Lerna
- ✓ Rush

---

## 🔍 Checks (21 Total)

### 🔒 Security (11 Checks)

| Check | What It Detects | Severity |
|-------|-----------------|----------|
| `secrets` | Hardcoded API keys, passwords, tokens, connection strings | CRITICAL |
| `cors` | Open CORS headers, credential leaks, wildcard origins | HIGH |
| `auth` | Weak password hashing (MD5/SHA1), missing JWT expiration | HIGH |
| `sqlInjection` | Raw SQL concatenation, parameterization issues | CRITICAL |
| `session` | Missing secure flags, no HttpOnly/SameSite, long timeouts | HIGH |
| `fileUpload` | Missing size limits, no type validation, accessible dirs | HIGH |
| `validation` | Missing Zod/Joi/Yup, unvalidated user input, no rate limits | HIGH |
| `sanitization` | XSS vulnerabilities, missing CSP, innerHTML misuse | HIGH |
| `https` | Hardcoded HTTP URLs, missing HSTS, no SSL enforcement | CRITICAL |
| `rls` | Missing user_id validation, data access control bypass | HIGH |
| `dependencies` | Vulnerable packages, missing lock files, deprecated libs | HIGH |

### 🛠️ Operations (10 Checks)

| Check | What It Detects | Severity |
|-------|-----------------|----------|
| `rateLimit` | No rate limiting, loose limits, memory store (not distributed) | HIGH |
| `errors` | Stack traces exposed, database errors visible, info leaks | MEDIUM |
| `logging` | Passwords/PII in logs, API keys logged, sensitive data | MEDIUM |
| `docker` | Running as root, exposed ports, old base images, missing .dockerignore | MEDIUM |
| `env` | Dev secrets in git, missing .env.example, .env committed | MEDIUM |
| `ci` | Missing CI pipeline, no test/lint steps, no automation | HIGH |
| `caching` | No Redis/Memcached, missing cache strategy, no TTL | MEDIUM |
| `loadBalancer` | Single server, no health checks, no failover | MEDIUM |
| `backup` | No backup script, no cron job, no restoration tests | HIGH |
| `monorepo` | Package manager mismatch, circular dependencies, duplicates | MEDIUM |

---

## ⚙️ Configuration

Create `.shipready.yml` in your project root for custom configuration:

```yaml
# Project metadata
project:
  name: my-app
  type: fullstack          # api | frontend | fullstack | mobile
  isProd: true
  maturity: beta           # mvp | alpha | beta | stable

# Which checks to enable/disable
checks:
  secrets: true
  cors: true
  auth: true
  # Disable specific check:
  docker: false

# Severity levels that should fail
severity:
  fail:
    - CRITICAL
    - HIGH
  warn:
    - MEDIUM
  pass:
    - LOW
    - INFO

# Output format
output:
  format: human            # human | json | html

# Handle false positives
falsePositive:
  toleranceLevel: normal   # strict | normal | permissive
  
  # Ignore specific files/patterns
  ignorePatterns:
    - file: "**/__tests__/**"
      reason: "Test files may contain hardcoded values"
    
    - check: secrets
      pattern: "EXAMPLE_API_KEY"
      reason: "Well-known example key, safe to expose"
    
    - file: "docs/examples/**"
      reason: "Documentation with code examples"
  
  # Whitelist specific files
  whitelist:
    - "config.example.json"
    - "docs/architecture.md"
```

### Configuration Options

**project.type:**
- `api` — REST/GraphQL backend only
- `frontend` — React/Vue/Angular only
- `fullstack` — Both frontend and backend
- `mobile` — React Native or Flutter

**falsePositive.toleranceLevel:**
- `strict` — Flag everything (security-focused teams)
- `normal` — Smart filtering of obvious false positives (recommended)
- `permissive` — Only flag critical issues (legacy projects)

---

## 📊 Reporters

### Human (CLI)
Default terminal output with color-coding, severity icons, and organized sections.

```bash
shipready audit
```

### JSON
Machine-readable format for CI/CD pipelines, integrations, and programmatic parsing.

```bash
shipready audit --json > report.json
shipready audit --format json --output audit.json
```

### HTML
Interactive dark-themed report with animated risk gauge, collapsible cards, and fix suggestions.

```bash
shipready audit --format html --output report.html
open report.html
```

Features:
- ✓ Animated risk needle gauge (0-10 scale)
- ✓ Collapsible finding cards per check
- ✓ Severity color-coding
- ✓ Detailed fix suggestions
- ✓ Responsive mobile design
- ✓ Print-friendly styling

---

## 🚫 Handling False Positives

Some checks might flag safe patterns. Configure tolerance:

```yaml
# .shipready.yml
falsePositive:
  toleranceLevel: normal
  
  ignorePatterns:
    - file: "test/**"
      reason: "Test code, not production"
    
    - check: secrets
      pattern: "EXAMPLE_.*"
      reason: "Documentation examples, not real keys"
    
    - check: cors
      pattern: "localhost"
      reason: "Local development, safe"
```

**Tolerance Levels:**
- `strict` — Report everything (recommended for security teams)
- `normal` — Filter obvious false positives (recommended for most projects)
- `permissive` — Only critical issues (for legacy projects)

---

## 🔧 Troubleshooting

### "Check took too long (>5s)"
- Reduce file count by scanning a specific directory: `--dir=src`
- Check for very large files being scanned

### "Too many false positives"
- Set `toleranceLevel: permissive` in `.shipready.yml`
- Add patterns to `ignorePatterns`
- Use `--dir` to limit scan scope

### "Check says FAIL but I disagree"
- Check `.shipready.yml` configuration
- Add pattern to `ignorePatterns`
- Open GitHub issue with `shipready audit --json` output

### "npm install -g shipready failed"
- Ensure Node.js 18+ is installed: `node --version`
- Try with sudo: `sudo npm install -g shipready`
- Or use npx: `npx shipready audit`

### "Scan is very slow"
ShipReady auto-excludes: `node_modules`, `.git`, `dist`, `build`, `.next`

If still slow:
```bash
# Only scan source code
shipready audit --dir=src

# Run with specific output format only
shipready audit --json
```

---

## ❓ FAQ

**Q: Does ShipReady replace Snyk?**  
A: No. Snyk is deeper on supply-chain attacks. ShipReady catches config/ops issues Snyk misses. Use both for comprehensive coverage.

**Q: What Node versions are supported?**  
A: Node.js 18+. Works on Mac, Linux, Windows.

**Q: Can I run this in CI/CD?**  
A: Yes! Full support for GitHub Actions, GitLab CI, CircleCI. See examples above.

**Q: How fast is it?**  
A: Most projects scan in 10-30 seconds. Speed depends on project size and complexity.

**Q: Does it modify my code?**  
A: Only with `--fix` flag. Without it, ShipReady is 100% read-only.

**Q: Can I ignore specific checks?**  
A: Yes. Set `checks: { docker: false }` in `.shipready.yml`.

**Q: Is it free?**  
A: Yes, forever. MIT licensed, open source. No paywalls or feature gates.

**Q: Can I contribute?**  
A: Absolutely! PRs welcome. See the project on GitHub.

**Q: Does it work with monorepos?**  
A: Yes! Auto-detects pnpm/npm/yarn workspaces, Turborepo, Nx, Lerna, and reports per-package.

**Q: What about Python/Go projects?**  
A: Currently Node.js only. Python/Go support planned for future releases.

---

## ⚡ Performance

**Scan Speed:**
- Small projects (<1K files): ~5 seconds
- Medium projects (1K-10K files): ~15 seconds
- Large projects (10K+ files): ~30 seconds

**Optimizations:**
- Parallel check execution (all checks run concurrently)
- Automatic exclusion of node_modules, .git, dist, build
- Smart file filtering (only scans relevant files)
- Fast `isRelevant` pre-checks to skip unnecessary scans

---

## 🧪 Development

### Setup

```bash
git clone https://github.com/SatwikGupta05/ShipReady.git
cd shipready
npm install
npm test
```

### Project Structure

```
src/
├── checks/              # 21 check implementations
│   ├── secrets.ts       # Detects hardcoded secrets
│   ├── cors.ts          # CORS validation
│   ├── validation.ts    # Input validation
│   └── ...
├── reporters/           # Output formatters
│   ├── cli.ts           # Human-readable CLI
│   ├── json.ts          # JSON output
│   └── html.ts          # Interactive HTML
├── utils/               # Shared utilities
│   ├── files.ts         # File system helpers
│   └── scoring.ts       # Risk score calculation
├── config.ts            # YAML config loader
├── fixer.ts             # Auto-fix engine
├── runner.ts            # Audit orchestrator
├── types.ts             # TypeScript definitions
├── workspace.ts         # Monorepo detection
└── index.ts             # CLI entry point
```

### Available Scripts

```bash
npm test              # Run tests
npm run build         # TypeScript → JavaScript
npx tsc --noEmit      # Type check (no output files)
```

### Making a New Check

```typescript
// src/checks/myCheck.ts
import { ShipReadyCheck, CheckResult, AuditContext } from '../types';

export class MyCheck implements ShipReadyCheck {
  name = 'myCheck';
  description = 'Checks for something important';

  async run(context: AuditContext): Promise<CheckResult> {
    // Your check logic here
    return {
      status: 'PASS',
      summary: 'Everything looks good',
      items: [],
    };
  }
}
```

---


## 🤝 Contributing

We love contributions! Whether it's bug fixes, new checks, documentation, or feature ideas.

**Quick Start:**
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write tests for your changes
4. Submit a PR

---

## 📈 Roadmap

- [ ] Python language support
- [ ] Go language support  
- [ ] Custom rules system (extend with your own checks)
- [ ] Web dashboard for team collaboration
- [ ] GitHub App for automatic PR comments

---

## 📄 License

MIT © 2026 ShipReady Contributors

---

<div align="center">
  <sub>Built with ❤️ for safer, faster deployments</sub>
  <p>
    <a href="https://github.com/SatwikGupta05/ShipReady">GitHub</a>
  </p>
</div>
