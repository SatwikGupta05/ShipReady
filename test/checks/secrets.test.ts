import { SecretsCheck } from '../../src/checks/secrets';
import { AuditContext, ShipReadyConfig, DEFAULT_CONFIG, WorkspacePackage } from '../../src/types';

describe('SecretsCheck', () => {
  const check = new SecretsCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('secrets');
    expect(check.category).toBe('security');
  });

  it('returns PASS when no secrets found', async () => {
    const context = mockContext({
      files: ['/test/file.ts'],
    });
    const result = await check.run(context);
    expect(result.status).toBe('PASS');
    expect(result.items).toHaveLength(0);
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
