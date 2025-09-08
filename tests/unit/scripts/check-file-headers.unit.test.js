import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const runner = process.execPath; // node
const script = path.resolve('scripts/check-file-headers.mjs');

describe('check-file-headers script', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdrtest-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('passes for valid header', () => {
    const filePath = path.join(tmpDir, 'good.mjs');
    const content = `#!/usr/bin/env node\n/**\n * @file good.mjs\n * @description valid header\n * @path ${path.relative(process.cwd(), filePath)}\n */\nexport default 1;\n`;
    fs.writeFileSync(filePath, content, 'utf8');

    const res = spawnSync(runner, [script, filePath], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/\[headers\]\sAll files passed/);
  });

  test('fails when header missing', () => {
    const filePath = path.join(tmpDir, 'bad.mjs');
    fs.writeFileSync(filePath, 'console.log(1);\n', 'utf8');
    const res = spawnSync(runner, [script, filePath], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/Missing JSDoc header block/);
  });

  test('respects ignoreGlobs in config', () => {
    const filePath = path.join(tmpDir, 'ignored.mjs');
    fs.writeFileSync(filePath, 'console.log(1);\n', 'utf8');
    const cfg = { ignoreGlobs: [path.join(tmpDir, '*')] };
    const cfgPath = path.join(tmpDir, 'cfg.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg), 'utf8');
    const res = spawnSync(runner, [script, '--config', cfgPath, filePath], { encoding: 'utf8' });
    // Because file is ignored, script should exit 0 and report All files passed
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/All files passed/);
  });

  test('reports @file mismatch', () => {
    const filePath = path.join(tmpDir, 'realname.mjs');
    const content = `/**\n * @file wrongname.mjs\n * @description mismatch\n * @path ${path.relative(process.cwd(), filePath)}\n */\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    const res = spawnSync(runner, [script, filePath], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/@file tag mismatch/);
  });
});
