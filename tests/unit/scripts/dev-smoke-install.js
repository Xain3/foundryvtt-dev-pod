/**
 * Dev smoke installer
 *
 * Convert the original CLI script into an importable function for Jest.
 * Still runnable via a tiny harness if needed, but primarily used as a smoke test.
 */
import process from 'process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function buildConfig(args, fallbacks) {
  const topLevel = { name: args.id };
  if (args.manifest) topLevel.manifest = String(args.manifest);
  if (args.path) topLevel.path = String(args.path);
  if (args.url) topLevel.path = String(args.url);
  return {
    systems: args.type === 'system' ? { [args.id]: topLevel } : {},
    modules: args.type === 'module' ? { [args.id]: topLevel } : {},
    worlds:  args.type === 'world'  ? { [args.id]: topLevel } : {},
    versions: {
      [fallbacks.VERSION]: {
        supported: true,
        install: {
          systems: args.type === 'system' ? { [args.id]: {} } : undefined,
          modules: args.type === 'module' ? { [args.id]: {} } : undefined,
          worlds:  args.type === 'world'  ? { [args.id]: {} } : undefined
        }
      }
    }
  };
}

export async function smokeInstall(inputArgs = {}, inputEnv = {}) {
  const args = Object.keys(inputArgs).length ? inputArgs : parseArgs(process.argv);
  if (!args.type || !args.id || (!args.manifest && !args.path && !args.url)) {
    throw new Error('Missing required arguments: --type <system|module|world> --id <id> and one of --manifest/--path/--url');
  }

  const ENV = { ...process.env, ...inputEnv };
  ENV.FOUNDRY_DATA_DIR = ENV.FOUNDRY_DATA_DIR || path.join(os.tmpdir(), 'omh-smoke-Data');
  ENV.CONTAINER_CONFIG_PATH = ENV.CONTAINER_CONFIG_PATH || path.join(os.tmpdir(), `omh-smoke-config-${Date.now()}.json`);
  ENV.COMPONENT_CACHE = ENV.COMPONENT_CACHE || path.join(os.tmpdir(), 'omh-smoke-cache');

  const FALLBACKS = {
    VERSION: ENV.FOUNDRY_FALLBACK_MAJOR_VERSION || '13',
    DATA_DIR: ENV.FOUNDRY_DATA_DIR,
    CONTAINER_CONFIG_PATH: ENV.CONTAINER_CONFIG_PATH
  };

  const DIRS = { SYSTEMS: 'systems', MODULES: 'modules', WORLDS: 'worlds' };
  const config = buildConfig(args, FALLBACKS);

  fs.mkdirSync(path.dirname(ENV.CONTAINER_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(ENV.CONTAINER_CONFIG_PATH, JSON.stringify(config, null, 2));

  // eslint-disable-next-line no-console
  console.log(`[smoke] Using Data dir: ${ENV.FOUNDRY_DATA_DIR}`);
  // eslint-disable-next-line no-console
  console.log(`[smoke] Using cache dir: ${ENV.COMPONENT_CACHE}`);
  // eslint-disable-next-line no-console
  console.log(`[smoke] Temp config: ${ENV.CONTAINER_CONFIG_PATH}`);

  // Run installer in a child Node process to handle ESM cleanly under Jest
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-smoke-'));
  const harness = path.join(tmpRoot, 'smoke-harness.mjs');
  const helperAbs = path.resolve(process.cwd(), 'docker/patches/common/helpers/componentInstaller.mjs');
  const helperUrl = pathToFileURL(helperAbs).toString();
  const code = `import { ComponentInstaller } from '${helperUrl}';\n` +
    `const ENV = process.env;\n` +
    `const FALLBACKS = JSON.parse(ENV._FALLBACKS_JSON);\n` +
    `const DIRS = { SYSTEMS: 'systems', MODULES: 'modules', WORLDS: 'worlds' };\n` +
    `const installer = new ComponentInstaller(ENV, FALLBACKS, DIRS);\n` +
    `await installer.install();\n`;
  fs.writeFileSync(harness, code, 'utf8');

  const childEnv = { ...ENV, _FALLBACKS_JSON: JSON.stringify(FALLBACKS) };
  const { status, stderr } = await new Promise((resolve) => {
    const { spawn } = require('node:child_process');
    const p = spawn(process.execPath, [harness], { env: childEnv });
    let er = Buffer.alloc(0);
    p.stderr.on('data', (d) => { er = Buffer.concat([er, d]); });
    p.on('close', (code) => resolve({ status: code ?? 0, stderr: er }));
  });
  if (status !== 0) {
    const msg = stderr?.toString() || 'installer failed';
    throw new Error(`smoke installer failed: ${msg}`);
  }
  // eslint-disable-next-line no-console
  console.log('[smoke] Done.');

  return {
    dataDir: ENV.FOUNDRY_DATA_DIR,
    cacheDir: ENV.COMPONENT_CACHE,
    configPath: ENV.CONTAINER_CONFIG_PATH,
    version: FALLBACKS.VERSION,
    args
  };
}

// Jest harness: when run via Jest directly (e.g., npx jest path/to/dev-smoke-install.js),
// execute a dry-run local-path world install as a smoke test.
if (process.env.JEST_WORKER_ID) {
  // eslint-disable-next-line no-undef
  describe('dev-smoke-install (Jest smoke)', () => {
    // eslint-disable-next-line no-undef
    test('runs smoke install (dry-run, local path)', async () => {
      const tmpWorld = path.join(os.tmpdir(), `omh-smoke-world-${Date.now()}`);
      fs.mkdirSync(tmpWorld, { recursive: true });
      const env = {
        PATCH_DRY_RUN: '1',
        PATCH_DEBUG: '1'
      };
      const res = await smokeInstall({ type: 'world', id: 'example_world', path: tmpWorld }, env);
      expect(res).toBeTruthy();
      expect(res.dataDir).toBeTruthy();
      expect(fs.existsSync(path.dirname(res.configPath))).toBe(true);
    });
  });
}
