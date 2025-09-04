const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'uc-')); }

function runNode(file, env = {}) {
  const res = spawnSync(process.execPath, [file], { env: { ...process.env, ...env }, encoding: 'utf8' });
  return res;
}

describe('use-cache-or-stagger.mjs', () => {
  const scriptPath = path.resolve(__dirname, '../../../../docker/patches/common/use-cache-or-stagger.mjs');

  test('uses latest cached zip and sets FOUNDRY_RELEASE_URL', () => {
    const cacheDir = tmpDir();
    fs.writeFileSync(path.join(cacheDir, 'foundryvtt-12.999.zip'), 'a');
    fs.writeFileSync(path.join(cacheDir, 'foundryvtt-13.307.zip'), 'b');

    const res = runNode(scriptPath, { CONTAINER_CACHE: cacheDir, PATCH_DRY_RUN: '0', PATCH_DEBUG: '1' });
    expect(res.status).toBe(0);
    // The script sets env var within the child process; we cannot read it back here.
    // Assert on stdout to contain cached release path.
    expect(res.stdout).toMatch(/Using cached release: .*foundryvtt-13.307.zip/);
  });

  test('applies stagger delay when no cache present', () => {
    const cacheDir = tmpDir();
    const start = Date.now();
    const res = runNode(scriptPath, { CONTAINER_CACHE: cacheDir, FETCH_STAGGER_SECONDS: '1', PATCH_DRY_RUN: '0', PATCH_DEBUG: '0' });
    const elapsed = Date.now() - start;
    expect(res.status).toBe(0);
    // Should be at least ~1s (allow some scheduling inaccuracy)
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});
