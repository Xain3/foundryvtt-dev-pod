import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBashScript } from '#tests/utils/shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('scripts/pod-handler.sh', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(repoRoot, 'scripts/pod-handler.sh');
  let testComposeFile;

  beforeEach(() => {
    // Create a temporary compose file for testing
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pod-handler-test-'));
    testComposeFile = path.join(tmp, 'test-compose.yml');
    const composeContent = `version: '3.8'
services:
  test-service:
    image: alpine:latest
    command: sleep 60
`;
    fs.writeFileSync(testComposeFile, composeContent);
  });

  afterEach(() => {
    // Clean up test compose file
    if (testComposeFile && fs.existsSync(testComposeFile)) {
      fs.unlinkSync(testComposeFile);
    }
  });

  test('shows help message', () => {
    const res = runBashScript(scriptPath, ['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Usage: pod-handler.sh [options] <command>');
    expect(res.stdout).toContain('--dry-run, -n');
    expect(res.stdout).toContain('Show what docker compose commands would be executed');
  });

  test('dry-run shows commands without executing them', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'up']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd up --remove-orphans');
  });

  test('dry-run with -n flag works the same as --dry-run', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '-n', 'up', '-d']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd up -d --remove-orphans');
  });

  test('dry-run shows start command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'start', 'test-service']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd up -d --build --no-deps test-service');
  });

  test('dry-run shows build command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'build', 'test-service']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd build test-service');
  });

  test('dry-run shows build command without service correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'build']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd build');
  });

  test('dry-run shows down command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'down']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd down');
  });

  test('dry-run shows restart command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'restart', 'test-service']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd restart test-service');
  });

  test('dry-run shows pull command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'pull']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd pull');
  });

  test('dry-run shows ps command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'ps']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd ps');
  });

  test('dry-run shows logs command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'logs', 'test-service']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd logs test-service');
  });

  test('dry-run shows logs -f command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'logs', '-f', 'test-service']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd logs -f test-service');
  });

  test('dry-run shows exec command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'exec', 'test-service', 'ls']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd exec -u 0 -it test-service ls');
  });

  test('dry-run shows shell command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'shell', 'test-service']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd exec -u 0 -it test-service');
  });

  test('dry-run shows run-builder command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'run-builder']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd up -d --build builder');
  });

  test('dry-run shows stop-builder command correctly', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'stop-builder']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[dry-run] Would run: dc_cmd stop builder');
  });

  test('error when required service argument missing for start', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'start']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Usage:');
    expect(res.stderr).toContain('start SERVICE');
  });

  test('error when required service argument missing for restart', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'restart']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Usage:');
    expect(res.stderr).toContain('restart SERVICE');
  });

  test('error when required service argument missing for exec', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'exec']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Usage:');
    expect(res.stderr).toContain('exec SERVICE');
  });

  test('error when required service argument missing for shell', () => {
    const res = runBashScript(scriptPath, ['-f', testComposeFile, '--dry-run', 'shell']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Usage:');
    expect(res.stderr).toContain('shell SERVICE');
  });
});