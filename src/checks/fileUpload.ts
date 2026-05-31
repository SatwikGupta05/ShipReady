import path from 'path';
import { ShipReadyCheck, AuditContext, CheckResult, CheckItem } from '../types';
import { collectFilesByExtension, readFileSafely } from '../utils/files';
import { calculateConfidence, determineCheckStatus } from '../utils/scoring';

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage'];

const UPLOAD_LIBRARIES = ['multer', 'formidable', 'busboy', 'express-fileupload', 'file-type', 'sharp'];

export class FileUploadCheck implements ShipReadyCheck {
  name = 'fileUpload';
  category = 'security' as const;
  supportedLanguages = ['node' as const];

  isRelevant(context: AuditContext): boolean {
    return context.packages.some(pkg => {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      return UPLOAD_LIBRARIES.some(lib => deps[lib]);
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

    let hasUploadLib = false;
    let hasFileSizeLimit = false;
    let hasMimeTypeFilter = false;
    let hasUploadHandler = false;
    let hasDangerousPath = false;
    let hasVirusScan = false;
    const installedLibs: string[] = [];

    // Check package.json
    for (const pkg of context.packages) {
      const deps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.devDependencies || {}) };
      for (const lib of UPLOAD_LIBRARIES) {
        if (deps[lib]) {
          hasUploadLib = true;
          installedLibs.push(lib);
        }
      }
    }

    if (!hasUploadLib) {
      return {
        check: this.name,
        status: 'SKIP',
        confidence: 0,
        items: [],
        summary: 'Skipped — no file upload library detected in project',
        category: this.category,
      };
    }

    for (const file of files) {
      const content = readFileSafely(file, 256);
      if (!content) continue;

      const relativePath = path.relative(context.rootDir, file);

      // Check for upload configuration
      if (/multer\s*\(/i.test(content) || /upload\s*=|\.single\(|\.array\(|\.fields\(|\.any\(/i.test(content)) {
        hasUploadHandler = true;
      }

      // Check for file size limits
      if (/limits\s*:/i.test(content) && (/\bfileSize\b/i.test(content) || /\bfieldSize\b/i.test(content))) {
        hasFileSizeLimit = true;
      }

      // Check for file filter / mime type validation
      if (/fileFilter|mimetype|mimeType|allowedTypes|allowedMimeTypes|accept\s*:/i.test(content)) {
        hasMimeTypeFilter = true;
      }

      // Check for dangerous path handling
      if (/path\.(join|resolve)\s*\([^)]*\.(originalname|filename|name)/i.test(content)) {
        hasDangerousPath = true;
        const lines = content.split('\n');
        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/path\.(join|resolve)\s*\([^)]*\.(originalname|filename|name)/i.test(lines[i])) {
            lineNumber = i + 1;
            break;
          }
        }

        items.push({
          type: 'DANGEROUS_PATH_HANDLING',
          severity: 'HIGH',
          message: 'File path constructed from user-supplied filename without sanitization',
          impact: 'Attackers can use path traversal (e.g., "../../etc/passwd") to overwrite system files',
          fix: 'Sanitize filenames and use a UUID-based naming strategy. Never trust user-supplied filenames.',
          file: relativePath,
          line: lineNumber,
          confidence: 0.85,
        });
      }
    }

    // Check for missing file size limit
    if (hasUploadHandler && !hasFileSizeLimit) {
      items.push({
        type: 'MISSING_FILE_SIZE_LIMIT',
        severity: 'HIGH',
        message: 'No file size limit configured for uploads',
        impact: 'Attackers can upload arbitrarily large files, causing denial of service',
        fix: 'Set a reasonable file size limit (e.g., limits: { fileSize: 5 * 1024 * 1024 } for 5MB)',
        confidence: 0.8,
      });
    }

    // Check for missing file type validation
    if (hasUploadHandler && !hasMimeTypeFilter) {
      items.push({
        type: 'MISSING_MIME_TYPE_VALIDATION',
        severity: 'HIGH',
        message: 'No MIME type validation configured for uploads',
        impact: 'Attackers can upload executable scripts or malware disguised as legitimate files',
        fix: 'Implement a fileFilter to validate MIME types and only allow safe file extensions',
        confidence: 0.7,
      });
    }

    // Check for no virus scanning
    if (hasUploadHandler && !hasVirusScan) {
      items.push({
        type: 'NO_VIRUS_SCAN',
        severity: 'MEDIUM',
        message: 'No virus/malware scanning detected for uploaded files',
        impact: 'Malicious files could be stored and served to users',
        fix: 'Consider integrating virus scanning (e.g., ClamAV) for uploaded files',
        confidence: 0.4,
      });
    }

    // Check multer({ dest: ... }) without proper config
    if (hasUploadHandler && !hasFileSizeLimit && !hasMimeTypeFilter) {
      // Already added individual warnings, this is just for confidence
    }

    indicators.push({ found: hasUploadLib, weight: 1 });
    indicators.push({ found: hasUploadHandler, weight: 1 });
    indicators.push({ found: hasFileSizeLimit, weight: 1 });
    indicators.push({ found: hasMimeTypeFilter, weight: 1 });
    indicators.push({ found: hasDangerousPath, weight: 2 });

    const confidence = calculateConfidence(indicators);
    const { status } = determineCheckStatus(items, context.config.severity);

    const summary = items.length === 0
      ? 'File upload configuration looks secure'
      : `Found ${items.length} file upload security issue(s)`;

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
