'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'e2e', 'fixtures');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function createScratchRepo({ fixture = 'lifecycle' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-e2e-'));
  const dir = path.join(root, 'project');
  const fakeHome = path.join(root, 'fakehome');
  fs.mkdirSync(fakeHome, { recursive: true });
  copyDir(path.join(FIXTURES_DIR, fixture), dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'gsd-e2e@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'GSD E2E'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir });
  return { root, dir, fakeHome };
}

function destroyScratchRepo(scratch) {
  if (!scratch || !scratch.root) return;
  if (process.env.GSD_E2E_KEEP_TMP === '1') {
    console.log(`[gsd-e2e] keeping scratch: ${scratch.root}`);
    return;
  }
  fs.rmSync(scratch.root, { recursive: true, force: true });
}

module.exports = { createScratchRepo, destroyScratchRepo, FIXTURES_DIR, REPO_ROOT };
