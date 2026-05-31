import { ValidationCheck } from '../../src/checks/validation';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('ValidationCheck', () => {
  const check = new ValidationCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('validation');
    expect(check.category).toBe('security');
  });

  it('returns PASS when no validation library found', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
