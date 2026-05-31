import { SessionCheck } from '../../src/checks/session';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('SessionCheck', () => {
  const check = new SessionCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('session');
    expect(check.category).toBe('security');
  });

  it('skips when no session library found', async () => {
    const result = await check.run(mockContext());
    expect(result.status).toBe('SKIP');
  });
});
