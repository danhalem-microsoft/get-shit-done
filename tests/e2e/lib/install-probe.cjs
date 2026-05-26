'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('./test-repo.cjs');

const INSTALL_JS = path.join(REPO_ROOT, 'bin', 'install.js');

function runInstall({ runtime, dir, fakeHome, extraArgs = [], timeoutMs = 120000 }) {
  const args = [INSTALL_JS, '--local', `--${runtime}`, ...extraArgs];
  // NOTE: deliberately do NOT set GSD_TEST_MODE=1 — that env var causes
  // bin/install.js to skip its main logic and just export test functions
  // (see bin/install.js around line 7036). The E2E probe needs install
  // to actually run, so we only override HOME to point at the scratch
  // fakehome dir.
  const env = { ...process.env, HOME: fakeHome };
  delete env.GSD_TEST_MODE;
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
