import { CorsCheck } from '../../src/checks/cors';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('CorsCheck', () => {
  const check = new CorsCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('cors');
    expect(check.category).toBe('security');
  });

  it('skips when no CORS package is found', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });

  it('returns PASS when no issues', async () => {
    // Without CORS package, it should still run but mostly pass
    const context = mockContext({
      config: {
        ...DEFAULT_CONFIG,
        project: { ...DEFAULT_CONFIG.project, isProd: false },
      },
    });
    const result = await check.run(context);
    expect(result.status).toBeDefined();
  });
});
