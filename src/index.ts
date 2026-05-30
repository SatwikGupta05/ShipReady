#!/usr/bin/env node

import { Command } from 'commander';
import { runAudit } from './runner';

// =============================================
// Color helpers
// =============================================

function green(text: string): string { return `\x1b[32m${text}\x1b[0m`; }
function red(text: string): string { return `\x1b[31m${text}\x1b[0m`; }
function yellow(text: string): string { return `\x1b[33m${text}\x1b[0m`; }
function dim(text: string): string { return `\x1b[2m${text}\x1b[0m`; }
function bold(text: string): string { return `\x1b[1m${text}\x1b[0m`; }
function cyan(text: string): string { return `\x1b[36m${text}\x1b[0m`; }

// =============================================

const program = new Command();

program
  .name('shipready')
  .description('Catch production bugs before they catch you 🚀')
  .version('0.1.0');

program
  .command('audit')
  .description('Run a production readiness audit on your project')
  .option('-d, --dir <path>', 'Project directory to audit (default: current directory)')
  .option('-c, --config <path>', 'Path to .shipready.yml config file')
  .option('-f, --format <format>', 'Output format: human|json|html', 'human')
  .option('--json', 'Output as JSON (shorthand for --format=json)')
  .option('--strict', 'Strict mode (fail on MEDIUM issues too, not just CRITICAL/HIGH)')
  .option('-o, --output <path>', 'Output file path (for HTML or JSON format)')
  .option('--no-color', 'Disable colored output')
  .option('--fix', 'Auto-fix fixable issues (e.g. missing .dockerignore, .env.example)')
  .action(async (options) => {
    try {
      const projectDir = options.dir || process.cwd();

      // Show scanning banner
      console.log('');
      console.log(`  ${bold('🔍 ShipReady')} scanning ${cyan(projectDir)}`);
      console.log(`  ${dim('═'.repeat(50))}`);
      console.log('');

      // Run the audit
      const summary = await runAudit({
        dir: options.dir,
        configPath: options.config,
        format: options.json ? 'json' : options.format,
        strict: !!options.strict,
      });

      // Basic summary output
      const passText = green(`✓ ${summary.passed} passed`);
      const failText = red(`✗ ${summary.failed} failed`);
      const warnText = yellow(`⚠ ${summary.warnings} warned`);
      const skipText = dim(`? ${summary.skipped} skipped`);
      console.log(`  ${passText}  ${failText}  ${warnText}  ${skipText}  ${dim(`(${summary.durationMs}ms)`)}`);
      console.log(`  Risk Score: ${bold(String(summary.riskScore))}/10`);
      console.log('');

      process.exit(summary.failed > 0 ? 1 : 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n  ${red('❌ Error:')} ${message}\n`);
      process.exit(1);
    }
  });

program
  .command('help')
  .description('Show help')
  .action(() => {
    program.help();
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.help();
}
