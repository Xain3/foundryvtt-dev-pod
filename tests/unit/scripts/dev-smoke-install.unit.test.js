import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { smokeInstall } from './dev-smoke-install.js';

jest.setTimeout(20000);

describe('dev-smoke-install (unit smoke)', () => {
  test('smokeInstall executes with local path and dry-run', async () => {
    const tmpWorld = path.join(os.tmpdir(), `omh-smoke-world-${Date.now()}`);
    fs.mkdirSync(tmpWorld, { recursive: true });

    const env = {
      PATCH_DRY_RUN: '1',
      PATCH_DEBUG: '1'
    };

    const res = await smokeInstall({ type: 'world', id: 'example_world', path: tmpWorld }, env);
    expect(res).toBeTruthy();
    expect(typeof res.version).toBe('string');
    expect(res.args).toMatchObject({ type: 'world', id: 'example_world' });
    expect(fs.existsSync(res.configPath)).toBe(true);
    // Ensure config file is valid JSON
    const cfg = JSON.parse(fs.readFileSync(res.configPath, 'utf8'));
    expect(cfg).toHaveProperty('versions');
  });
});
