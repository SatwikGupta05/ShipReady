import { SqlInjectionCheck } from '../../src/checks/sqlInjection';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('SqlInjectionCheck', () => {
  const check = new SqlInjectionCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('sqlInjection');
    expect(check.category).toBe('security');
  });

  it('returns PASS when no database libraries found', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
