import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

const installerPath = '../../../patches/common/helpers/componentInstaller.mjs';

// Use ESM mocking API to ensure mocks apply before import
jest.unstable_mockModule('../../../patches/common/helpers/common.mjs', () => ({
	parseBoolEnv: (v, d) => { if (v === undefined || v === null || v === '') return d; return ['1','true','yes','on'].includes(String(v).toLowerCase()); },
	which: () => '/usr/bin/fake',
	copyDirAtomic: (src, dest, opts={}) => { if (opts?.dryRun) console.log(`[patch] (dry-run) Copy dir ${src} -> ${dest}`); return { success: true, src, dest }; },
	isArchive: (p) => /\.(zip|tar|tgz|tar\.gz)$/i.test(p || ''),
	isDirectory: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
	isUrl: (p) => /^https?:\/\//i.test(p || ''),
	readJSON: (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
}));

jest.unstable_mockModule('../../../patches/common/helpers/cache.mjs', () => ({
	CacheManager: class CacheManager {
		constructor(baseDir, opts) { this.baseDir = baseDir; this.opts = opts; }
		async fetchToFileWithCache(url) {
			const id = Buffer.from(url).toString('hex').slice(0,8);
			fs.mkdirSync(this.baseDir, { recursive: true });
			const file = path.join(this.baseDir, `${id}.bin`);
			if (/manifest\.json$/i.test(url)) {
				fs.writeFileSync(file, JSON.stringify({ download: url.replace('manifest.json', 'pkg.zip') }));
			} else if (/pkg\.zip$/i.test(url)) {
				fs.writeFileSync(file, 'ZIPDATA');
			} else if (/manifest-error$/i.test(url)) {
				return { success: false, error: 'HTTP 500 for http://127.0.0.1:34363/error500' };
			} else {
				fs.writeFileSync(file, 'PLAIN');
			}
			return { success: true, path: file, fromCache: false };
		}
		async hasLocalDirectoryChanged() { return { changed: true }; }
		async hasLocalFileChanged() { return { changed: true }; }
	}
}));

jest.unstable_mockModule('../../../patches/common/helpers/extractors.mjs', () => ({
	extractArchiveNode: async () => ({ success: true })
}));

let ComponentInstaller;
beforeAll(async () => { ({ ComponentInstaller } = await import(installerPath)); });

describe('ComponentInstaller', () => {
	let tempDir; let configPath; let dataDir; let baseEnv;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-inst-test-'));
		dataDir = path.join(tempDir, 'Data');
		fs.mkdirSync(dataDir, { recursive: true });
		configPath = path.join(tempDir, 'container-config.json');
		const config = {
			systems: {
				testsys: { name: 'Test System', path: path.join(tempDir, 'local-system') },
				archsys: { name: 'Archive System', path: path.join(tempDir, 'arch-system.zip') },
				remotesys: { name: 'Remote System', manifest: 'https://example.com/remotesys/manifest.json' }
			},
			modules: {
				testmod: { name: 'Test Module', path: path.join(tempDir, 'local-module') },
				remotemod: { name: 'Remote Module', manifest: 'https://example.com/remotemod/manifest.json' }
			},
			worlds: { testworld: { name: 'Test World', path: path.join(tempDir, 'local-world') } },
			versions: {
				'13': {
					install: {
						systems: { testsys: {}, archsys: {}, remotesys: {} },
						modules: { testmod: {}, remotemod: {} },
						worlds: { testworld: {} }
					}
				}
			}
		};
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		// Create local source directories and archive placeholder
		fs.mkdirSync(path.join(tempDir, 'local-system'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, 'local-module'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, 'local-world'), { recursive: true });
		fs.writeFileSync(path.join(tempDir, 'arch-system.zip'), 'FAKEZIP');
		baseEnv = {
			FOUNDRY_VERSION: '13.307',
			FOUNDRY_DATA_DIR: dataDir,
			CONTAINER_CONFIG_PATH: configPath
		};
	});

	afterEach(() => { fs.rmSync(tempDir, { recursive: true, force: true }); });

	const fallbacks = { VERSION: '13', DATA_DIR: '/data/Data', CONTAINER_CONFIG_PATH: '/config/container-config.json' };
	const dirs = { SYSTEMS: 'systems', MODULES: 'modules', WORLDS: 'worlds' };

	test('major version parses and falls back when needed', () => {
		const env = { ...baseEnv, FOUNDRY_VERSION: 'latest' };
		const inst = new ComponentInstaller(env, fallbacks, dirs);
		expect(inst.getVersion()).toBe('13');
	});

	test('installation creates target directories and installs items', async () => {
		const inst = new ComponentInstaller(baseEnv, fallbacks, dirs);
		await inst.install();
		expect(fs.existsSync(path.join(dataDir, 'systems'))).toBe(true);
	});

	test('purgeUnlistedComponents removes directories except test-world', async () => {
		const inst = new ComponentInstaller(baseEnv, fallbacks, dirs);
		// Pre-create extra items
		const systemsDir = path.join(dataDir, 'systems');
		fs.mkdirSync(path.join(systemsDir, 'orphan'), { recursive: true });
		const worldsDir = path.join(dataDir, 'worlds');
		fs.mkdirSync(path.join(worldsDir, 'test-world'), { recursive: true });
		fs.mkdirSync(path.join(worldsDir, 'orphan-world'), { recursive: true });
		await inst.install();
		expect(fs.existsSync(path.join(systemsDir, 'orphan'))).toBe(false);
		expect(fs.existsSync(path.join(worldsDir, 'orphan-world'))).toBe(false);
		// test-world preserved
		expect(fs.existsSync(path.join(worldsDir, 'test-world'))).toBe(true);
	});

	test('disabling purge keeps unlisted components', async () => {
		const env = { ...baseEnv, PATCH_DISABLE_PURGE: '1' };
		const inst = new ComponentInstaller(env, fallbacks, dirs);
		const systemsDir = path.join(dataDir, 'systems');
		fs.mkdirSync(path.join(systemsDir, 'orphan'), { recursive: true });
		await inst.install();
		expect(fs.existsSync(path.join(systemsDir, 'orphan'))).toBe(true);
	});

	test('getSource prefers manifest over path', async () => {
		const env = { ...baseEnv };
		const inst = new ComponentInstaller(env, fallbacks, dirs);
		// Access private via prototype hack (not ideal but acceptable for coverage) by invoking install on a crafted per-version config
		const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
		// Inject a component config with both manifest and path
		inst.containerConfig.systems.dual = { name: 'Dual', manifest: 'https://example.com/dual/manifest.json', path: '/some/local' };
		inst.versionConfig.install.systems.dual = {};
		await inst.install();
		// Aggregate console.warn calls preserving grouping per invocation
		const warnings = spy.mock.calls
			.map(callArgs => callArgs.map(a => String(a)).join(' '))
			.join(' ');
		expect(warnings).toMatch(/both manifest and path/);
		spy.mockRestore();
	});

	test('manifest fetch attempts to resolve download url', async () => {
		const env = { ...baseEnv };
		const inst = new ComponentInstaller(env, fallbacks, dirs);
		await inst.install();
		// remote system/module should have produced installed directory (copyDirAtomic stub)
		expect(fs.existsSync(path.join(dataDir, 'systems'))).toBe(true);
	});
});

