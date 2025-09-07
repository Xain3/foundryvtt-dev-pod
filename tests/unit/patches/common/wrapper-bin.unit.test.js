import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { runBashScript } from '#tests/utils/shell.js';

jest.setTimeout(20000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is .../tests/unit/patches/common; go up 4 levels to repo root
const rootDir = path.resolve(__dirname, '../../../../');

const entryDir = path.resolve(rootDir, 'patches/entrypoint');
const commonDir = path.resolve(rootDir, 'patches/common');

const scriptSync = path.join(entryDir, '10-sync-host-content.sh');
const scriptUseCache = path.join(entryDir, '00-use-cache-or-stagger.sh');

describe('wrapper-bin.sh thin wrappers', () => {
  it('prints help with --help', async () => {
    const res = await runBashScript(scriptSync, ['--help'], { env: { ...process.env, WRAPPER_TEST_MODE: '1', DRY_RUN: '1', WRAPPER_RUN_MODE: 'default' } });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Usage:/);
    expect(res.stdout + res.stderr).toMatch(/--wrapper-target/);
  });

  it('supports dry-run without requiring node', async () => {
    const res = await runBashScript(scriptSync, [], {
      env: { ...process.env, DRY_RUN: '1', WRAPPER_TEST_MODE: '1', WRAPPER_NODE_BIN: '/nonexistent/bin/node' },
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/\[patch\] .*: Delegating to Node\.js script/);
    expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would/);
  });

  it('fails when node is missing and not dry-run (test-friendly)', async () => {
    const res = await runBashScript(scriptSync, [], {
      env: { ...process.env, WRAPPER_TEST_MODE: '1', NODE_BIN: '/nonexistent/node', WRAPPER_NODE_BIN: '/nonexistent/node', DRY_RUN: '0' },
    });
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/\[patch\]\[error\] .*node not found/i);
  });

  it('accepts --wrapper-ext override', async () => {
    const res = await runBashScript(scriptSync, ['--wrapper-ext', 'mjs'], {
      env: { ...process.env, DRY_RUN: '1', WRAPPER_TEST_MODE: '1' },
    });
    expect(res.code).toBe(0);
  expect(res.stdout).toMatch(/Would run initial sync: [\s\S]*sync-host-content\.mjs[\s\S]* --initial-only/);
  });

  it('accepts --wrapper-target overrides (comma separated)', async () => {
    const res = await runBashScript(scriptSync, ['--wrapper-target', 'sync-host-content,install-components', '--', '--flag', 'v'], {
      env: { ...process.env, DRY_RUN: '1', WRAPPER_TEST_MODE: '1' },
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Would run initial sync: .*sync-host-content\.mjs/);
    expect(res.stdout).toMatch(/Would run initial sync: .*install-components\.mjs/);
    expect(res.stdout).toMatch(/--flag v/);
  });
});

describe('wrapper-lib.sh normalization', () => {
  const wrapperLib = path.join(commonDir, 'wrapper-lib.sh');
  const wrapperBin = path.join(commonDir, 'wrapper-bin.sh');

  it('skips invalid normalized paths in collect_wrapper_targets', async () => {
    // Build a small shim that sources wrapper-lib and calls collect_wrapper_targets
    const shim = `#!/usr/bin/env bash\nset -euo pipefail\nsource '${wrapperLib}'\ncollect_wrapper_targets '${commonDir}' 'mjs' --wrapper-target 'does-not-exist,install-components'`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omh-shim-'));
    const shimPath = path.join(tmpDir, 'shim_collect.sh');
    await fs.writeFile(shimPath, shim, { mode: 0o755 });
    try {
      const res = await runBashScript(shimPath, [], {});
      // Should output only valid target(s) that resolve under commonDir
      expect(res.stdout).toMatch(/install-components\.mjs/);
    } finally {
      try { await fs.rm(shimPath, { force: true }); } catch {}
    }
  });
});
