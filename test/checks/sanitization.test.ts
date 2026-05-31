import { SanitizationCheck } from '../../src/checks/sanitization';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('SanitizationCheck', () => {
  const check = new SanitizationCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('sanitization');
    expect(check.category).toBe('security');
  });

  it('runs and returns a result', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
