import { CachingCheck } from '../../src/checks/caching';
import { AuditContext, DEFAULT_CONFIG } from '../../src/types';

describe('CachingCheck', () => {
  const check = new CachingCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('caching');
    expect(check.category).toBe('performance');
  });

  it('returns WARN when no caching configured', async () => {
    const context = mockContext();
    const result = await check.run(context);
    expect(result.status).toBe('WARN');
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
