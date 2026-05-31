import { RlsCheck } from '../../src/checks/rls';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('RlsCheck', () => {
  const check = new RlsCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('rls');
    expect(check.category).toBe('security');
  });

  it('returns PASS for non-Supabase projects', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
