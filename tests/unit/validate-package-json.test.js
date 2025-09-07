import { execSync } from 'child_process';

describe('validate-package-json.js', () => {
  const script = './scripts/validate-package-json.js';

  test('uses local schema when USE_LOCAL_SCHEMA=1', () => {
    const out = execSync(`node ${script}`, { env: { ...process.env, USE_LOCAL_SCHEMA: '1' } }).toString();
    expect(out).toMatch(/Using local package.json schema fallback|OK: package.json matches/);
  });
});
