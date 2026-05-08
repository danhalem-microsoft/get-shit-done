'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Lock the autonomous-execution safeguard added to bin/install.js on
// 2026-05-08 in response to the May 1 incident: bin/install.js was invoked
// inside an autonomous Claude Code session without explicit user
// authorization, overwrote ~/.claude/get-shit-done/workflows/review.md
// (cross-AI peer review) with the new consolidated dispatcher, and the
// loss was invisible until the user noticed lost functionality days later.
//
// Mistake registry entry: docs/MISTAKES.md → 'autonomous-install'.

const installScript = path.join(__dirname, '..', 'bin', 'install.js');

function runInstall(env, args = []) {
  return spawnSync(process.execPath, [installScript, ...args], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('bin/install.js autonomous-execution safeguard', () => {
  test('REFUSES install when CLAUDECODE=1 is set (no GSD_INSTALL_AUTHORIZED)', () => {
    const r = runInstall({ CLAUDECODE: '1' });
    assert.strictEqual(r.status, 2,
      'expected exit code 2 when blocked; got ' + r.status + '\nstderr: ' + r.stderr);
    assert.match(r.stderr, /GSD install BLOCKED/,
      'expected blocked banner in stderr');
    assert.match(r.stderr, /CLAUDECODE=1/,
      'expected the trigger to be named in the stderr message');
    assert.match(r.stderr, /GSD_INSTALL_AUTHORIZED=1/,
      'expected the bypass instruction in the stderr message');
  });

  test('REFUSES install when CI=true is set', () => {
    const r = runInstall({ CI: 'true' });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /CI=true/);
  });

  test('REFUSES install when GITHUB_ACTIONS=true is set', () => {
    const r = runInstall({ GITHUB_ACTIONS: 'true' });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /GITHUB_ACTIONS=true/);
  });

  test('ALLOWS install when GSD_INSTALL_AUTHORIZED=1 is set even with CLAUDECODE=1', () => {
    const r = runInstall({ CLAUDECODE: '1', GSD_INSTALL_AUTHORIZED: '1' }, ['--help']);
    // --help means the install proceeds past the guard and renders the banner;
    // the banner doesn't include the BLOCKED text and exit is 0.
    assert.strictEqual(r.status, 0,
      'expected exit code 0 when authorized; got ' + r.status + '\nstderr: ' + r.stderr);
    assert.doesNotMatch(r.stderr, /GSD install BLOCKED/);
  });

  test('ALLOWS --help even in autonomous context (benign flag)', () => {
    const r = runInstall({ CLAUDECODE: '1' }, ['--help']);
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.stderr, /GSD install BLOCKED/);
  });

  test('ALLOWS install in a clean shell (no agent triggers)', () => {
    // No CLAUDECODE, no CI, no agent triggers — should proceed normally.
    const r = runInstall({}, ['--help']);
    assert.strictEqual(r.status, 0);
    assert.doesNotMatch(r.stderr, /GSD install BLOCKED/);
  });
});
