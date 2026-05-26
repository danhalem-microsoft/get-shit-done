'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('./test-repo.cjs');

const INSTALL_JS = path.join(REPO_ROOT, 'bin', 'install.js');

function runInstall({ runtime, dir, fakeHome, extraArgs = [], timeoutMs = 120000 }) {
  const args = [INSTALL_JS, '--local', `--${runtime}`, ...extraArgs];
  const env = { ...process.env, HOME: fakeHome, GSD_TEST_MODE: '1' };
  const res = spawnSync('node', args, {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (res.error) return { ok: false, error: res.error.message, stdout: res.stdout || '', stderr: res.stderr || '' };
  if (res.status !== 0) {
    return { ok: false, error: `install exited with ${res.status}`, stdout: res.stdout || '', stderr: res.stderr || '' };
  }
  return { ok: true, stdout: res.stdout || '', stderr: res.stderr || '' };
}

module.exports = { runInstall, INSTALL_JS };
