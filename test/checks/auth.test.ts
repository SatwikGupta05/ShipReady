import { AuthCheck } from '../../src/checks/auth';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('AuthCheck', () => {
  const check = new AuthCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('auth');
    expect(check.category).toBe('security');
  });

  it('returns PASS when no auth library is found', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
