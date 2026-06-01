import { LoadBalancerCheck } from '../../src/checks/loadBalancer';
import { AuditContext, DEFAULT_CONFIG } from '../../src/types';

describe('LoadBalancerCheck', () => {
  const check = new LoadBalancerCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG,
      project: { name: 'test', type: 'api', isProd: true, maturity: 'stable' },
    },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('loadBalancer');
    expect(check.category).toBe('ops');
  });

  it('returns PASS when config allows skipping', async () => {
    const context = mockContext({
      config: { ...DEFAULT_CONFIG,
        project: { name: 'test', type: 'api', isProd: false, maturity: 'mvp' },
      },
    });
    const result = await check.run(context);
    expect(result.status).toBe('PASS');
  });

  it('returns information about the check', async () => {
    const result = await check.run(mockContext());
    expect(result.summary).toBeTruthy();
    expect(typeof result.confidence).toBe('number');
  });
});
