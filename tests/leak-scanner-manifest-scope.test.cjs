/**
 * Bug: leak scanner false-positives on foreign plugin files.
 *
 * When `--copilot --global` installs to `~/.copilot/`, the runtime may already
 * contain unrelated plugin installs under `installed-plugins/`. Those files
 * legitimately reference ~/.claude paths in their own documentation and are
 * NOT files GSD wrote — but the leak scanner used to walk the entire target
 * directory and flag them. The scanner should only scan files GSD wrote (per
 * the file manifest).
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const INSTALL_JS = path.join(__dirname, '..', 'bin', 'install.js');

describe('leak scanner respects manifest scope (does not scan foreign plugins)', () => {
  let scratchDir;

  before(() => {
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-leak-scope-'));
    // Simulate a foreign plugin already installed in the target dir. Real-world
    // example: ~/.copilot/installed-plugins/superpowers-marketplace/... contains
    // markdown docs that legitimately reference ~/.claude paths.
    const foreignDir = path.join(scratchDir, 'installed-plugins', 'foreign-plugin', 'docs');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(
      path.join(foreignDir, 'README.md'),
      '# Foreign plugin\n\nThis plugin lives at ~/.claude/some/path and $HOME/.claude/other.\n',
    );
  });

  after(() => {
    if (scratchDir && fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  test('--copilot --global with foreign plugin present does not warn about it', () => {
    const result = spawnSync(
      'node',
      [INSTALL_JS, '--copilot', '--global', '--config-dir', scratchDir],
      { encoding: 'utf8' },
    );
    assert.equal(
      result.status,
      0,
      `install failed: stdout=${result.stdout}\nstderr=${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;

    // The foreign plugin file must NOT be flagged by the leak scanner.
    assert.ok(
      !combined.includes('installed-plugins/foreign-plugin'),
      `Leak scanner falsely flagged a foreign plugin file. Output:\n${combined}`,
    );

    // The foreign plugin file itself must still exist after install
    // (GSD must not touch files it did not write).
    const foreignFile = path.join(
      scratchDir,
      'installed-plugins',
      'foreign-plugin',
      'docs',
      'README.md',
    );
    assert.ok(fs.existsSync(foreignFile), 'install must not delete foreign plugin files');
    const foreignContent = fs.readFileSync(foreignFile, 'utf8');
    assert.ok(
      foreignContent.includes('~/.claude/some/path'),
      'install must not modify foreign plugin file contents',
    );
  });
});
