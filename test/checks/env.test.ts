import { EnvCheck } from '../../src/checks/env';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('EnvCheck', () => {
  const check = new EnvCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('env');
    expect(check.category).toBe('ops');
  });

  it('returns a result', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
