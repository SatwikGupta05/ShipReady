import { ErrorsCheck } from '../../src/checks/errors';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('ErrorsCheck', () => {
  const check = new ErrorsCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('errors');
    expect(check.category).toBe('reliability');
  });

  it('returns a result', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
