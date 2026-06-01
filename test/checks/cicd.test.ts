import { CiCdCheck } from '../../src/checks/cicd';
import { AuditContext, DEFAULT_CONFIG } from '../../src/types';

describe('CiCdCheck', () => {
  const check = new CiCdCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('ci');
    expect(check.category).toBe('ops');
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
