import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEMP_WRAPPER = '99-test-sync-loop.sh';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is .../tests/unit/patches; go up 3 levels to reach repo root
const repoRoot = path.resolve(__dirname, '../../..');
const commonDir = path.join(repoRoot, 'patches', 'common');

function runBash(script, args = [], env = {}) {
  const cmd = 'bash';
  const finalArgs = [script, ...args];
  const res = spawnSync(cmd, finalArgs, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return res;
}

// Helper to create a transient thin wrapper to exercise wrapper-bin/wrapper-lib
function makeTempWrapper(filename, contents) {
  const dirPath = path.join(repoRoot, 'patches', 'entrypoint');
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, filename);
  fs.writeFileSync(filePath, contents, { encoding: 'utf8', mode: 0o755 });
  return filePath;
}

describe('docker patches: wrapper-lib/bin', () => {
  const wrapperBin = path.join(commonDir, 'wrapper-bin.sh');
  const wrapperLib = path.join(commonDir, 'wrapper-lib.sh');

  it('exists and is sourceable', () => {
    expect(fs.existsSync(wrapperBin)).toBe(true);
    expect(fs.existsSync(wrapperLib)).toBe(true);

  const script = `set -euo pipefail; source ${JSON.stringify(wrapperLib)}; echo ok`;
    const res = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('ok');
  });

  it('derives metadata from wrapper filename (with prefix)', () => {
    const script = `set -euo pipefail; source ${JSON.stringify(wrapperLib)}; derive_patch_metadata 10-foo-bar.sh`;
    const res = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const [num, name, scriptName] = res.stdout.trim().split('|');
    expect(num).toBe('10');
    expect(name).toBe('foo-bar');
    expect(scriptName).toBe('foo-bar.mjs');
  });

  it('derives metadata from wrapper filename (no prefix)', () => {
    const script = `set -euo pipefail; source ${JSON.stringify(wrapperLib)}; derive_patch_metadata foo.sh`;
    const res = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const [num, name, scriptName] = res.stdout.trim().split('|');
    expect(num).toBe('');
    expect(name).toBe('foo');
    expect(scriptName).toBe('foo.mjs');
  });

  it('detects dry-run from env vars and args', () => {
    const script = `set -euo pipefail; source ${JSON.stringify(wrapperLib)}; detect_dry_run  "1" "" --foo`;
    const res = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('1');

  const res2 = spawnSync('bash', ['-c', `set -euo pipefail; source ${JSON.stringify(wrapperLib)}; detect_dry_run  "" "" --dry-run`], { encoding: 'utf8' });
    expect(res2.status).toBe(0);
    expect(res2.stdout.trim()).toBe('1');
  });

  it('wrapper-bin default mode prints command on dry-run and succeeds', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source ${JSON.stringify(wrapperBinAbs)}`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n --x=1',
      ''
    ].join('\n');
    const file = makeTempWrapper('99-test-default.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
  expect(res.stdout).toMatch(/\[patch\].*Delegating/);
  expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would run: .*common\/test-default\.mjs/);
    } finally {
      try { fs.unlinkSync(file); } catch {}
    }
  });

  it('wrapper-bin sync-loop mode prints both commands on dry-run', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source ${JSON.stringify(wrapperBinAbs)}`,
      'export WRAPPER_RUN_MODE="sync-loop"',
      'wrapper_main -n --y=2',
      ''
    ].join('\n');
    const file = makeTempWrapper(TEMP_WRAPPER, contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
  expect(res.stdout).toMatch(/\[patch\].*Delegating/);
  expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would run initial sync: .*common\/test-sync-loop\.mjs/);
  expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would start loop in background: .*common\/test-sync-loop\.mjs/);
    } finally {
      try { fs.unlinkSync(file); } catch {}
    }
  });
});
