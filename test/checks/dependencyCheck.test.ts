import { DependencyCheck } from '../../src/checks/dependencyCheck';
import { AuditContext, DEFAULT_CONFIG, WorkspacePackage } from '../../src/types';
import path from 'path';

describe('DependencyCheck', () => {
  const check = new DependencyCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('dependencies');
    expect(check.category).toBe('security');
  });

  it('returns PASS when no packages have dependencies', async () => {
    const context = mockContext({
      packages: [{
        name: 'test',
        path: process.cwd(),
        relativePath: '.',
        packageJson: { name: 'test' },
      }],
    });
    const result = await check.run(context);
    expect(result.status).toBe('PASS');
    expect(result.items).toHaveLength(0);
  });

  it('detects deprecated packages', async () => {
    const context = mockContext({
      packages: [{
        name: 'test',
        path: process.cwd(),
        relativePath: '.',
        packageJson: {
          name: 'test',
          dependencies: {
            request: '^2.88.0',
            moment: '^2.29.0',
          },
        },
      }],
    });
    const result = await check.run(context);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some(i => i.message.includes('request'))).toBe(true);
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
