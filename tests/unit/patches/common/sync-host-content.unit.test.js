import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function runBuilder(cfg, options) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-sync-'));
  const harness = path.join(tmp, 'harness.mjs');
  // Resolve from the project root (current working directory) into docker/patches/common
  const targetAbs = path.resolve(process.cwd(), 'docker/patches/common/sync-host-content.mjs');
  const code = `import { buildConfigSyncTasksFrom } from '${pathToFileURL(targetAbs).toString()}';\n` +
    `const cfg = JSON.parse(process.env.CFG);\n` +
    `const opt = JSON.parse(process.env.OPT || '{}');\n` +
    `const tasks = buildConfigSyncTasksFrom(cfg, opt);\n` +
    `process.stdout.write(JSON.stringify(tasks));`;
  fs.writeFileSync(harness, code, 'utf8');
  const res = spawnSync(process.execPath, [harness], { env: { ...process.env, CFG: JSON.stringify(cfg), OPT: JSON.stringify(options || {}) } });
  if (res.status !== 0) {
    throw new Error(`child failed: ${res.status} ${res.stderr?.toString()}`);
  }
  return JSON.parse(res.stdout.toString() || '[]');
}

describe('sync-host-content.mjs - buildConfigSyncTasksFrom', () => {
  const dataDir = '/data/Data';

  test('returns [] when version install section missing', () => {
    const cfg = { versions: { '13': {} } };
    expect(runBuilder(cfg, { version: '13', dataDir })).toEqual([]);
  });

  test('creates tasks with sensible defaults for worlds/modules/systems', () => {
    const cfg = {
      versions: {
        '13': {
          install: {
            worlds: { testWorld: { continuous_sync: true } },
            modules: { modA: { continuous_sync: true } },
            systems: { sysA: { continuous_sync: true } },
          },
        },
      },
    };
    const tasks = runBuilder(cfg, { version: '13', dataDir });
    expect(tasks).toHaveLength(3);

    const tWorld = tasks.find(t => t.kind === 'worlds');
    const tModule = tasks.find(t => t.kind === 'modules');
    const tSystem = tasks.find(t => t.kind === 'systems');

    expect(tWorld).toMatchObject({
      kind: 'worlds', id: 'testWorld', direction: 'host-to-container',
      source: '/host/shared/worlds/testWorld', deletePolicy: 'keep', interval: 0,
      dest: path.join(dataDir, 'worlds', 'testWorld')
    });

    expect(tModule).toMatchObject({
      kind: 'modules', id: 'modA', direction: 'bidirectional',
      source: '/host/resources/modules/modA', deletePolicy: 'delete', interval: 0,
      dest: path.join(dataDir, 'modules', 'modA')
    });

    expect(tSystem).toMatchObject({
      kind: 'systems', id: 'sysA', direction: 'bidirectional',
      source: '/host/resources/systems/sysA', deletePolicy: 'delete', interval: 0,
      dest: path.join(dataDir, 'systems', 'sysA')
    });
  });

  test('honors overrides from top-level kind config and per-entry', () => {
    const cfg = {
      worlds: { w1: { continuous_sync: { direction: 'bidirectional', enabled: true } } },
      modules: { m1: { continuous_sync: { source: '/custom/modules/m1', interval: 5 } } },
      systems: { s1: { continuous_sync: false } },
      versions: {
        '13': {
          install: {
            worlds: { w1: {} },
            modules: { m1: { continuous_sync: { delete: false } } },
            systems: { s1: { continuous_sync: { enabled: true } } },
          },
        },
      },
    };
    const tasks = runBuilder(cfg, { version: '13', dataDir });

    const w1 = tasks.find(t => t.kind === 'worlds');
    expect(w1).toMatchObject({
      id: 'w1', direction: 'bidirectional', deletePolicy: 'keep', interval: 0,
      source: '/host/shared/worlds/w1',
    });

    const m1 = tasks.find(t => t.kind === 'modules');
    // Shallow merge means per-entry continuous_sync overrides top-level entirely
    // so custom source/interval are lost when per-entry defines cs
    expect(m1).toMatchObject({
      id: 'm1', source: '/host/resources/modules/m1', deletePolicy: 'keep', interval: 0,
    });

    const s1 = tasks.find(t => t.kind === 'systems');
    expect(s1).toBeTruthy();
  });

  test('skips entries where continuous_sync is false/disabled', () => {
    const cfg = {
      versions: {
        '13': {
          install: {
            worlds: { A: { continuous_sync: false } },
            modules: { B: { continuous_sync: { enabled: false } } },
            systems: { C: {} },
          },
        },
      },
    };
    const tasks = runBuilder(cfg, { version: '13', dataDir });
    expect(tasks).toHaveLength(0);
  });
});
