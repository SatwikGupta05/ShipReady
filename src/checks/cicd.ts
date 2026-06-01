import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const CI_CONFIG_PATTERNS: Array<{
  file: string;
  name: string;
  weight: number;
}> = [
  { file: '.github/workflows', name: 'GitHub Actions', weight: 0.25 },
  { file: '.gitlab-ci.yml', name: 'GitLab CI', weight: 0.25 },
  { file: '.circleci/config.yml', name: 'CircleCI', weight: 0.2 },
  { file: '.jenkins/', name: 'Jenkins', weight: 0.15 },
  { file: 'Jenkinsfile', name: 'Jenkins Pipeline', weight: 0.15 },
  { file: 'bitbucket-pipelines.yml', name: 'Bitbucket Pipelines', weight: 0.15 },
  { file: '.drone.yml', name: 'Drone CI', weight: 0.15 },
  { file: 'azure-pipelines.yml', name: 'Azure Pipelines', weight: 0.15 },
  { file: 'buildkite/', name: 'Buildkite', weight: 0.15 },
  { file: '.semaphore/', name: 'Semaphore CI', weight: 0.15 },
  { file: '.travis.yml', name: 'Travis CI', weight: 0.15 },
  { file: 'appveyor.yml', name: 'AppVeyor', weight: 0.1 },
  { file: 'codefresh.yml', name: 'Codefresh', weight: 0.1 },
  { file: '.woodpecker/', name: 'Woodpecker CI', weight: 0.1 },
];

export class CiCdCheck implements ShipReadyCheck {
  name = 'ci';
  category = 'ops' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    let detectedCiNames: string[] = [];
    let hasCi = false;
    let hasLintStep = false;
    let hasTestStep = false;
    let hasBuildStep = false;
    let hasDeployStep = false;
    let hasSecurityScan = false;
    let hasCacheStep = false;
    let hasMatrixBuild = false;

    // Check for CI config files
    for (const ci of CI_CONFIG_PATTERNS) {
      for (const pkg of context.packages) {
        const ciPath = path.join(pkg.path, ci.file);
        // For directory patterns, check if dir exists with files
        if (ci.file.endsWith('/')) {
          if (fs.existsSync(ciPath)) {
            const files = fs.readdirSync(ciPath);
            if (files.length > 0) {
              hasCi = true;
              detectedCiNames.push(ci.name);

              // Parse workflow files for steps
              for (const f of files) {
                const content = readFileSafely(path.join(ciPath, f), 256);
                if (!content) continue;
                if (/lint|eslint|prettier|standard/i.test(content)) hasLintStep = true;
                if (/test|jest|mocha|vitest|rspec|pytest/i.test(content)) hasTestStep = true;
                if (/build|compile|bundle|dist/i.test(content)) hasBuildStep = true;
                if (/deploy|release|publish|push.*docker|aws|gcp|azure/i.test(content)) hasDeployStep = true;
                if (/snyk|trivy|codeql|security|audit|dependency-check|semgrep/i.test(content)) hasSecurityScan = true;
                if (/cache|restore|save/i.test(content)) hasCacheStep = true;
                if (/matrix|strategy.*matrix|include.*os/i.test(content)) hasMatrixBuild = true;
              }
              break;
            }
          }
        } else {
          // Single file check
          const fullPath = path.join(pkg.path, ci.file);
          if (fs.existsSync(fullPath)) {
            hasCi = true;
            detectedCiNames.push(ci.name);

            const content = readFileSafely(fullPath, 256);
            if (content) {
              if (/lint|eslint|prettier|standard/i.test(content)) hasLintStep = true;
              if (/test|jest|mocha|vitest|rspec|pytest/i.test(content)) hasTestStep = true;
              if (/build|compile|bundle|dist/i.test(content)) hasBuildStep = true;
              if (/deploy|release|publish|push.*docker|aws|gcp|azure/i.test(content)) hasDeployStep = true;
              if (/snyk|trivy|codeql|security|audit|dependency-check|semgrep/i.test(content)) hasSecurityScan = true;
              if (/cache|restore|save/i.test(content)) hasCacheStep = true;
              if (/matrix|strategy.*matrix|include.*os/i.test(content)) hasMatrixBuild = true;
            }
            break;
          }
        }
      }
      // If we already detected CI for this pattern, skip adding another indicator entry
      // Actually we need to properly handle this
    }

    // Recalculate indicators properly
    indicators.length = 0;
    indicators.push({ found: hasCi, weight: 0.3 });

    if (!hasCi) {
      items.push({
        type: 'NO_CI_CD',
        severity: 'HIGH',
        message: 'No CI/CD pipeline detected',
        impact: 'Without CI/CD, code changes must be manually built and deployed, increasing risk of human error and delaying releases',
        fix: 'Set up a CI/CD pipeline using GitHub Actions, GitLab CI, or CircleCI with automated lint, test, and build steps',
        confidence: 0.9,
      });
    }

    if (hasCi) {
      indicators.push({ found: hasLintStep, weight: 0.15 });
      indicators.push({ found: hasTestStep, weight: 0.15 });
      indicators.push({ found: hasBuildStep, weight: 0.15 });
      indicators.push({ found: hasDeployStep, weight: 0.15 });
      indicators.push({ found: hasSecurityScan, weight: 0.1 });
      indicators.push({ found: hasCacheStep, weight: 0.1 });
      indicators.push({ found: hasMatrixBuild, weight: 0.05 });

      if (!hasLintStep) {
        items.push({
          type: 'CI_MISSING_LINT',
          severity: 'MEDIUM',
          message: 'CI pipeline is missing a lint step',
          impact: 'Code style and formatting issues can slip through without automated linting',
          fix: 'Add a lint step to your CI pipeline: `npx eslint .` or `npx prettier --check .`',
          confidence: 0.6,
        });
      }

      if (!hasTestStep) {
        items.push({
          type: 'CI_MISSING_TESTS',
          severity: 'HIGH',
          message: 'CI pipeline is missing a test step',
          impact: 'Without automated tests in CI, broken code can be merged and deployed',
          fix: 'Add a test step to your CI pipeline: `npm test` or `jest`',
          confidence: 0.8,
        });
      }

      if (!hasBuildStep) {
        items.push({
          type: 'CI_MISSING_BUILD',
          severity: 'MEDIUM',
          message: 'CI pipeline is missing a build step',
          impact: 'Build errors are only caught during deployment, causing delays',
          fix: 'Add a build step to your CI pipeline: `npm run build`',
          confidence: 0.5,
        });
      }

      if (!hasSecurityScan) {
        items.push({
          type: 'CI_MISSING_SECURITY',
          severity: 'MEDIUM',
          message: 'CI pipeline is missing security scanning',
          impact: 'Vulnerable dependencies can be deployed without automated checks',
          fix: 'Add security scanning with `npm audit`, Snyk, or GitHub CodeQL',
          confidence: 0.5,
        });
      }
    }

    // Check for scripts in package.json (basic CI readiness)
    for (const pkg of context.packages) {
      const scripts = pkg.packageJson.scripts || {};
      if (scripts.test) indicators.push({ found: true, weight: 0.05 });
      if (scripts.lint || scripts.format) indicators.push({ found: true, weight: 0.03 });
      if (scripts.build) indicators.push({ found: true, weight: 0.03 });
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? `CI/CD configured${hasCi ? ` (${detectedCiNames.join(', ')})` : ''}`
      : `Found ${items.length} CI/CD improvement(s)`;

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
