import fs from 'fs';
import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

export class BackupCheck implements ShipReadyCheck {
  name = 'backup';
  category = 'ops' as const;
  supportedLanguages = ['node' as const, 'python' as const, 'go' as const, 'java' as const, 'rust' as const];

  isRelevant(context: AuditContext): boolean {
    return context.config.project.isProd !== false;
  }

  async run(context: AuditContext): Promise<CheckResult> {
    const items: CheckItem[] = [];
    const indicators: Array<{ found: boolean; weight: number }> = [];

    let hasDbBackupScript = false;
    let hasBackupService = false;
    let hasScheduledBackup = false;
    let hasDisasterRecovery = false;
    let hasDataExport = false;

    // 1. Check for backup scripts / tools
    const scriptPatterns = [
      /backup/i, /pg_dump/i, /mongodump/i, /mysqldump/i,
      /restore/i, /snapshot/i, /replicate/i,
    ];

    const sourceFiles = context.files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.ts', '.js', '.sh', '.bash', '.ps1', '.py', '.yml', '.yaml'].includes(ext);
    }).slice(0, 200);

    for (const file of sourceFiles) {
      const content = readFileSafely(file, 64);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);
      const basename = path.basename(file).toLowerCase();

      // Check for explicit backup scripts
      if (/backup/i.test(basename) || /restore/i.test(basename) || /snapshot/i.test(basename)) {
        hasDbBackupScript = true;
      }

      if (scriptPatterns.some(p => p.test(content))) {
        if (/cron|schedule|every|daily|weekly|hourly|nightly/i.test(content)) {
          hasScheduledBackup = true;
        }
        if (/s3|gcs|azure|aws|cloud|bucket|storage/i.test(content)) {
          hasBackupService = true;
        }
        if (/disaster|dr|failover|recovery|restore|replicate/i.test(content)) {
          hasDisasterRecovery = true;
        }
      }

      if (/export|csv|json.*dump|data.*export/i.test(content)) {
        hasDataExport = true;
      }
    }

    // 2. Check package.json for backup-related scripts
    for (const pkg of context.packages) {
      const scripts = pkg.packageJson.scripts || {};
      for (const [, script] of Object.entries(scripts) as [string, string][]) {
        if (/backup|dump|restore|snapshot/i.test(script)) {
          hasDbBackupScript = true;
          if (/cron|schedule/i.test(script)) hasScheduledBackup = true;
        }
      }

      // Check dependencies for backup services
      const allDeps = { ...(pkg.packageJson.dependencies || {}) };
      const depNames = Object.keys(allDeps);
      const backupLibs = ['pg-backup', 'mongodb-backup', 'mysqldump', 'backblaze', 'aws-sdk', '@google-cloud/storage', 'azure-storage'];
      for (const lib of backupLibs) {
        if (depNames.some(d => d.includes(lib))) {
          hasBackupService = true;
          break;
        }
      }
    }

    indicators.push({ found: hasDbBackupScript, weight: 0.25 });
    indicators.push({ found: hasScheduledBackup, weight: 0.2 });
    indicators.push({ found: hasBackupService, weight: 0.2 });
    indicators.push({ found: hasDisasterRecovery, weight: 0.2 });
    indicators.push({ found: hasDataExport, weight: 0.15 });

    if (!hasDbBackupScript && context.config.project.isProd !== false) {
      items.push({
        type: 'NO_BACKUP_STRATEGY',
        severity: 'HIGH',
        message: 'No database backup strategy detected',
        impact: 'Without backups, data loss from corruption, attacks, or accidents is irreversible',
        fix: 'Set up automated database backups using pg_dump (PostgreSQL), mongodump (MongoDB), or a managed backup service',
        confidence: 0.7,
      });
    }

    if (!hasScheduledBackup && hasDbBackupScript) {
      items.push({
        type: 'NO_SCHEDULED_BACKUP',
        severity: 'MEDIUM',
        message: 'Backup script detected but no scheduling mechanism found',
        impact: 'Manual backups are unreliable and easily forgotten, leaving data unprotected between runs',
        fix: 'Schedule backups using cron, GitHub Actions, systemd timers, or a cloud scheduler',
        confidence: 0.6,
      });
    }

    if (!hasDisasterRecovery && context.config.project.isProd !== false) {
      items.push({
        type: 'NO_DISASTER_RECOVERY',
        severity: 'MEDIUM',
        message: 'No disaster recovery plan detected',
        impact: 'Without a recovery plan, restoring from backup can take hours or fail entirely',
        fix: 'Document and test a disaster recovery plan including backup restoration steps, failover procedures, and RTO/RPO targets',
        confidence: 0.4,
      });
    }

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'Backup strategy appears adequate'
      : `Found ${items.length} backup improvement(s)`;

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
