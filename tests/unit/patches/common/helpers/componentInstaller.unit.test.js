import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { jest } from '@jest/globals';
import { ComponentInstaller } from '../../../../../patches/common/helpers/componentInstaller.mjs';

function padToBlockSize(len, block = 512) { return (block - (len % block)) % block; }
function buildTar(entries) {
  const BLOCK = 512;
  const chunks = [];
  function headerFor({ name, size = 0, type = '0', prefix = '' }) {
    const buf = Buffer.alloc(BLOCK, 0);
    Buffer.from(name).copy(buf, 0, 0, Math.min(name.length, 100));
    const sizeOct = size.toString(8).padStart(11, '0');
    Buffer.from(sizeOct).copy(buf, 124);
    buf[124 + 11] = 0;
    buf[156] = type.charCodeAt(0);
    Buffer.from('ustar\0').copy(buf, 257);
    Buffer.from('00').copy(buf, 263);
    for (let i = 0; i < 8; i++) buf[148 + i] = 32;
    let sum = 0; for (let i = 0; i < BLOCK; i++) sum += buf[i];
    const chk = sum.toString(8).padStart(6, '0');
    Buffer.from(chk).copy(buf, 148);
    buf[148 + 6] = 0; buf[148 + 7] = 32;
    return buf;
  }
  for (const e of entries) {
    const isDir = e.type === '5';
    const data = isDir ? Buffer.alloc(0) : Buffer.from(e.data || '', 'utf8');
    const header = headerFor({ name: e.name, size: data.length, type: e.type || '0', prefix: e.prefix || '' });
    chunks.push(header);
    if (!isDir) { chunks.push(data); const pad = padToBlockSize(data.length); if (pad) chunks.push(Buffer.alloc(pad, 0)); }
  }
  chunks.push(Buffer.alloc(512, 0)); chunks.push(Buffer.alloc(512, 0));
  return Buffer.concat(chunks);
}

