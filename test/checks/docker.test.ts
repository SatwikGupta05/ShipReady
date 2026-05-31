import { DockerCheck } from '../../src/checks/docker';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('DockerCheck', () => {
  const check = new DockerCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('docker');
    expect(check.category).toBe('ops');
  });

  it('returns a result', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
  });
});
