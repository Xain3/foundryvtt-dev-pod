/*
 * @file generate-compose.timeout.unit.test.js
 * @path tests/unit/scripts/generate-compose.timeout.unit.test.js
 * @summary Unit tests for secrets CLI timeout configuration (default, env override, CLI flag override)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve script under test
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up three levels: scripts -> unit -> tests -> project root 'dev'
const projectRoot = path.resolve(__dirname, '../../..');

// Dynamically import the script module so we can access its exported helpers.
const scriptPath = path.join(projectRoot, 'scripts/generate-compose.js');

/** Helper to clear module from import cache for fresh state */
async function freshImport() {
  return import(`${scriptPath}?t=${Date.now()}`);
}

/** Temporarily mutate process.env and restore after fn */
async function withEnv(envPatch, fn) {
  const original = { ...process.env };
  Object.assign(process.env, envPatch);
  try {
    await fn();
  } finally {
    // Restore (remove keys that were added / modified)
    for (const k of Object.keys(process.env)) {
      if (!(k in original)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(original)) process.env[k] = v;
  }
}

// We rely on the public API exported: parseArgs, getSecretsCliTimeoutMs, setSecretsCliTimeoutMs

describe('generate-compose secrets CLI timeout configuration', () => {
  test('default timeout is 8000 when no overrides present', async () => {
    await withEnv({ COMPOSE_SECRETS_CLI_TIMEOUT_MS: '' }, async () => {
      const mod = await freshImport();
      expect(mod.getSecretsCliTimeoutMs()).toBe(8000);
    });
  });

  test('environment variable COMPOSE_SECRETS_CLI_TIMEOUT_MS overrides default', async () => {
    await withEnv({ COMPOSE_SECRETS_CLI_TIMEOUT_MS: '12000' }, async () => {
      const mod = await freshImport();
      expect(mod.getSecretsCliTimeoutMs()).toBe(12000);
    });
  });

  test('CLI flag --secrets-cli-timeout has highest precedence over env', async () => {
    await withEnv({ COMPOSE_SECRETS_CLI_TIMEOUT_MS: '9000' }, async () => {
      const mod = await freshImport();
      // Simulate parsing arguments with flag
      const args = mod.parseArgs(['node', 'generate-compose', '--secrets-cli-timeout', '15000']);
      // main normally applies the override; we call setter directly
      mod.setSecretsCliTimeoutMs(Number(args.secretsCliTimeout));
      expect(mod.getSecretsCliTimeoutMs()).toBe(15000);
    });
  });

  test('invalid (non-numeric) env var falls back to default', async () => {
    await withEnv({ COMPOSE_SECRETS_CLI_TIMEOUT_MS: 'abc' }, async () => {
      const mod = await freshImport();
      expect(mod.getSecretsCliTimeoutMs()).toBe(8000);
    });
  });
});
