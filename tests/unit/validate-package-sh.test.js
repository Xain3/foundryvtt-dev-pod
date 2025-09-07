import { execSync } from 'child_process';

describe('validate-package.sh', () => {
  test('calls node validator and completes', () => {
    const out = execSync('bash ./scripts/validate-package.sh', { env: { ...process.env, USE_LOCAL_SCHEMA: '1' } }).toString();
    expect(out).toMatch(/Validating package.json|OK: JSON Schema validation passed|Using local package.json schema fallback/);
  });
});
