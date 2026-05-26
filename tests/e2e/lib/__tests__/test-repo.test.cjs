const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScratchRepo, destroyScratchRepo } = require('../test-repo.cjs');

test('createScratchRepo copies the lifecycle fixture and inits a git repo', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    assert.ok(fs.existsSync(path.join(scratch.dir, 'src', 'calc.js')));
    assert.ok(fs.existsSync(path.join(scratch.dir, '.git')));
    assert.ok(fs.existsSync(scratch.fakeHome));
    const readme = fs.readFileSync(path.join(scratch.dir, 'README.md'), 'utf8');
    assert.match(readme, /GSD_E2E_FIXTURE_MARKER_8d3c1f7a/);
  } finally {
    destroyScratchRepo(scratch);
  }
  assert.equal(fs.existsSync(scratch.dir), false);
});

test('destroyScratchRepo is skipped when GSD_E2E_KEEP_TMP=1', () => {
  process.env.GSD_E2E_KEEP_TMP = '1';
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  destroyScratchRepo(scratch);
  try {
    assert.equal(fs.existsSync(scratch.dir), true);
  } finally {
    delete process.env.GSD_E2E_KEEP_TMP;
    fs.rmSync(scratch.root, { recursive: true, force: true });
  }
});
