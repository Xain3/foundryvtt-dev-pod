import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');
const commonDir = path.join(repoRoot, 'patches', 'common');
const entrypointDir = path.join(repoRoot, 'patches', 'entrypoint');

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

function makeTempWrapper(filename, contents) {
  const filePath = path.join(entrypointDir, filename);
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
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
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
      fs.unlinkSync(file);
    }
  });

  it('supports --wrapper-target to run custom script (relative, no ext)', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n --wrapper-target helpers/extractors',
      ''
    ].join('\n');
    const file = makeTempWrapper('97-custom-target.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      // Should reference helpers/extractors.mjs in dry-run output
      expect(res.stdout).toMatch(/helpers\/extractors\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('supports multiple --wrapper-target values (comma and repeat)', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n --wrapper-target helpers/extractors,helpers/cache --wrapper-target helpers/common.mjs',
      ''
    ].join('\n');
    const file = makeTempWrapper('96-multi-targets.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      const out = res.stdout;
      expect(out).toMatch(/helpers\/extractors\.mjs/);
      expect(out).toMatch(/helpers\/cache\.mjs/);
      expect(out).toMatch(/helpers\/common\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('supports --wrapper-ext to change extension', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n --wrapper-target helpers/extractors --wrapper-ext .mjs',
      ''
    ].join('\n');
    const file = makeTempWrapper('95-wrapper-ext-flag.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      expect(res.stdout).toMatch(/helpers\/extractors\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('uses WRAPPER_SCRIPT_EXT env for default target extension', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n',
      ''
    ].join('\n');
    const file = makeTempWrapper('94-env-ext-default.sh', contents);

    const res = runBash(file, [], { WRAPPER_SCRIPT_EXT: 'mjs' });
    try {
      expect(res.status).toBe(0);
      // For this wrapper, target should be env-ext-default.mjs
      expect(res.stdout).toMatch(/env-ext-default\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('wrapper-bin sync-loop mode prints both commands on dry-run', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="sync-loop"',
      'wrapper_main -n --y=2',
      ''
    ].join('\n');
    const file = makeTempWrapper('98-test-sync-loop.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      expect(res.stdout).toMatch(/\[patch\].*Delegating/);
      expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would run initial sync: .*common\/test-sync-loop\.mjs/);
      expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would start loop in background: .*common\/test-sync-loop\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Edge cases
  it('handles wrapper without numeric prefix', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n',
      ''
    ].join('\n');
    const file = makeTempWrapper('z-no-prefix.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      // Should derive script name `no-prefix.mjs`
      expect(res.stdout).toMatch(/no-prefix\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('handles odd filenames with dots', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n',
      ''
    ].join('\n');
    const file = makeTempWrapper('30-my.patch.with.dots.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      // Script should be `my.patch.with.dots.mjs`
      expect(res.stdout).toMatch(/my\.patch\.with\.dots\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('passes through arguments with spaces correctly', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n --msg "hello world" --path "/tmp/some dir"',
      ''
    ].join('\n');
    const file = makeTempWrapper('40-arg-space.sh', contents);

    const res = runBash(file, [], {});
    try {
      expect(res.status).toBe(0);
      expect(res.stdout).toMatch(/--msg hello world/);
      expect(res.stdout).toMatch(/--path \/tmp\/some dir/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('treats DRY_RUN=0 as not dry-run but PATCH_DRY_RUN=1 as dry-run', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main --dry-run',
      ''
    ].join('\n');
    const file = makeTempWrapper('50-dryrun-env.sh', contents);

    // DRY_RUN=0 but PATCH_DRY_RUN=1 should enable dry-run
    const res = runBash(file, [], { DRY_RUN: '0', PATCH_DRY_RUN: '1' });
    try {
      expect(res.status).toBe(0);
      expect(res.stdout).toMatch(/\[patch\]\[dry-run\] Would run:/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Negative / error cases
  it('errors when node is missing and not in dry-run', () => {
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'export WRAPPER_NODE_BIN="node-that-does-not-exist-xyz"',
      'wrapper_main',
      ''
    ].join('\n');
    const file = makeTempWrapper('60-missing-node.sh', contents);

    const res = runBash(file, [], {});
    try {
      // Should exit non-zero and print node not found to stderr
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/node not found in PATH/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('derives odd/malformed filename pieces (empty patch name)', () => {
    // Directly call derive_patch_metadata to inspect behavior for '07-.sh'
    const script = `set -euo pipefail; source ${JSON.stringify(path.join(commonDir, 'wrapper-lib.sh'))}; derive_patch_metadata 07-.sh`;
    const res = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const parts = res.stdout.trim().split('|');
    // procedural number should be '07', patch name empty, script becomes '.mjs'
    expect(parts[0]).toBe('07');
    expect(parts[1]).toBe('');
    expect(parts[2]).toBe('.mjs');

    // Also test running a wrapper file with that name; node (present) should attempt to run and fail
    const wrapperBinAbs = path.join(commonDir, 'wrapper-bin.sh');
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `source "${wrapperBinAbs.replace(/"/g, '\\"')}"`,
      'export WRAPPER_RUN_MODE="default"',
      'wrapper_main -n',
      ''
    ].join('\n');
    const file = makeTempWrapper('07-.sh', contents);
    try {
      const res2 = runBash(file, [], {});
      // Dry-run invoked; should not error but should show .mjs as target
      expect(res2.status).toBe(0);
      expect(res2.stdout).toMatch(/\.mjs/);
    } finally {
      fs.unlinkSync(file);
    }
  });
});
