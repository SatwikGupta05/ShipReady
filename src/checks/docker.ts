import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

export class DockerCheck implements ShipReadyCheck {
  name = 'docker';
  category = 'ops' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    // Check if Dockerfile exists in any workspace package
    return context.packages.some(pkg => {
      return fs.existsSync(path.join(pkg.path, 'Dockerfile')) ||
             fs.existsSync(path.join(pkg.path, 'docker-compose.yml')) ||
             fs.existsSync(path.join(pkg.path, 'docker-compose.yaml'));
    });
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    for (const pkg of context.packages) {
      const pkgPath = pkg.path;
      const relativePkgPath = path.relative(context.rootDir, pkgPath);

      // Check for Dockerfile
      const dockerfilePath = path.join(pkgPath, 'Dockerfile');
      const dockerfileExists = fs.existsSync(dockerfilePath);

      // Check for .dockerignore
      const dockerignorePath = path.join(pkgPath, '.dockerignore');
      const dockerignoreExists = fs.existsSync(dockerignorePath);

      // Check for docker-compose
      const composePath = path.join(pkgPath, 'docker-compose.yml');
      const composeExists = fs.existsSync(composePath) || fs.existsSync(path.join(pkgPath, 'docker-compose.yaml'));

      if (dockerfileExists) {
        const content = readFileSafely(dockerfilePath, 100);

        if (content) {
          // Check for root user
          if (!/USER\s+(?!root)\w+/i.test(content)) {
            items.push({
              type: 'ROOT_USER',
              severity: 'HIGH',
              message: 'Docker container runs as root user',
              impact: 'If compromised, attackers gain root access to the container',
              fix: 'Add a non-root user with `USER` directive in Dockerfile (e.g., `USER node`)',
              file: relativePkgPath + '/Dockerfile',
              confidence: 0.8,
            });
          }

          // Check for multi-stage build
          if (!/FROM\s+\S+\s+AS\s+/i.test(content) && !/FROM\s+\S+\s+as\s+/i.test(content)) {
            items.push({
              type: 'NO_MULTI_STAGE',
              severity: 'MEDIUM',
              message: 'Dockerfile does not use multi-stage builds',
              impact: 'Multi-stage builds reduce image size and attack surface',
              fix: 'Use multi-stage builds: separate build dependencies from runtime dependencies',
              file: relativePkgPath + '/Dockerfile',
              confidence: 0.5,
            });
          }

          // Check for pinned base image versions (no :latest)
          if (/:latest\b/.test(content)) {
            items.push({
              type: 'LATEST_TAG',
              severity: 'MEDIUM',
              message: 'Docker image uses ":latest" tag instead of a specific version',
              impact: 'Using :latest can lead to unpredictable builds and supply chain risks',
              fix: 'Pin base image to a specific version tag (e.g., `node:20-alpine` instead of `node:latest`)',
              file: relativePkgPath + '/Dockerfile',
              confidence: 0.7,
            });
          }

          // Check for COPY --chown
          if (content.includes('COPY ') && !/COPY\s+--chown/i.test(content)) {
            // This is a soft warning - not always an issue
            indicators.push({ found: false, weight: 0.3 });
          }

          // Check for HEALTHCHECK
          if (!/HEALTHCHECK/i.test(content)) {
            items.push({
              type: 'NO_HEALTHCHECK',
              severity: 'LOW',
              message: 'Dockerfile does not include HEALTHCHECK instruction',
              impact: 'Container orchestration cannot determine if the application is healthy',
              fix: 'Add HEALTHCHECK instruction (e.g., `HEALTHCHECK --interval=30s CMD curl -f http://localhost/ || exit 1`)',
              file: relativePkgPath + '/Dockerfile',
              confidence: 0.6,
            });
          }

          // Check for EXPOSE port
          if (!/EXPOSE\s+\d+/i.test(content)) {
            indicators.push({ found: false, weight: 0.2 });
          }
        }

        indicators.push({ found: true, weight: 1 }); // Has Dockerfile
      }

      if (!dockerignoreExists && dockerfileExists) {
        items.push({
          type: 'MISSING_DOCKERIGNORE',
          severity: 'MEDIUM',
          message: 'No .dockerignore file found',
          impact: 'Build context may include unnecessary files, increasing image size and build time',
          fix: 'Create a .dockerignore file to exclude node_modules, .git, and other unnecessary files',
          file: relativePkgPath,
          confidence: 0.7,
        });
      }

      if (composeExists) {
        const composeContent = readFileSafely(path.join(pkgPath, 'docker-compose.yml'), 200) ||
                              readFileSafely(path.join(pkgPath, 'docker-compose.yaml'), 200);

        if (composeContent) {
          // Check for exposed ports
          if (!/ports\s*:/i.test(composeContent)) {
            indicators.push({ found: false, weight: 0.2 });
          }
        }

        indicators.push({ found: true, weight: 0.5 }); // Has docker-compose
      }

      // If has Docker, check for package.json to see if scripts include docker
      const pkgJsonPath = path.join(pkgPath, 'package.json');
      if (fs.existsSync(pkgJsonPath) && dockerfileExists) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          const scripts = pkgJson.scripts || {};
          if (!Object.values(scripts as Record<string, string>).some(s => /docker/i.test(s))) {
            indicators.push({ found: false, weight: 0.2 });
          }
        } catch { /* ignore */ }
      }
    }

    indicators.push({ found: items.length === 0, weight: -0.5 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Docker configuration looks good'
      : `Found ${items.length} Docker issue(s)`;

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
