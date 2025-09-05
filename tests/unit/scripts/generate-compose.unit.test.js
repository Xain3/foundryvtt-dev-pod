const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const yaml = require('js-yaml');

// Import the module for unit testing individual functions
const generateCompose = require('../../../scripts/generate-compose.js');

function runNode(args, opts = {}) {
  return childProcess.execSync(`node ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// Import the module to test functions directly
const {
  parseArgs,
  resolveSecrets,
  toEnvList,
  resolveTemplatedString,
  resolveTemplatedNumber,
  buildComposeFromComposeConfig,
  buildComposeFromContainerConfig,
  main
} = require('../../../scripts/generate-compose.js');

describe('scripts/generate-compose.js', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(repoRoot, 'scripts/generate-compose.js');

  describe('parseArgs function', () => {
    test('parses default arguments correctly', () => {
      const args = parseArgs(['node', 'script.js']);
      expect(args.config).toBe('container-config.json');
      expect(args.out).toBe('');
      expect(args.dryRun).toBe(false);
      expect(args.secretsMode).toBe('auto');
    });

    test('parses config argument with -c', () => {
      const args = parseArgs(['node', 'script.js', '-c', 'custom-config.json']);
      expect(args.config).toBe('custom-config.json');
    });

    test('parses config argument with --config', () => {
      const args = parseArgs(['node', 'script.js', '--config', 'another-config.json']);
      expect(args.config).toBe('another-config.json');
    });

    test('parses output argument with -o', () => {
      const args = parseArgs(['node', 'script.js', '-o', 'output.yml']);
      expect(args.out).toBe('output.yml');
    });

    test('parses output argument with --out', () => {
      const args = parseArgs(['node', 'script.js', '--out', 'compose.yml']);
      expect(args.out).toBe('compose.yml');
    });

    test('handles --print flag', () => {
      const args = parseArgs(['node', 'script.js', '--print']);
      expect(args.out).toBe('');
    });

    test('handles --dry-run flag', () => {
      const args = parseArgs(['node', 'script.js', '--dry-run']);
      expect(args.dryRun).toBe(true);
    });

    test('handles -n flag for dry run', () => {
      const args = parseArgs(['node', 'script.js', '-n']);
      expect(args.dryRun).toBe(true);
    });

    test('parses secrets mode arguments', () => {
      const args = parseArgs(['node', 'script.js', '--secrets-mode', 'external', '--secrets-file', './custom.json', '--secrets-external', 'my_secret', '--secrets-target', 'app.json']);
      expect(args.secretsMode).toBe('external');
      expect(args.secretsFile).toBe('./custom.json');
      expect(args.secretsExternalName).toBe('my_secret');
      expect(args.secretsTarget).toBe('app.json');
    });
  });

  describe('resolveSecrets function', () => {
    test('resolves none mode', () => {
      const secrets = resolveSecrets({ secretsMode: 'none' });
      expect(secrets.topLevel).toEqual({});
      expect(secrets.serviceRef).toEqual([]);
    });

    test('resolves external mode with name', () => {
      const secrets = resolveSecrets({ secretsMode: 'external', secretsExternalName: 'my_config', secretsTarget: 'custom.json' });
      expect(secrets.topLevel).toEqual({ my_config: { external: true } });
      expect(secrets.serviceRef).toEqual([{ source: 'my_config', target: 'custom.json' }]);
    });

    test('resolves auto mode with external name', () => {
      const secrets = resolveSecrets({ secretsMode: 'auto', secretsExternalName: 'external_secret' });
      expect(secrets.topLevel).toEqual({ external_secret: { external: true } });
      expect(secrets.serviceRef).toEqual([{ source: 'external_secret', target: 'config.json' }]);
    });

    test('resolves default file mode', () => {
      const secrets = resolveSecrets({ secretsMode: 'file', secretsFile: './my-secrets.json', secretsTarget: 'app-config.json' });
      expect(secrets.topLevel).toEqual({ config_json: { file: './my-secrets.json' } });
      expect(secrets.serviceRef).toEqual([{ source: 'config_json', target: 'app-config.json' }]);
    });
  });

  describe('toEnvList function', () => {
    test('converts object to env list', () => {
      const result = toEnvList({ FOO: 'bar', BAZ: 'qux' });
      expect(result).toEqual(['FOO=bar', 'BAZ=qux']);
    });

    test('returns empty array for non-object input', () => {
      expect(toEnvList('string')).toEqual([]);
      expect(toEnvList(123)).toEqual([]);
      expect(toEnvList(['array'])).toEqual([]);
      expect(toEnvList(null)).toEqual([]);
    });

    test('returns empty array for undefined input', () => {
      expect(toEnvList(undefined)).toEqual([]);
    });
  });

  describe('resolveTemplatedString function', () => {
    test('replaces {version} placeholder', () => {
      expect(resolveTemplatedString('foundry-v{version}', 13)).toBe('foundry-v13');
      expect(resolveTemplatedString('v{version}-test', 12)).toBe('v12-test');
    });

    test('handles multiple placeholders', () => {
      expect(resolveTemplatedString('{version}.{version}', 11)).toBe('11.11');
    });

    test('returns undefined for non-string input', () => {
      expect(resolveTemplatedString(123, 13)).toBeUndefined();
      expect(resolveTemplatedString(null, 13)).toBeUndefined();
    });
  });

  describe('resolveTemplatedNumber function', () => {
    test('returns number as-is', () => {
      expect(resolveTemplatedNumber(3000, 13)).toBe(3000);
    });

    test('resolves templated string to number', () => {
      expect(resolveTemplatedNumber('300{version}', 13)).toBe(30013);
      expect(resolveTemplatedNumber('{version}000', 12)).toBe(12000);
    });

    test('returns undefined for invalid input', () => {
      expect(resolveTemplatedNumber('invalid', 13)).toBeUndefined();
      expect(resolveTemplatedNumber(null, 13)).toBeUndefined();
    });
  });

  describe('buildComposeFromComposeConfig function', () => {
    test('builds compose configuration', () => {
      const config = {
        baseImage: 'test/foundry',
        user: '1000:1000',
        versions: [
          {
            name: 'foundry-test',
            tag: 'latest',
            port: 3001,
            versionDir: 'test',
            fetchStaggerSeconds: 5
          }
        ],
        builder: { enabled: true, image: 'node:18' }
      };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromComposeConfig(config, secretsConf);

      expect(result.services['foundry-test']).toBeDefined();
      expect(result.services['foundry-test'].image).toBe('test/foundry:latest');
      expect(result.services['foundry-test'].user).toBe('1000:1000');
      expect(result.services['foundry-test'].ports).toEqual(['3001:30000']);
      expect(result.services.builder).toBeDefined();
      expect(result.services.builder.image).toBe('node:18');
      expect(result.volumes['foundry-test-data']).toBe(null);
    });

    test('handles missing version data gracefully', () => {
      const config = { versions: [{ name: '', versionDir: '' }] };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      expect(() => buildComposeFromComposeConfig(config, secretsConf)).toThrow();
    });

    test('disables builder when configured', () => {
      const config = {
        versions: [{ name: 'test', versionDir: 'v1' }],
        builder: { enabled: false }
      };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromComposeConfig(config, secretsConf);
      expect(result.services.builder).toBeUndefined();
    });
  });

  describe('buildComposeFromContainerConfig function', () => {
    test('builds compose from container config', () => {
      const containerCfg = {
        composition: {
          baseImage: 'custom/foundry',
          user: '500:500',
          version_params: {
            name: 'app-v{version}',
            port: '400{version}',
            versionDir: 'ver{version}'
          }
        },
        versions: {
          '13': {
            install: { systems: {}, modules: {} },
            composition_params: { port: 9999 }
          }
        }
      };
      const opts = {};
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromContainerConfig(containerCfg, opts, secretsConf);

      expect(result.services['app-v13']).toBeDefined();
      expect(result.services['app-v13'].image).toBe('custom/foundry:release');
      expect(result.services['app-v13'].user).toBe('500:500');
      expect(result.services['app-v13'].ports).toEqual(['9999:30000']);
    });

    test('handles environment overrides', () => {
      const containerCfg = {
        versions: { '12': { install: { systems: {}, modules: {} } } }
      };
      const opts = {
        baseImage: 'override/foundry',
        user: '2000:2000',
        builderEnabled: false
      };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromContainerConfig(containerCfg, opts, secretsConf);

      expect(result.services['foundry-v12'].image).toBe('override/foundry:12');
      expect(result.services['foundry-v12'].user).toBe('2000:2000');
      expect(result.services.builder).toBeUndefined();
    });

    test('skips unsupported versions', () => {
      const containerCfg = {
        versions: {
          '13': { install: { systems: {}, modules: {} } },
          '12': { supported: false, install: { systems: {}, modules: {} } }
        }
      };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromContainerConfig(containerCfg, {}, secretsConf);

      expect(result.services['foundry-v13']).toBeDefined();
      expect(result.services['foundry-v12']).toBeUndefined();
    });

    test('adds extra volumes and environment', () => {
      const containerCfg = {
        versions: {
          '13': {
            install: { systems: {}, modules: {} },
            composition_params: {
              volumes_extra: ['./extra:/extra'],
              environment: { CUSTOM_VAR: 'value' },
              env_files: ['./custom.env']
            }
          }
        }
      };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromContainerConfig(containerCfg, {}, secretsConf);

      const service = result.services['foundry-v13'];
      expect(service.volumes).toContain('./extra:/extra');
      expect(service.environment).toContain('CUSTOM_VAR=value');
      expect(service.env_file).toContain('./custom.env');
    });

    test('handles environment as array', () => {
      const containerCfg = {
        versions: {
          '13': {
            install: { systems: {}, modules: {} },
            composition_params: {
              environment: ['VAR1=value1', 'VAR2=value2']
            }
          }
        }
      };
      const secretsConf = { topLevel: {}, serviceRef: [] };

      const result = buildComposeFromContainerConfig(containerCfg, {}, secretsConf);

      const service = result.services['foundry-v13'];
      expect(service.environment).toContain('VAR1=value1');
      expect(service.environment).toContain('VAR2=value2');
    });
  });

  describe('main function', () => {
    let originalArgv;
    let originalStdout;
    let originalExit;
    let stdoutOutput;

    beforeEach(() => {
      originalArgv = process.argv;
      originalStdout = process.stdout.write;
      originalExit = process.exit;
      stdoutOutput = '';

      // Mock stdout.write to capture output
      process.stdout.write = jest.fn((str) => {
        stdoutOutput += str;
        return true;
      });

      // Mock process.exit to prevent actual exits
      process.exit = jest.fn();
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.stdout.write = originalStdout;
      process.exit = originalExit;
    });

    test('outputs to stdout when no output file specified', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-main-'));
      const cfgPath = path.join(tmp, 'container-config.json');
      const cfg = {
        systems: { s: { name: 'S', manifest: '', path: '/test.zip', install_at_startup: true } },
        modules: { m: { name: 'M', manifest: 'https://example.com/test.json', path: '', install_at_startup: true } },
        versions: { '13': { install: { systems: { s: {} }, modules: { m: {} } } } }
      };
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

      process.argv = ['node', 'script.js', '-c', cfgPath];

      main();

      expect(stdoutOutput).toContain('secrets:');
      expect(stdoutOutput).toContain('services:');
      expect(process.exit).not.toHaveBeenCalled();
    });

    test('writes to file when output file specified', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-main-'));
      const cfgPath = path.join(tmp, 'container-config.json');
      const outPath = path.join(tmp, 'output.yml');
      const cfg = {
        systems: { s: { name: 'S', manifest: '', path: '/test.zip', install_at_startup: true } },
        modules: { m: { name: 'M', manifest: 'https://example.com/test.json', path: '', install_at_startup: true } },
        versions: { '13': { install: { systems: { s: {} }, modules: { m: {} } } } }
      };
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

      // Mock console.log to capture it
      const originalConsoleLog = console.log;
      let consoleOutput = '';
      console.log = jest.fn((str) => { consoleOutput += str + '\n'; });

      process.argv = ['node', 'script.js', '-c', cfgPath, '-o', outPath];

      main();

      expect(fs.existsSync(outPath)).toBe(true);
      expect(consoleOutput).toContain(`Wrote ${path.resolve(outPath)}`);

      console.log = originalConsoleLog;
    });
  });

  // Existing CLI integration tests...
  describe('CLI integration', () => {

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

  test('supports GCP secrets mode with project and secret name', () => {
    const mockSecretContent = '{"foundry_license": "test-license", "foundry_password": "test-password"}';
    const mockRetrieveGcpSecret = jest.fn().mockReturnValue(mockSecretContent);

    const result = generateCompose.resolveSecrets({
      secretsMode: 'gcp',
      secretsGcpProject: 'test-project',
      secretsGcpSecret: 'test-secret',
      secretsTarget: 'config.json'
    }, mockRetrieveGcpSecret);

    expect(result.topLevel).toBeTruthy();
    expect(Object.keys(result.topLevel)).toContain('config_json_gcp');
    expect(result.topLevel.config_json_gcp).toHaveProperty('file');
    expect(result.topLevel.config_json_gcp.file).toMatch(/^\/tmp\/secrets-gcp-\d+\.json$/);

    expect(result.serviceRef).toEqual([{
      source: 'config_json_gcp',
      target: 'config.json'
    }]);

    // Verify the GCP function was called correctly
    expect(mockRetrieveGcpSecret).toHaveBeenCalledWith('test-project', 'test-secret');

    // Verify the secret content was written to the file
    const secretFile = result.topLevel.config_json_gcp.file;
    expect(fs.existsSync(secretFile)).toBe(true);
    expect(fs.readFileSync(secretFile, 'utf8')).toBe(mockSecretContent);

    // Clean up temp file
    fs.unlinkSync(secretFile);
  });

  test('auto-detects GCP mode when project and secret are provided', () => {
    const mockSecretContent = '{"foundry_license": "test-license"}';
    const mockRetrieveGcpSecret = jest.fn().mockReturnValue(mockSecretContent);

    const result = generateCompose.resolveSecrets({
      secretsMode: 'auto',
      secretsGcpProject: 'auto-project',
      secretsGcpSecret: 'auto-secret'
    }, mockRetrieveGcpSecret);

    expect(result.topLevel).toBeTruthy();
    expect(Object.keys(result.topLevel)).toContain('config_json_gcp');
    expect(result.serviceRef).toEqual([{
      source: 'config_json_gcp',
      target: 'config.json'
    }]);

    expect(mockRetrieveGcpSecret).toHaveBeenCalledWith('auto-project', 'auto-secret');

    // Clean up temp file
    const secretFile = result.topLevel.config_json_gcp.file;
    if (fs.existsSync(secretFile)) {
      fs.unlinkSync(secretFile);
    }
  });

  test('throws error when GCP command fails', () => {
    const mockRetrieveGcpSecret = jest.fn().mockImplementation(() => {
      throw new Error('Command failed: gcloud secrets versions access');
    });

    expect(() => {
      generateCompose.resolveSecrets({
        secretsMode: 'gcp',
        secretsGcpProject: 'fail-project',
        secretsGcpSecret: 'fail-secret'
      }, mockRetrieveGcpSecret);
    }).toThrow('Failed to retrieve GCP secret: Command failed: gcloud secrets versions access');
  });

  test('parseArgs correctly handles GCP-related arguments', () => {
    const argv = [
      'node', 'script.js',
      '--secrets-mode', 'gcp',
      '--secrets-gcp-project', 'my-project',
      '--secrets-gcp-secret', 'my-secret',
      '--secrets-target', 'credentials.json'
    ];

    const args = generateCompose.parseArgs(argv);

    expect(args.secretsMode).toBe('gcp');
    expect(args.secretsGcpProject).toBe('my-project');
    expect(args.secretsGcpSecret).toBe('my-secret');
    expect(args.secretsTarget).toBe('credentials.json');
  });

  test('parseArgs uses environment variables for GCP settings', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      COMPOSE_SECRETS_MODE: 'gcp',
      COMPOSE_SECRETS_GCP_PROJECT: 'env-project',
      COMPOSE_SECRETS_GCP_SECRET: 'env-secret'
    };

    try {
      const args = generateCompose.parseArgs(['node', 'script.js']);

      expect(args.secretsMode).toBe('gcp');
      expect(args.secretsGcpProject).toBe('env-project');
      expect(args.secretsGcpSecret).toBe('env-secret');
    } finally {
      process.env = originalEnv;
    }
  });

  test('supports Azure secrets mode with vault and secret name', () => {
    const mockSecretContent = '{"foundry_license": "azure-license", "foundry_password": "azure-password"}';
    const mockRetrieveAzureSecret = jest.fn().mockReturnValue(mockSecretContent);

    const result = generateCompose.resolveSecrets({
      secretsMode: 'azure',
      secretsAzureVault: 'test-vault',
      secretsAzureSecret: 'test-secret',
      secretsTarget: 'config.json'
    }, undefined, mockRetrieveAzureSecret);

    expect(result.topLevel).toBeTruthy();
    expect(Object.keys(result.topLevel)).toContain('config_json_azure');
    expect(result.topLevel.config_json_azure).toHaveProperty('file');
    expect(result.topLevel.config_json_azure.file).toMatch(/^\/tmp\/secrets-azure-\d+\.json$/);

    expect(result.serviceRef).toEqual([{
      source: 'config_json_azure',
      target: 'config.json'
    }]);

    // Verify the Azure function was called correctly
    expect(mockRetrieveAzureSecret).toHaveBeenCalledWith('test-vault', 'test-secret');

    // Verify the secret content was written to the file
    const secretFile = result.topLevel.config_json_azure.file;
    expect(fs.existsSync(secretFile)).toBe(true);
    expect(fs.readFileSync(secretFile, 'utf8')).toBe(mockSecretContent);

    // Clean up temp file
    fs.unlinkSync(secretFile);
  });

  test('auto-detects Azure mode when vault and secret are provided', () => {
    const mockSecretContent = '{"foundry_license": "azure-auto-license"}';
    const mockRetrieveAzureSecret = jest.fn().mockReturnValue(mockSecretContent);

    const result = generateCompose.resolveSecrets({
      secretsMode: 'auto',
      secretsAzureVault: 'auto-vault',
      secretsAzureSecret: 'auto-secret'
    }, undefined, mockRetrieveAzureSecret);

    expect(result.topLevel).toBeTruthy();
    expect(Object.keys(result.topLevel)).toContain('config_json_azure');
    expect(result.serviceRef).toEqual([{
      source: 'config_json_azure',
      target: 'config.json'
    }]);

    expect(mockRetrieveAzureSecret).toHaveBeenCalledWith('auto-vault', 'auto-secret');

    // Clean up temp file
    const secretFile = result.topLevel.config_json_azure.file;
    if (fs.existsSync(secretFile)) {
      fs.unlinkSync(secretFile);
    }
  });

  test('throws error when Azure command fails', () => {
    const mockRetrieveAzureSecret = jest.fn().mockImplementation(() => {
      throw new Error('Command failed: az keyvault secret show');
    });

    expect(() => {
      generateCompose.resolveSecrets({
        secretsMode: 'azure',
        secretsAzureVault: 'fail-vault',
        secretsAzureSecret: 'fail-secret'
      }, undefined, mockRetrieveAzureSecret);
    }).toThrow('Failed to retrieve Azure secret: Command failed: az keyvault secret show');
  });

  test('supports AWS secrets mode with region and secret name', () => {
    const mockSecretContent = '{"foundry_license": "aws-license", "foundry_password": "aws-password"}';
    const mockRetrieveAwsSecret = jest.fn().mockReturnValue(mockSecretContent);

    const result = generateCompose.resolveSecrets({
      secretsMode: 'aws',
      secretsAwsRegion: 'us-east-1',
      secretsAwsSecret: 'test-secret',
      secretsTarget: 'config.json'
    }, undefined, undefined, mockRetrieveAwsSecret);

    expect(result.topLevel).toBeTruthy();
    expect(Object.keys(result.topLevel)).toContain('config_json_aws');
    expect(result.topLevel.config_json_aws).toHaveProperty('file');
    expect(result.topLevel.config_json_aws.file).toMatch(/^\/tmp\/secrets-aws-\d+\.json$/);

    expect(result.serviceRef).toEqual([{
      source: 'config_json_aws',
      target: 'config.json'
    }]);

    // Verify the AWS function was called correctly
    expect(mockRetrieveAwsSecret).toHaveBeenCalledWith('us-east-1', 'test-secret');

    // Verify the secret content was written to the file
    const secretFile = result.topLevel.config_json_aws.file;
    expect(fs.existsSync(secretFile)).toBe(true);
    expect(fs.readFileSync(secretFile, 'utf8')).toBe(mockSecretContent);

    // Clean up temp file
    fs.unlinkSync(secretFile);
  });

  test('auto-detects AWS mode when region and secret are provided', () => {
    const mockSecretContent = '{"foundry_license": "aws-auto-license"}';
    const mockRetrieveAwsSecret = jest.fn().mockReturnValue(mockSecretContent);

    const result = generateCompose.resolveSecrets({
      secretsMode: 'auto',
      secretsAwsRegion: 'us-west-2',
      secretsAwsSecret: 'auto-secret'
    }, undefined, undefined, mockRetrieveAwsSecret);

    expect(result.topLevel).toBeTruthy();
    expect(Object.keys(result.topLevel)).toContain('config_json_aws');
    expect(result.serviceRef).toEqual([{
      source: 'config_json_aws',
      target: 'config.json'
    }]);

    expect(mockRetrieveAwsSecret).toHaveBeenCalledWith('us-west-2', 'auto-secret');

    // Clean up temp file
    const secretFile = result.topLevel.config_json_aws.file;
    if (fs.existsSync(secretFile)) {
      fs.unlinkSync(secretFile);
    }
  });

  test('throws error when AWS command fails', () => {
    const mockRetrieveAwsSecret = jest.fn().mockImplementation(() => {
      throw new Error('Command failed: aws secretsmanager get-secret-value');
    });

    expect(() => {
      generateCompose.resolveSecrets({
        secretsMode: 'aws',
        secretsAwsRegion: 'us-east-1',
        secretsAwsSecret: 'fail-secret'
      }, undefined, undefined, mockRetrieveAwsSecret);
    }).toThrow('Failed to retrieve AWS secret: Command failed: aws secretsmanager get-secret-value');
  });

  test('parseArgs correctly handles Azure-related arguments', () => {
    const argv = [
      'node', 'script.js',
      '--secrets-mode', 'azure',
      '--secrets-azure-vault', 'my-vault',
      '--secrets-azure-secret', 'my-secret',
      '--secrets-target', 'credentials.json'
    ];

    const args = generateCompose.parseArgs(argv);

    expect(args.secretsMode).toBe('azure');
    expect(args.secretsAzureVault).toBe('my-vault');
    expect(args.secretsAzureSecret).toBe('my-secret');
    expect(args.secretsTarget).toBe('credentials.json');
  });

  test('parseArgs correctly handles AWS-related arguments', () => {
    const argv = [
      'node', 'script.js',
      '--secrets-mode', 'aws',
      '--secrets-aws-region', 'eu-west-1',
      '--secrets-aws-secret', 'my-secret',
      '--secrets-target', 'credentials.json'
    ];

    const args = generateCompose.parseArgs(argv);

    expect(args.secretsMode).toBe('aws');
    expect(args.secretsAwsRegion).toBe('eu-west-1');
    expect(args.secretsAwsSecret).toBe('my-secret');
    expect(args.secretsTarget).toBe('credentials.json');
  });

  test('parseArgs uses environment variables for Azure settings', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      COMPOSE_SECRETS_MODE: 'azure',
      COMPOSE_SECRETS_AZURE_VAULT: 'env-vault',
      COMPOSE_SECRETS_AZURE_SECRET: 'env-secret'
    };

    try {
      const args = generateCompose.parseArgs(['node', 'script.js']);

      expect(args.secretsMode).toBe('azure');
      expect(args.secretsAzureVault).toBe('env-vault');
      expect(args.secretsAzureSecret).toBe('env-secret');
    } finally {
      process.env = originalEnv;
    }
  });

  test('parseArgs uses environment variables for AWS settings', () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      COMPOSE_SECRETS_MODE: 'aws',
      COMPOSE_SECRETS_AWS_REGION: 'ap-southeast-1',
      COMPOSE_SECRETS_AWS_SECRET: 'env-secret'
    };

    try {
      const args = generateCompose.parseArgs(['node', 'script.js']);

      expect(args.secretsMode).toBe('aws');
      expect(args.secretsAwsRegion).toBe('ap-southeast-1');
      expect(args.secretsAwsSecret).toBe('env-secret');
    } finally {
      process.env = originalEnv;
    }
  test('handles environment variable overrides', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'container-config.json');
    const cfg = {
      systems: { s: { name: 'S', manifest: '', path: '/test.zip', install_at_startup: true } },
      modules: { m: { name: 'M', manifest: 'https://example.com/test.json', path: '', install_at_startup: true } },
      versions: { '13': { install: { systems: { s: {} }, modules: { m: {} } } } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const output = runNode(`${scriptPath} --print -c ${cfgPath}`, {
      env: {
        ...process.env,
        COMPOSE_BASE_IMAGE: 'custom/foundry',
        COMPOSE_USER: '1000:1000',
        COMPOSE_BUILDER_ENABLED: '0'
      }
    });

    const doc = yaml.load(output);
    expect(doc.services['foundry-v13'].image).toBe('custom/foundry:release');
    expect(doc.services['foundry-v13'].user).toBe('1000:1000');
    expect(doc.services.builder).toBeUndefined();
  });

  test('handles secrets configuration', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'container-config.json');
    const cfg = {
      systems: { s: { name: 'S', manifest: '', path: '/test.zip', install_at_startup: true } },
      modules: { m: { name: 'M', manifest: 'https://example.com/test.json', path: '', install_at_startup: true } },
      versions: { '13': { install: { systems: { s: {} }, modules: { m: {} } } } }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const output = runNode(`${scriptPath} --print -c ${cfgPath} --secrets-mode external --secrets-external my_secret --secrets-target app.json`);
    const doc = yaml.load(output);

    expect(doc.secrets.my_secret).toEqual({ external: true });
    expect(doc.services['foundry-v13'].secrets).toEqual([{ source: 'my_secret', target: 'app.json' }]);
  });

  test('handles advanced compose config format', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'compose-config.json');
    const cfg = {
      baseImage: 'advanced/foundry',
      user: '500:500',
      versions: [
        {
          name: 'foundry-advanced',
          tag: 'beta',
          port: 8080,
          versionDir: 'advanced',
          fetchStaggerSeconds: 10
        }
      ],
      builder: { enabled: true, image: 'node:latest' }
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const output = runNode(`${scriptPath} --print -c ${cfgPath}`);
    const doc = yaml.load(output);

    expect(doc.services['foundry-advanced']).toBeDefined();
    expect(doc.services['foundry-advanced'].image).toBe('advanced/foundry:beta');
    expect(doc.services['foundry-advanced'].ports).toEqual(['8080:30000']);
    expect(doc.services.builder.image).toBe('node:latest');
  });

  test('exits with error for non-existent config file', () => {
    expect(() => {
      runNode(`${scriptPath} -c /non/existent/file.json`);
    }).toThrow();
  });

  test('exits with error for invalid JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'invalid.json');
    fs.writeFileSync(cfgPath, '{ invalid json }');

    expect(() => {
      runNode(`${scriptPath} -c ${cfgPath}`);
    }).toThrow();
  });

  test('exits with error for invalid container config', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-gen-'));
    const cfgPath = path.join(tmp, 'invalid-config.json');
    const cfg = {
      systems: { s: { name: 'S' } }, // Missing manifest or path
      modules: {},
      versions: { '13': {} } // Missing install
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    expect(() => {
      runNode(`${scriptPath} -c ${cfgPath}`);
    }).toThrow();
  });
  });
});
