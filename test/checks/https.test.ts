import { HttpsCheck } from '../../src/checks/https';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('HttpsCheck', () => {
  const check = new HttpsCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('https');
    expect(check.category).toBe('security');
  });

  it('returns a result', async () => {
    const result = await check.run(mockContext({
      config: {
        ...DEFAULT_CONFIG,
        project: { ...DEFAULT_CONFIG.project, isProd: false },
      },
    }));
    expect(result.summary).toBeTruthy();
  });
});
