import fs from 'fs';
import path from 'path';
import { AuditContext, CheckItem, CheckResult } from './types';

/**
 * Fix result for a single item.
 */
export interface FixResult {
  itemType: string;
  success: boolean;
  message: string;
  file?: string;
}

/**
 * Fix mode engine that auto-fixes fixable issues.
 * Each check can register fix handlers for specific item types.
 */
export class Fixer {
  private fixHandlers: Map<string, (item: CheckItem, context: AuditContext) => FixResult> = new Map();

  constructor() {
    this.registerBuiltinFixes();
  }

  /**
   * Register a fix handler for a specific item type.
   */
  registerFix(
    itemType: string,
    handler: (item: CheckItem, context: AuditContext) => FixResult
  ): void {
    this.fixHandlers.set(itemType, handler);
  }

  /**
   * Attempt to fix all fixable items from a set of check results.
   */
  async fixAll(results: CheckResult[], context: AuditContext): Promise<FixResult[]> {
    const fixResults: FixResult[] = [];

    for (const result of results) {
      for (const item of result.items) {
        const handler = this.fixHandlers.get(item.type);
        if (handler) {
          const fixResult = handler(item, context);
          fixResults.push(fixResult);
        } else {
          fixResults.push({
            itemType: item.type,
            success: false,
            message: `No auto-fix available for ${item.type}. Manual fix: ${item.fix}`,
            file: item.file,
          });
        }
      }
    }

    return fixResults;
  }

  /**
   * Register built-in fix handlers.
   */
  private registerBuiltinFixes(): void {
    // Create .env.example from .env
    this.registerFix('HARDCODED_SECRET', (item, context) => {
      try {
        if (!item.file) {
          return { itemType: item.type, success: false, message: 'No file specified' };
        }
        // Can't auto-fix hardcoded secrets — require manual intervention
        return {
          itemType: item.type,
          success: false,
          message: 'Hardcoded secrets must be manually moved to environment variables',
          file: item.file,
        };
      } catch (error) {
        return {
          itemType: item.type,
          success: false,
          message: `Failed to fix: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    });

    // Create .dockerignore
    this.registerFix('MISSING_DOCKERIGNORE', (_item, context) => {
      try {
        const dockerignorePath = path.join(context.rootDir, '.dockerignore');
        if (fs.existsSync(dockerignorePath)) {
          return {
            itemType: 'MISSING_DOCKERIGNORE',
            success: true,
            message: '.dockerignore already exists',
            file: '.dockerignore',
          };
        }

        const content = [
          'node_modules',
          'npm-debug.log',
          'dist',
          'build',
          '.git',
          '.env',
          '.env.local',
          'coverage',
          '.next',
          '.turbo',
          '*.md',
          'Dockerfile',
          '.dockerignore',
        ].join('\n');

        fs.writeFileSync(dockerignorePath, content + '\n', 'utf-8');
        return {
          itemType: 'MISSING_DOCKERIGNORE',
          success: true,
          message: 'Created .dockerignore with recommended patterns',
          file: '.dockerignore',
        };
      } catch (error) {
        return {
          itemType: 'MISSING_DOCKERIGNORE',
          success: false,
          message: `Failed to create .dockerignore: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    });

    // Create .env.example
    this.registerFix('MISSING_ENV_EXAMPLE', (_item, context) => {
      try {
        const envExamplePath = path.join(context.rootDir, '.env.example');
        if (fs.existsSync(envExamplePath)) {
          return {
            itemType: 'MISSING_ENV_EXAMPLE',
            success: true,
            message: '.env.example already exists',
            file: '.env.example',
          };
        }

        // Check for .env file to base the example on
        const envPath = path.join(context.rootDir, '.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8');
          const exampleContent = envContent
            .split('\n')
            .map(line => {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) return line;
              // Keep keys but blank out values
              const eqIndex = line.indexOf('=');
              if (eqIndex === -1) return line;
              return line.substring(0, eqIndex + 1);
            })
            .join('\n');

          fs.writeFileSync(envExamplePath, exampleContent + '\n', 'utf-8');
          return {
            itemType: 'MISSING_ENV_EXAMPLE',
            success: true,
            message: 'Created .env.example from existing .env file (values blanked)',
            file: '.env.example',
          };
        }

        // No .env file — create a template
        const template = [
          '# Environment Configuration',
          '# Copy this file to .env and fill in your values',
          '',
          '# App',
          'PORT=3000',
          'NODE_ENV=development',
          '',
          '# Database',
          'DATABASE_URL=',
          '',
          '# Auth',
          'JWT_SECRET=',
          '',
          '# API Keys',
          'API_KEY=',
        ].join('\n');

        fs.writeFileSync(envExamplePath, template + '\n', 'utf-8');
        return {
          itemType: 'MISSING_ENV_EXAMPLE',
          success: true,
          message: 'Created .env.example with template values',
          file: '.env.example',
        };
      } catch (error) {
        return {
          itemType: 'MISSING_ENV_EXAMPLE',
          success: false,
          message: `Failed to create .env.example: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    });

    // Add .gitignore entries
    this.registerFix('ENV_IN_GITIGNORE', (_item, context) => {
      try {
        const gitignorePath = path.join(context.rootDir, '.gitignore');
        let content = '';

        if (fs.existsSync(gitignorePath)) {
          content = fs.readFileSync(gitignorePath, 'utf-8');
        }

        const missingEntries: string[] = [];
        const entriesToAdd = [
          '.env',
          '.env.local',
          '.env.production',
          '.env.development',
          'dist/',
          'build/',
          '.next/',
          '.turbo/',
          'coverage/',
        ];

        for (const entry of entriesToAdd) {
          if (!content.includes(entry)) {
            missingEntries.push(entry);
          }
        }

        if (missingEntries.length === 0) {
          return {
            itemType: 'ENV_IN_GITIGNORE',
            success: true,
            message: 'All recommended .gitignore entries already present',
            file: '.gitignore',
          };
        }

        const append = '\n# Environment files\n' + missingEntries.map(e => e).join('\n') + '\n';
        fs.appendFileSync(gitignorePath, append, 'utf-8');

        return {
          itemType: 'ENV_IN_GITIGNORE',
          success: true,
          message: `Added ${missingEntries.length} entries to .gitignore`,
          file: '.gitignore',
        };
      } catch (error) {
        return {
          itemType: 'ENV_IN_GITIGNORE',
          success: false,
          message: `Failed to update .gitignore: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
      }
    });
  }
}

/**
 * Convenience function to run the fixer on audit results.
 */
export async function runFixer(results: CheckResult[], context: AuditContext): Promise<FixResult[]> {
  const fixer = new Fixer();
  return fixer.fixAll(results, context);
}
