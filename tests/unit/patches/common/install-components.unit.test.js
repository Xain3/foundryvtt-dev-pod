/**
 * Tests for docker/patches/common/install-components.mjs
 * Strategy: mock ComponentInstaller module by writing a temporary stub file to the same path via jest.mock using babel-jest CJS interop.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

function runScriptWithStub({ cfg, dataDir }) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-patch-'));
  const tmpCommonDir = path.join(tmpRoot, 'docker/patches/common');
  const tmpHelpersDir = path.join(tmpCommonDir, 'helpers');
  fs.mkdirSync(tmpHelpersDir, { recursive: true });

  // Write stub ComponentInstaller that exposes our provided cfg
  const stub = `export class ComponentInstaller {\n` +
    `  constructor(env){ this._env = env; this._cfg = ${JSON.stringify(cfg || null)}; }\n` +
    `  async install(){}\n` +
    `  async getConfig(){ return this._cfg; }\n` +
    `  getVersion(){ return this._env.FOUNDRY_VERSION || this._env.FOUNDRY_FALLBACK_MAJOR_VERSION || '13'; }\n` +
    `  getDataDir(){ return this._env.FOUNDRY_DATA_DIR || '/data/Data'; }\n` +
    `}`;
  fs.writeFileSync(path.join(tmpHelpersDir, 'componentInstaller.mjs'), stub);

  // Also stub argvParser.mjs to provide parsePatchArgs used by script
  const argvParserStub = `export function parsePatchArgs(fallbackProc, fallbackName){ return { procNum: fallbackProc, patchName: fallbackName }; }`;
  fs.writeFileSync(path.join(tmpHelpersDir, 'argvParser.mjs'), argvParserStub);

  // Copy the real script into the temp sandbox
  const realScriptPath = path.resolve(process.cwd(), 'docker/patches/common/install-components.mjs');
  const scriptContent = fs.readFileSync(realScriptPath, 'utf8');
  const sandboxScriptPath = path.join(tmpCommonDir, 'install-components.mjs');
  fs.writeFileSync(sandboxScriptPath, scriptContent);

  // Write a simple harness that just imports the script (top-level await will run)
  const harnessPath = path.join(tmpRoot, 'harness.mjs');
  const importUrl = pathToFileURL(sandboxScriptPath).toString();
  fs.writeFileSync(harnessPath, `import '${importUrl}';\n`);

  const env = { ...process.env };
  env.FOUNDRY_DATA_DIR = dataDir || path.join(tmpRoot, 'Data');
  fs.mkdirSync(env.FOUNDRY_DATA_DIR, { recursive: true });

  const res = spawnSync(process.execPath, [harnessPath], { env, encoding: 'utf8' });
  return { tmpRoot, stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

// Capture console output
let consoleWarnSpy;
let consoleLogSpy;

beforeEach(() => {
  jest.resetModules();
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy?.mockRestore();
  consoleLogSpy?.mockRestore();
});

describe('install-components.mjs', () => {
  test('runs installer.install and performs presence check when configured', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-test-'));
    const dataDir = path.join(sandbox, 'Data');
    fs.mkdirSync(path.join(dataDir, 'worlds/existsWorld'), { recursive: true });

    const cfg = {
      versions: {
        '13': {
          install: {
            worlds: {
              existsWorld: { check_presence: true },
              missingWorld: { check_presence: true }
            }
          }
        }
      }
    };
    const { stderr, status } = runScriptWithStub({ cfg, dataDir });
    expect(status).toBe(0);
    const warnings = stderr.toString();
    expect(warnings).toContain("world presence warning: 'missingWorld' not found");
    expect(warnings).not.toContain("existsWorld");
  });

  test('skips presence check when configuration missing', async () => {
    const { stderr, status } = runScriptWithStub({ cfg: null, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'omh-empty-')) });
    expect(status).toBe(0);
    expect(stderr.toString()).not.toMatch(/world presence warning/);
  });
});
