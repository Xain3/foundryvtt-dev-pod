const childProcess = require('node:child_process');
const path = require('node:path');

function runBashScript(script, args = [], opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const env = { ...process.env, ...(opts.env || {}) };
  const res = childProcess.spawnSync('bash', [script, ...args], { cwd, env, encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

module.exports = { runBashScript };
