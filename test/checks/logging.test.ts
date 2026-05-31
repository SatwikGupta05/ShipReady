import { LoggingCheck } from '../../src/checks/logging';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('LoggingCheck', () => {
  const check = new LoggingCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('logging');
    expect(check.category).toBe('reliability');
  });

  it('returns a result', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
