/**
 * @file shell.js
 * @description Shell script testing utilities
 * @path tests/utils/shell.js
 */

import childProcess from 'node:child_process';
import path from 'node:path';

function runBashScript(script, args = [], opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const env = { ...process.env, ...(opts.env || {}) };
  const res = childProcess.spawnSync('bash', [script, ...args], { cwd, env, encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

export { runBashScript };
