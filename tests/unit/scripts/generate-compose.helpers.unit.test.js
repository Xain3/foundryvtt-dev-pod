import { deriveVersionDefaults, buildServiceEntry } from '../../../scripts/generate-compose.js';

describe('deriveVersionDefaults', () => {
  test('derives sensible defaults from version params', () => {
    const vp = { name: 'foundry-v{version}', versionDir: 'v{version}', tag: '{version}', port: '{version}' };
    const res = deriveVersionDefaults(vp, 13, {});
    expect(res.name).toBe('foundry-v13');
    expect(res.dir).toBe('v13');
  expect(res.tag).toBe('13');
  expect(res.port).toBe(13); // templated port resolves to numeric 13
  });

  test('applies per-version composition overrides', () => {
    const vp = { name: 'foundry-v{version}', versionDir: 'v{version}', tag: '{version}', port: '{version}' };
    const cp = { name: 'custom', versionDir: 'customdir', tag: 'release', port: 31000, envSuffix: 'custom', fetchStaggerSeconds: 7 };
    const res = deriveVersionDefaults(vp, 12, cp);
    expect(res.name).toBe('custom');
    expect(res.dir).toBe('customdir');
    expect(res.tag).toBe('release');
    expect(res.port).toBe(31000);
    expect(res.envSuffix).toBe('custom');
    expect(res.fetchStagger).toBe(7);
  });
});

describe('buildServiceEntry', () => {
  test('builds service with env array and extra volumes', () => {
    const derived = { name: 'foundry-v13', dir: 'v13', tag: '13', port: 30013, envSuffix: 'v13', fetchStagger: 4 };
    const cp = { environment: ['FOO=1','BAR=2'], env_files: ['extra.env'], volumes_extra: ['./host:/container'] };
    const svc = buildServiceEntry(derived, cp, 'repo/image', '0:0', []);
    expect(svc).toHaveProperty('image', 'repo/image:13');
    expect(svc).toHaveProperty('container_name', 'foundry-v13');
    expect(svc.environment).toEqual(expect.arrayContaining([expect.stringContaining('FETCH_STAGGER_SECONDS=4'), 'FOO=1', 'BAR=2']));
    expect(svc.env_file).toEqual(expect.arrayContaining(['./env/.env','./env/.v13.env','extra.env']));
    expect(svc.volumes).toEqual(expect.arrayContaining([expect.stringContaining('foundry-v13-data:/data'), './host:/container']));
  });

  test('builds service with environment object', () => {
    const derived = { name: 'foundry-v12', dir: 'v12', tag: '12', port: 30012, envSuffix: 'v12', fetchStagger: 2 };
    const cp = { environment: { ONE: '1', TWO: '2' } };
    const svc = buildServiceEntry(derived, cp, 'repo/image', '0:0', []);
    expect(svc.environment).toEqual(expect.arrayContaining(['ONE=1','TWO=2']));
  });
});
