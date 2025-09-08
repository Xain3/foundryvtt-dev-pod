import { execSync } from 'child_process';
import path from 'path';

test('sync-package-schema.sh no-op when remote equals local', () => {
  const repoRoot = '.';
  const local = path.join(repoRoot, 'schemas', 'package.schema.json');
  const remoteUrl = `file://${process.cwd()}/${local}`;
  const out = execSync(`bash .github/scripts/sync-package-schema.sh`, { env: { ...process.env, REMOTE_URL: remoteUrl } }).toString();
  expect(out).toMatch(/Local schema is up-to-date.|Local schema missing; creating/);
});