describe('patches/common/helpers/componentInstaller.mjs', () => {
  const tmpRoot = path.join(process.cwd(), '.jest-tmp-installer');
  const dataDir = path.join(tmpRoot, 'Data');
  const cacheDir = path.join(tmpRoot, 'cache');
  const configPath = path.join(tmpRoot, 'container-config.json');
  const dirs = { SYSTEMS: 'systems', MODULES: 'modules', WORLDS: 'worlds' };
  const fallbacks = { VERSION: '13', DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: configPath };

  let server; let port; let manifestUrl; let pkgUrl; let sysSrcDir; let modTgz; let worldTgz;

  beforeAll((done) => {
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    // Prepare system source directory
    sysSrcDir = path.join(tmpRoot, 'sys-src');
    fs.mkdirSync(sysSrcDir, { recursive: true });
    fs.writeFileSync(path.join(sysSrcDir, 'sys.txt'), 'system-file');

    // Prepare module/world archives
    const tarMod = buildTar([{ name: 'm.txt', data: 'module', type: '0' }]);
    modTgz = path.join(tmpRoot, 'mod.tgz');
    fs.writeFileSync(modTgz, zlib.gzipSync(tarMod));

    const tarWorld = buildTar([{ name: 'w.txt', data: 'world', type: '0' }]);
    worldTgz = zlib.gzipSync(tarWorld);

    // HTTP server for manifest + package
    server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (url === '/manifest.json') {
        res.setHeader('Content-Type', 'application/json');
        // send absolute URL for download to avoid base resolution issues
        res.end(JSON.stringify({ download: `${'http://127.0.0.1:' + port}/pkg.tgz` }));
      } else if (url === '/pkg.tgz') {
        res.statusCode = 200; res.end(worldTgz);
      } else if (url === '/manifest-relative') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ download: `pkg.tgz` }));
      } else if (url === '/manifest-plain') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ download: `${'http://127.0.0.1:' + port}/plain.txt` }));
      } else if (url === '/plain.txt') {
        res.statusCode = 200; res.end('i am plain');
      } else if (url === '/manifest-error') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ download: `${'http://127.0.0.1:' + port}/error500` }));
      } else if (url === '/error500') {
        res.statusCode = 500; res.end('server error');
      } else { res.statusCode = 404; res.end('not found'); }
    });
    server.listen(0, () => {
      // @ts-ignore
      port = server.address().port;
      manifestUrl = `http://127.0.0.1:${port}/manifest.json`;
      pkgUrl = `http://127.0.0.1:${port}/pkg.tgz`;

      // Write container-config.json using URLs now that we have port
      const cfg = {
        versions: {
          '13': {
            supported: true,
            install: {
              systems: { sys1: {} },
              modules: { mod1: {} },
              worlds: { w1: {} }
            }
          }
        },
        systems: { sys1: { path: sysSrcDir } },
        modules: { mod1: { path: modTgz } },
        worlds: { w1: { manifest: manifestUrl } }
      };
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      done();
    });
  });

  afterAll(() => {
    if (server) server.close();
    if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('install() installs from directory, archive, and manifest', async () => {
    const env = {
      FOUNDRY_VERSION: '13.307',
      FOUNDRY_DATA_DIR: dataDir,
      CONTAINER_CONFIG_PATH: configPath,
      COMPONENT_CACHE: cacheDir,
      PATCH_FORCE_NODE_EXTRACT: '1',
      PATCH_DRY_RUN: '0',
      PATCH_DEBUG: '0'
    };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();

    const systemsDest = path.join(dataDir, dirs.SYSTEMS, 'sys1');
    const modulesDest = path.join(dataDir, dirs.MODULES, 'mod1');
    const worldsDest  = path.join(dataDir, dirs.WORLDS,  'w1');

    // ensured directories
    expect(fs.existsSync(path.join(dataDir, dirs.SYSTEMS))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, dirs.MODULES))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, dirs.WORLDS))).toBe(true);

    // system from directory copied
    expect(fs.readFileSync(path.join(systemsDest, 'sys.txt'), 'utf8')).toBe('system-file');

    // module archive extracted via node fallback
    expect(fs.readFileSync(path.join(modulesDest, 'm.txt'), 'utf8')).toBe('module');

    // world from manifest -> download package -> extract
    expect(fs.readFileSync(path.join(worldsDest, 'w.txt'), 'utf8')).toBe('world');
  }, 15000);

  test('exits with code 2 when config cannot be read', () => {
    const badEnv = {
      FOUNDRY_VERSION: '13.307',
      FOUNDRY_DATA_DIR: dataDir,
      CONTAINER_CONFIG_PATH: path.join(tmpRoot, 'does-not-exist.json'),
      COMPONENT_CACHE: cacheDir,
      PATCH_FORCE_NODE_EXTRACT: '1'
    };
    const spy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`); });
    try {
      // Constructor will attempt to read config and exit
      // @ts-ignore
      new ComponentInstaller(badEnv, fallbacks, dirs);
      fail('Expected constructor to exit');
    } catch (e) {
      expect(String(e)).toContain('exit:2');
    } finally {
      spy.mockRestore();
    }
  });

  test('exits with code 3 when versions missing', () => {
    const cfg = { foo: 'bar' };
    const cfgPath = path.join(tmpRoot, 'bad-versions.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir };
    const spy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`); });
    try {
      // @ts-ignore
      new ComponentInstaller(env, fallbacks, dirs);
      fail('Expected constructor to exit');
    } catch (e) {
      expect(String(e)).toContain('exit:3');
    } finally {
      spy.mockRestore();
    }
  });

  test('exits with code 3 when major version missing in versions map', () => {
    const cfg = { versions: { '12': { supported: true, install: {} } } };
    const cfgPath = path.join(tmpRoot, 'missing-major.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.100', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir };
    const spy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`); });
    try {
      // @ts-ignore
      new ComponentInstaller(env, fallbacks, dirs);
      fail('Expected constructor to exit');
    } catch (e) {
      expect(String(e)).toContain('exit:3');
    } finally {
      spy.mockRestore();
    }
  });

  test('exits with code 4 when version explicitly unsupported', () => {
    const cfg = { versions: { '13': { supported: false } } };
    const cfgPath = path.join(tmpRoot, 'unsupported.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir };
    const spy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`); });
    try {
      // @ts-ignore
      new ComponentInstaller(env, fallbacks, dirs);
      fail('Expected constructor to exit');
    } catch (e) {
      expect(String(e)).toContain('exit:4');
    } finally {
      spy.mockRestore();
    }
  });

  test('relative manifest download URL results in skipped install', async () => {
    // write config that points world to manifest-relative
    const cfgPath = path.join(tmpRoot, 'cfg-relative.json');
    const cfg = {
      versions: { '13': { supported: true, install: { worlds: { r1: {} } } } },
      worlds: { r1: { manifest: `http://127.0.0.1:${port}/manifest-relative` } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_FORCE_NODE_EXTRACT: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    // Relative URL is treated as invalid/unsupported; skip install
    const worldsDest = path.join(dataDir, dirs.WORLDS, 'r1');
    expect(fs.existsSync(worldsDest)).toBe(false);
  }, 10000);

  test('non-archive package (plain text) logs and leaves file', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-plain.json');
    const cfg = {
      versions: { '13': { supported: true, install: { worlds: { p1: {} } } } },
      worlds: { p1: { manifest: `http://127.0.0.1:${port}/manifest-plain` } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_FORCE_NODE_EXTRACT: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    // Since it's not an archive, installer should leave the downloaded file in cache
    const cacheFiles = fs.readdirSync(cacheDir);
    expect(cacheFiles.length).toBeGreaterThan(0);
  });

  test('manifest download error (500) results in skipped install', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-err.json');
    const cfg = {
      versions: { '13': { supported: true, install: { worlds: { e1: {} } } } },
      worlds: { e1: { manifest: `http://127.0.0.1:${port}/manifest-error` } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_FORCE_NODE_EXTRACT: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    // Should not throw, but the world shouldn't be installed
    const worldsDest = path.join(dataDir, dirs.WORLDS, 'e1');
    expect(fs.existsSync(worldsDest)).toBe(false);
  });

  test('extraction failure when native tar missing (forceNodeExtract=false) falls back to node extract error', async () => {
    // Simulate missing unzip/tar by forcing native detection to null by not setting PATCH_FORCE_NODE_EXTRACT
    const cfgPath = path.join(tmpRoot, 'cfg-mod.json');
    const cfg = {
      versions: { '13': { supported: true, install: { modules: { badmod: {} } } } },
      modules: { badmod: { path: path.join(tmpRoot, 'nonexistent.tgz') } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    const modDest = path.join(dataDir, dirs.MODULES, 'badmod');
    expect(fs.existsSync(modDest)).toBe(false);
  });

  test('dry-run mode does not create destination directories for installs', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-dry.json');
    const cfg = {
      versions: { '13': { supported: true, install: { systems: { drysys: {} } } } },
      systems: { drysys: { path: sysSrcDir } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_DRY_RUN: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    const sysDest = path.join(dataDir, dirs.SYSTEMS, 'drysys');
    // In dry-run we still ensure directories exist, but install copies should be skipped
    expect(fs.existsSync(path.join(dataDir, dirs.SYSTEMS))).toBe(true);
    expect(fs.existsSync(sysDest)).toBe(false);
  });

  test('purges unlisted systems, modules, and worlds after installation', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-purge.json');
    
    // Setup: Create some existing components that should be purged
    const systemsDir = path.join(dataDir, dirs.SYSTEMS);
    const modulesDir = path.join(dataDir, dirs.MODULES);
    const worldsDir = path.join(dataDir, dirs.WORLDS);
    
    fs.mkdirSync(systemsDir, { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(worldsDir, { recursive: true });
    
    // Create unlisted components that should be purged
    fs.mkdirSync(path.join(systemsDir, 'old-system'), { recursive: true });
    fs.mkdirSync(path.join(modulesDir, 'old-module'), { recursive: true });
    fs.mkdirSync(path.join(worldsDir, 'old-world'), { recursive: true });
    
    // Write test files to verify they get removed
    fs.writeFileSync(path.join(systemsDir, 'old-system', 'test.txt'), 'old system');
    fs.writeFileSync(path.join(modulesDir, 'old-module', 'test.txt'), 'old module');
    fs.writeFileSync(path.join(worldsDir, 'old-world', 'test.txt'), 'old world');
    
    const cfg = {
      versions: { 
        '13': { 
          supported: true, 
          install: { 
            systems: { sys1: {} },
            modules: { mod1: {} },
            worlds: { w1: {} }
          }
        }
      },
      systems: { sys1: { path: sysSrcDir } },
      modules: { mod1: { path: modTgz } },
      worlds: { w1: { manifest: manifestUrl } }
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_FORCE_NODE_EXTRACT: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    
    // Verify old components exist before installation
    expect(fs.existsSync(path.join(systemsDir, 'old-system'))).toBe(true);
    expect(fs.existsSync(path.join(modulesDir, 'old-module'))).toBe(true);
    expect(fs.existsSync(path.join(worldsDir, 'old-world'))).toBe(true);
    
    await installer.install();
    
    // Verify new components are installed
    expect(fs.existsSync(path.join(systemsDir, 'sys1'))).toBe(true);
    expect(fs.existsSync(path.join(modulesDir, 'mod1'))).toBe(true);
    expect(fs.existsSync(path.join(worldsDir, 'w1'))).toBe(true);
    
    // Verify old components are purged
    expect(fs.existsSync(path.join(systemsDir, 'old-system'))).toBe(false);
    expect(fs.existsSync(path.join(modulesDir, 'old-module'))).toBe(false);
    expect(fs.existsSync(path.join(worldsDir, 'old-world'))).toBe(false);
  });

  test('preserves test-world even when not in config', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-test-world.json');
    
    // Setup: Create test-world and another world that should be purged
    const worldsDir = path.join(dataDir, dirs.WORLDS);
    fs.mkdirSync(worldsDir, { recursive: true });
    
    // Create test-world (should be preserved)
    fs.mkdirSync(path.join(worldsDir, 'test-world'), { recursive: true });
    fs.writeFileSync(path.join(worldsDir, 'test-world', 'world.json'), '{"name": "Test World"}');
    
    // Create another world that should be purged
    fs.mkdirSync(path.join(worldsDir, 'unwanted-world'), { recursive: true });
    fs.writeFileSync(path.join(worldsDir, 'unwanted-world', 'world.json'), '{"name": "Unwanted World"}');
    
    const cfg = {
      versions: { 
        '13': { 
          supported: true, 
          install: { 
            worlds: { w1: {} }  // Note: test-world is not listed here
          }
        }
      },
      worlds: { w1: { manifest: manifestUrl } }
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_FORCE_NODE_EXTRACT: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    
    // Verify both worlds exist before installation
    expect(fs.existsSync(path.join(worldsDir, 'test-world'))).toBe(true);
    expect(fs.existsSync(path.join(worldsDir, 'unwanted-world'))).toBe(true);
    
    await installer.install();
    
    // Verify configured world is installed
    expect(fs.existsSync(path.join(worldsDir, 'w1'))).toBe(true);
    
    // Verify test-world is preserved (exception)
    expect(fs.existsSync(path.join(worldsDir, 'test-world'))).toBe(true);
    expect(fs.existsSync(path.join(worldsDir, 'test-world', 'world.json'))).toBe(true);
    
    // Verify unwanted world is purged
    expect(fs.existsSync(path.join(worldsDir, 'unwanted-world'))).toBe(false);
  });

  test('dry-run mode for purge shows what would be purged without actually removing', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-dry-purge.json');
    
    // Setup: Create components that should be purged
    const systemsDir = path.join(dataDir, dirs.SYSTEMS);
    fs.mkdirSync(systemsDir, { recursive: true });
    fs.mkdirSync(path.join(systemsDir, 'should-be-purged'), { recursive: true });
    fs.writeFileSync(path.join(systemsDir, 'should-be-purged', 'test.txt'), 'test');
    
    const cfg = {
      versions: { 
        '13': { 
          supported: true, 
          install: { 
            systems: { sys1: {} }  // only sys1 is allowed
          }
        }
      },
      systems: { sys1: { path: sysSrcDir } }
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_DRY_RUN: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    
    // Verify component exists before installation
    expect(fs.existsSync(path.join(systemsDir, 'should-be-purged'))).toBe(true);
    
    await installer.install();
    
    // In dry-run mode, the component should still exist
    expect(fs.existsSync(path.join(systemsDir, 'should-be-purged'))).toBe(true);
    expect(fs.existsSync(path.join(systemsDir, 'should-be-purged', 'test.txt'))).toBe(true);
  });

  test('handles missing component directories gracefully during purge', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-missing-dirs.json');
    
    const cfg = {
      versions: { 
        '13': { 
          supported: true, 
          install: { 
            systems: { sys1: {} },
            modules: { mod1: {} },
            worlds: { w1: {} }
          }
        }
      },
      systems: { sys1: { path: sysSrcDir } },
      modules: { mod1: { path: modTgz } },
      worlds: { w1: { manifest: manifestUrl } }
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    
    // Remove data directory to test missing directory handling
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    
    const env = { FOUNDRY_VERSION: '13.0.0', FOUNDRY_DATA_DIR: dataDir, CONTAINER_CONFIG_PATH: cfgPath, COMPONENT_CACHE: cacheDir, PATCH_FORCE_NODE_EXTRACT: '1' };
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    
    // Should not throw an error even with missing directories
    await expect(installer.install()).resolves.not.toThrow();
  });

  test('PATCH_DISABLE_PURGE environment variable disables purging entirely', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-disable-purge.json');
    
    // Setup: Create existing components that would normally be purged
    const systemsDir = path.join(dataDir, 'systems');
    const modulesDir = path.join(dataDir, 'modules');
    const worldsDir = path.join(dataDir, 'worlds');
    
    fs.mkdirSync(systemsDir, { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(worldsDir, { recursive: true });
    
    // Create components that should normally be purged
    fs.mkdirSync(path.join(systemsDir, 'unlisted-system'), { recursive: true });
    fs.writeFileSync(path.join(systemsDir, 'unlisted-system', 'test.txt'), 'test');
    
    fs.mkdirSync(path.join(modulesDir, 'unlisted-module'), { recursive: true });
    fs.writeFileSync(path.join(modulesDir, 'unlisted-module', 'test.txt'), 'test');
    
    fs.mkdirSync(path.join(worldsDir, 'unlisted-world'), { recursive: true });
    fs.writeFileSync(path.join(worldsDir, 'unlisted-world', 'world.json'), '{"name": "Unlisted World"}');
    
    // Create listed component
    fs.mkdirSync(path.join(systemsDir, 'sys1'), { recursive: true });
    
    const cfg = {
      versions: { 
        '13': { 
          supported: true, 
          install: { 
            systems: { sys1: {} }  // Only sys1 is listed
          }
        }
      },
      systems: { sys1: { path: sysSrcDir } }
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    
    // Enable PATCH_DISABLE_PURGE
    const env = {
      FOUNDRY_VERSION: '13.0.0',
      FOUNDRY_DATA_DIR: dataDir,
      CONTAINER_CONFIG_PATH: cfgPath,
      COMPONENT_CACHE: cacheDir,
      PATCH_FORCE_NODE_EXTRACT: '1',
      PATCH_DISABLE_PURGE: '1'
    };
    
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    
    // Verify unlisted components are NOT purged when purging is disabled
    expect(fs.existsSync(path.join(systemsDir, 'unlisted-system'))).toBe(true);
    expect(fs.existsSync(path.join(modulesDir, 'unlisted-module'))).toBe(true);
    expect(fs.existsSync(path.join(worldsDir, 'unlisted-world'))).toBe(true);
    
    // Verify listed component is still installed
    expect(fs.existsSync(path.join(systemsDir, 'sys1'))).toBe(true);
  });

  test('PATCH_DISABLE_TEST_WORLD_EXCEPTION environment variable allows purging test-world', async () => {
    const cfgPath = path.join(tmpRoot, 'cfg-disable-test-world.json');
    
    // Setup: Create test-world and other worlds
    const worldsDir = path.join(dataDir, 'worlds');
    fs.mkdirSync(worldsDir, { recursive: true });
    
    // Create test-world (normally preserved)
    fs.mkdirSync(path.join(worldsDir, 'test-world'), { recursive: true });
    fs.writeFileSync(path.join(worldsDir, 'test-world', 'world.json'), '{"name": "Test World"}');
    
    // Create another unlisted world
    fs.mkdirSync(path.join(worldsDir, 'unlisted-world'), { recursive: true });
    fs.writeFileSync(path.join(worldsDir, 'unlisted-world', 'world.json'), '{"name": "Unlisted World"}');
    
    // Create listed world
    fs.mkdirSync(path.join(worldsDir, 'w1'), { recursive: true });
    
    const cfg = {
      versions: { 
        '13': { 
          supported: true, 
          install: { 
            worlds: { w1: {} }  // Note: test-world is not listed
          }
        }
      },
      worlds: { w1: { manifest: manifestUrl } }
    };
    
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    
    // Enable PATCH_DISABLE_TEST_WORLD_EXCEPTION
    const env = {
      FOUNDRY_VERSION: '13.0.0',
      FOUNDRY_DATA_DIR: dataDir,
      CONTAINER_CONFIG_PATH: cfgPath,
      COMPONENT_CACHE: cacheDir,
      PATCH_FORCE_NODE_EXTRACT: '1',
      PATCH_DISABLE_TEST_WORLD_EXCEPTION: '1'
    };
    
    const installer = new ComponentInstaller(env, fallbacks, dirs);
    await installer.install();
    
    // Verify test-world is purged when exception is disabled
    expect(fs.existsSync(path.join(worldsDir, 'test-world'))).toBe(false);
    
    // Verify other unlisted world is also purged
    expect(fs.existsSync(path.join(worldsDir, 'unlisted-world'))).toBe(false);
    
    // Verify listed world is still installed
    expect(fs.existsSync(path.join(worldsDir, 'w1'))).toBe(true);
  });
});
