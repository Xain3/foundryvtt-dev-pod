const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runScript(scriptPath, args = [], env = {}) {
  const result = spawnSync('bash', [scriptPath, ...args], {
    env: { ...process.env, WRAPPER_TEST_MODE: '1', ...env },
    encoding: 'utf8'
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

describe('wrapper scripts dry-run', () => {
  // Entry-point wrappers live in ../entrypoint, while .mjs files live in this common dir
  const baseDir = __dirname;
  // Tests run from tests/unit/patches/entrypoint; wrappers live in
  // docker/patches/entrypoint at repository root
  const wrapperDir = path.join(__dirname, '..', '..', '..', '..', 'docker', 'patches', 'entrypoint');

  describe('00-use-cache-or-stagger.sh', () => {
  const script = path.join(wrapperDir, '00-use-cache-or-stagger.sh');
  const expectedTarget = path.join(baseDir, 'use-cache-or-stagger.mjs');
  const expectedViaWrapperAbs = path.normalize(path.join(wrapperDir, '..', 'common', 'use-cache-or-stagger.mjs'));

    test('prints correct dry-run command (via PATCH_DRY_RUN)', () => {
    const { code, stdout, stderr } = runScript(script, [], { PATCH_DRY_RUN: '1' });
    expect([0, null]).toContain(code);
    expect(stderr).toBe('');
    expect(stdout).toContain('[patch][dry-run] Would run:');
    expect(stdout).toContain(expectedViaWrapperAbs);
  expect(stdout).toContain('--procedural-number 00');
  expect(stdout).toContain('--patch-name use-cache-or-stagger');
    });

    test('target .mjs file exists', () => {
      // verify the target .mjs file exists
  const fs = require('node:fs');
  const exists = fs.existsSync(expectedViaWrapperAbs);
  expect(exists).toBe(true);
    });

    test('prints help with -h/--help', () => {
      const { code, stdout, stderr } = runScript(script, ['-h'], { DRY_RUN: '1', WRAPPER_RUN_MODE: 'default' });
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toMatch(/Usage:/);
      const res2 = runScript(script, ['--help'], { DRY_RUN: '1', WRAPPER_RUN_MODE: 'default' });
      expect(res2.code).toBe(0);
      expect(res2.stderr).toBe('');
      expect(res2.stdout).toMatch(/--wrapper-target/);
    });
  });

  describe('10-sync-host-content.sh', () => {
  const script = path.join(wrapperDir, '10-sync-host-content.sh');
  const expectedTarget = path.join(baseDir, 'sync-host-content.mjs');
  const expectedViaWrapperAbs = path.normalize(path.join(wrapperDir, '..', 'common', 'sync-host-content.mjs'));

    test('prints correct dry-run command (via DRY_RUN)', () => {
    const { code, stdout, stderr } = runScript(script, [], { DRY_RUN: '1' });
    expect([0, null]).toContain(code);
    expect(stderr).toBe('');
    expect(stdout).toContain('[patch][dry-run] Would run initial sync:');
  expect(stdout).toContain('[patch][dry-run] Would start loop in background:');
  expect(stdout).toContain(expectedViaWrapperAbs);
  expect(stdout).toContain('--procedural-number 10');
  expect(stdout).toContain('--patch-name sync-host-content');
    });

    test('target .mjs file exists', () => {
      // verify the target .mjs file exists
  const fs = require('node:fs');
  const exists = fs.existsSync(expectedViaWrapperAbs);
  expect(exists).toBe(true);
    });

    test('prints help with -h/--help', () => {
      const { code, stdout, stderr } = runScript(script, ['--help'], { DRY_RUN: '1', WRAPPER_RUN_MODE: 'default' });
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toMatch(/WRAPPER_RUN_MODE/);
    });
  });

  describe('20-install-components.sh', () => {
  const script = path.join(wrapperDir, '20-install-components.sh');
  const expectedTarget = path.join(baseDir, 'install-components.mjs');
  const expectedViaWrapperAbs = path.normalize(path.join(wrapperDir, '..', 'common', 'install-components.mjs'));

    test('prints correct dry-run command (via --dry-run flag)', () => {
    const { code, stdout, stderr } = runScript(script, ['--dry-run']);
    expect([0, null]).toContain(code);
    expect(stderr).toBe('');
    expect(stdout).toContain('[patch][dry-run] Would run:');
    expect(stdout).toContain(expectedViaWrapperAbs);
  expect(stdout).toContain('--procedural-number 20');
  expect(stdout).toContain('--patch-name install-components');
    });

    test('target .mjs file exists', () => {
      // verify the target .mjs file exists
  const fs = require('node:fs');
  const exists = fs.existsSync(expectedViaWrapperAbs);
  expect(exists).toBe(true);
    });

    test('prints help with -h/--help', () => {
      const { code, stdout, stderr } = runScript(script, ['-h'], { DRY_RUN: '1', WRAPPER_RUN_MODE: 'default' });
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toMatch(/--wrapper-ext/);
    });
  });
});