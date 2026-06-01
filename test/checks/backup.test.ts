import { BackupCheck } from '../../src/checks/backup';
import { AuditContext, DEFAULT_CONFIG } from '../../src/types';

describe('BackupCheck', () => {
  const check = new BackupCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('backup');
    expect(check.category).toBe('ops');
  });

  it('returns PASS when project is not production', async () => {
    const context = mockContext({
      config: { ...DEFAULT_CONFIG,
        project: { name: 'test', type: 'api', isProd: false, maturity: 'mvp' },
      },
    });
    const result = await check.run(context);
    expect(result.status).toBe('PASS');
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
