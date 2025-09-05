const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const yaml = require('js-yaml');

function runNode(args, opts = {}) {
  return childProcess.execSync(`node ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

describe('scripts/generate-compose.js', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(repoRoot, 'scripts/generate-compose.js');

  test('uses templated top-level version_params when no per-version overrides', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'container-config.json');
    const cfg = {
      systems: { s: { name: 'S', manifest: '', path: '/data/container_cache/s.zip', install_at_startup: true } },
      modules: { m: { name: 'M', manifest: 'https://example.com/m.json', path: '', install_at_startup: true } },
      composition: {
        baseImage: 'felddy/foundryvtt',
        user: '0:0',
        version_params: { name: 'foundry-v{version}', tag: 'release', port: '300{version}', versionDir: 'v{version}', envSuffix: 'v{version}' }
      },
      versions: {
        '13': { install: { systems: { s: {} }, modules: { m: {} } } },
        '12': { install: { systems: { s: {} }, modules: { m: {} } } }
      }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const output = runNode(`${scriptPath} --print -c ${cfgPath}`);
    const doc = yaml.load(output);

    expect(doc.services['foundry-v13']).toBeTruthy();
    expect(doc.services['foundry-v13'].image).toBe('felddy/foundryvtt:release');
    expect(doc.services['foundry-v13'].ports[0]).toBe('30013:30000');
    expect(doc.services['foundry-v13'].volumes.some(v => typeof v === 'object' && v.source === './shared/v13')).toBe(true);
    expect(doc.services['foundry-v13'].env_file.includes('./env/.v13.env')).toBe(true);

    expect(doc.services['foundry-v12']).toBeTruthy();
    expect(doc.services['foundry-v12'].ports[0]).toBe('30012:30000');
    expect(doc.services['foundry-v12'].env_file.includes('./env/.v12.env')).toBe(true);
  });

  test('applies per-version composition_params overrides only if present', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'container-config.json');
    const cfg = {
      systems: { s: { name: 'S', manifest: '', path: '/data/container_cache/s.zip', install_at_startup: true } },
      modules: { m: { name: 'M', manifest: 'https://example.com/m.json', path: '', install_at_startup: true } },
      composition: {
        version_params: { name: 'foundry-v{version}', tag: '{version}', port: '310{version}', versionDir: 'v{version}' }
      },
      versions: {
        '13': { install: { systems: { s: {} }, modules: { m: {} } }, composition_params: { name: 'custom-v13', port: 39999 } },
        '12': { install: { systems: { s: {} }, modules: { m: {} } } } // uses defaults
      }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const output = runNode(`${scriptPath} --print -c ${cfgPath}`);
    const doc = yaml.load(output);

    expect(doc.services['custom-v13']).toBeTruthy();
    expect(doc.services['custom-v13'].ports[0]).toBe('39999:30000');
    expect(doc.services['custom-v13'].image).toBe('felddy/foundryvtt:13');

    expect(doc.services['foundry-v12']).toBeTruthy();
    expect(doc.services['foundry-v12'].ports[0]).toBe('31012:30000');
    expect(doc.services['foundry-v12'].image).toBe('felddy/foundryvtt:12');
  });

  test('dry-run shows what would be done without writing files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'container-config.json');
    const outPath = path.join(tmp, 'test-output.yml');
    const cfg = {
      systems: { s: { name: 'S', manifest: '', path: '/test.zip', install_at_startup: true } },
      modules: { m: { name: 'M', manifest: 'https://example.com/test.json', path: '', install_at_startup: true } },
      versions: { '13': { install: { systems: { s: {} }, modules: { m: {} } } } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  const output = runNode(`${scriptPath} --dry-run -c ${cfgPath} -o ${outPath}`);

    expect(output).toContain('[dry-run] Would generate compose YAML from config:');
    expect(output).toContain(cfgPath);
    expect(output).toContain(`[dry-run] Would write to: ${outPath}`);
    expect(output).toContain('[dry-run] Generated YAML size:');
    expect(fs.existsSync(outPath)).toBe(false); // File should not be created
  });

  test('dry-run with -n flag works the same as --dry-run', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'container-config.json');
    const cfg = {
      systems: { s: { name: 'S', manifest: '', path: '/test.zip', install_at_startup: true } },
      modules: { m: { name: 'M', manifest: 'https://example.com/test.json', path: '', install_at_startup: true } },
      versions: { '13': { install: { systems: { s: {} }, modules: { m: {} } } } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  const output = runNode(`${scriptPath} -n -c ${cfgPath}`);

    expect(output).toContain('[dry-run] Would generate compose YAML from config:');
    expect(output).toContain('[dry-run] Would write to: stdout');
    expect(output).toContain('[dry-run] Generated YAML size:');
  });
});
