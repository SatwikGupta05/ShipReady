import { FileUploadCheck } from '../../src/checks/fileUpload';
import { DEFAULT_CONFIG, AuditContext } from '../../src/types';

describe('FileUploadCheck', () => {
  const check = new FileUploadCheck();

  const mockContext = (overrides?: Partial<AuditContext>): AuditContext => ({
    rootDir: process.cwd(),
    config: { ...DEFAULT_CONFIG },
    packages: [],
    files: [],
    language: 'node',
    ...overrides,
  });

  it('has the correct name and category', () => {
    expect(check.name).toBe('fileUpload');
    expect(check.category).toBe('security');
  });

  it('skips when no upload library found', async () => {
    const result = await check.run(mockContext());
    expect(result.status).toBe('SKIP');
  });
});
