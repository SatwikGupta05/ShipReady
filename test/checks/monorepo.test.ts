import { MonorepoCheck } from '../../src/checks/monorepo';
import { AuditContext, DEFAULT_CONFIG } from '../../src/types';

describe('MonorepoCheck', () => {
  const check = new MonorepoCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('monorepo');
    expect(check.category).toBe('ops');
  });

  it('skips for single-package projects', () => {
    const context = mockContext();
    expect(check.isRelevant!(context)).toBe(false);
  });

  it('runs for multi-package projects', () => {
    const context = mockContext({
      files: [],
      packages: [
        { name: 'root', path: '/root', relativePath: '.', packageJson: {} },
        { name: 'pkg1', path: '/root/packages/pkg1', relativePath: 'packages/pkg1', packageJson: {} },
      ],
    });
    expect(check.isRelevant!(context)).toBe(true);
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
