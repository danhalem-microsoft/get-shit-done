'use strict';

/**
 * Phase 2 Plan 03 Task 3: verify bin/install.js correctly handles
 * agents/_shared/ for the Claude runtime — the directory is enumerated by the
 * manifest builder AND each shared *.md file is hashed and tracked under the
 * key `agents/_shared/<file>`.
 *
 * Multi-runtime parity (Codex/Cursor/Cline/Windsurf/Augment/Gemini/OpenCode/
 * Kilo/Antigravity/Trae/Qwen — 11 runtimes total) is deferred per Phase 2
 * RESEARCH §Open-Q-4. Phase 2 covers the Claude runtime only. The deferral
 * has a tracking entry in REQUIREMENTS.md Future Requirements (added by
 * Plan 03 Task 5; H3 of 02-REVIEWS.md / scope-H-002).
 *
 * H10 (per 02-REVIEWS.md verify-W-005): the test invocation pattern is
 * locked against the actual bin/install.js argv parser shape. This file uses
 * the GSD_TEST_MODE=1 + module.exports.writeManifest direct-call pattern
 * (proven by tests/install-hooks-copy.test.cjs:281), not a subprocess
 * invocation. Rationale:
 *   - bin/install.js exposes writeManifest as a test-only export under
 *     `if (process.env.GSD_TEST_MODE) { module.exports = { ..., writeManifest, ... } }`
 *     (see install.js around line 7000).
 *   - The argv parser at install.js:66 reads `process.argv.slice(2)`; the
 *     supported invocation flags include `--claude --global` and
 *     `--config-dir <path>`. A subprocess invocation would also hit the
 *     interactive prompt path (no TTY → exit) and the actual file copy
 *     pipeline, which is out of scope for this test (only the manifest
 *     builder needs to be verified).
 *   - The direct-call pattern matches install-hooks-copy.test.cjs which is
 *     the closest analog test for an install.js manifest assertion.
 *
 * Alternative considered + rejected: an `execFileSync('node', [INSTALL_JS,
 * '--claude', '--global', '--config-dir', tmpDir])` subprocess invocation.
 * Rejected because the full install pipeline (file copy, hook registration,
 * settings.json mutation) is out of scope for verifying the manifest builder
 * specifically; the direct call is faster (≈10ms vs ≈3s), more isolated, and
 * matches the existing test idiom in tests/install-hooks-copy.test.cjs.
 *
 * Per CONTEXT.md D-04 (per-test concurrency contract): each test uses a
 * temp directory under os.tmpdir(), reads/writes only its own scope, and
 * does not mutate process.cwd or shared state.
 */

process.env.GSD_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_ROOT = path.resolve(__dirname, '..');
const INSTALL_JS = path.join(REPO_ROOT, 'bin', 'install.js');
const SHARED_FILE_REL = 'agents/_shared/critic-base.md';
const SHARED_FILE_SRC = path.join(REPO_ROOT, SHARED_FILE_REL);
const MANIFEST_FILENAME = 'gsd-file-manifest.json';

// Direct-call import (H10 invocation discovery): bin/install.js exposes
// writeManifest under GSD_TEST_MODE=1.
const { writeManifest } = require(INSTALL_JS);

describe('Phase 2 Plan 03 Task 3: bin/install.js handles agents/_shared/ for Claude runtime', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-install-shared-'));
    // Stage a minimal Claude-runtime layout under tmpDir:
    //   tmpDir/agents/gsd-critic-plan.md           (mock primary agent)
    //   tmpDir/agents/_shared/critic-base.md       (copy of repo file)
    // writeManifest reads from configDir/agents/ and configDir/agents/_shared/.
    const agentsDir = path.join(tmpDir, 'agents');
    const sharedDir = path.join(agentsDir, '_shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    // Place a minimal gsd-* primary agent so the existing manifest loop has
    // something to enumerate (verifies the new code is additive, not a swap).
    fs.writeFileSync(path.join(agentsDir, 'gsd-critic-plan.md'), '# mock primary agent\n');
    // Copy the real shared base file from the repo into the staged tree.
    fs.copyFileSync(SHARED_FILE_SRC, path.join(sharedDir, 'critic-base.md'));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('source agents/_shared/critic-base.md exists in the repo (Plan 02 prerequisite)', () => {
    assert.ok(fs.existsSync(SHARED_FILE_SRC),
      `agents/_shared/critic-base.md must exist on disk; Plan 02 Task 1 lands it. ` +
      `Looked at: ${SHARED_FILE_SRC}`);
  });

  test('writeManifest copies and hashes agents/_shared/critic-base.md under the agents/_shared/ key', () => {
    writeManifest(tmpDir, 'claude');

    const manifestPath = path.join(tmpDir, MANIFEST_FILENAME);
    assert.ok(fs.existsSync(manifestPath),
      `manifest file must be written: expected ${manifestPath}`);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.ok(manifest.files && typeof manifest.files === 'object',
      'manifest.files object must be present (hash map keyed by relative path)');

    // Primary agent loop still works (regression check — additive change).
    assert.ok(manifest.files['agents/gsd-critic-plan.md'],
      'manifest.files["agents/gsd-critic-plan.md"] missing — additive change broke primary agent loop');

    // Phase 2 manifest extension active.
    assert.ok(manifest.files['agents/_shared/critic-base.md'],
      'manifest.files["agents/_shared/critic-base.md"] missing — Phase 2 manifest extension not active');
    assert.match(String(manifest.files['agents/_shared/critic-base.md']), /^[a-f0-9]{8,}/,
      'expected hex hash for agents/_shared/critic-base.md, got: ' +
      String(manifest.files['agents/_shared/critic-base.md']));
  });

  test('manifest hash matches sha256 of the staged shared file', () => {
    writeManifest(tmpDir, 'claude');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, MANIFEST_FILENAME), 'utf-8'));
    const stagedFile = path.join(tmpDir, 'agents', '_shared', 'critic-base.md');
    const expectedHash = require('node:crypto')
      .createHash('sha256')
      .update(fs.readFileSync(stagedFile))
      .digest('hex');
    assert.strictEqual(
      manifest.files['agents/_shared/critic-base.md'],
      expectedHash,
      'manifest hash must equal sha256 of file contents');
  });

  test('writeManifest does not record agents/_shared/ when the directory does not exist', () => {
    // Remove the staged shared dir; manifest builder should skip silently.
    fs.rmSync(path.join(tmpDir, 'agents', '_shared'), { recursive: true, force: true });

    writeManifest(tmpDir, 'claude');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, MANIFEST_FILENAME), 'utf-8'));
    assert.ok(!manifest.files['agents/_shared/critic-base.md'],
      'manifest should not record agents/_shared/critic-base.md when sharedDir absent');
    // Primary agent loop unaffected.
    assert.ok(manifest.files['agents/gsd-critic-plan.md'],
      'primary agent loop must still work when shared dir absent');
  });
});
