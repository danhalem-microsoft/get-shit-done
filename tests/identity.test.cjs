/**
 * GSD Tools Tests - identity.cjs
 *
 * Tests for user identity resolution, slug generation, user-map.json management,
 * and the GSD_USER env var override.
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createTempMultiUserProject, createTempProject, cleanup } = require('./helpers.cjs');
const { sanitizeSlug, resolveIdentity, loadUserMap, lockIdentity } = require('../get-shit-done/bin/lib/identity.cjs');

// ─── sanitizeSlug ───────────────────────────────────────────────────────────

describe('sanitizeSlug', () => {
  test('basic name', () => {
    assert.strictEqual(sanitizeSlug('Dan Halem'), 'dan-halem');
  });

  test('special characters', () => {
    assert.strictEqual(sanitizeSlug("Alice O'Brien-Smith!"), 'alice-o-brien-smith');
  });

  test('30-char truncation', () => {
    const result = sanitizeSlug('a'.repeat(50));
    assert.ok(result.length <= 30, `Expected length <= 30, got ${result.length}`);
  });

  test('trailing hyphen trimming after truncation', () => {
    // Create input that produces a hyphen at the truncation boundary
    // 'abcdefghijklmnopqrstuvwxyzabc' is 28 chars, then '-' at 29, 'x' at 30
    // After slug generation: 'abcdefghijklmnopqrstuvwxyzabc-xyz...'
    // Truncating at 30: 'abcdefghijklmnopqrstuvwxyzabc-' should have trailing hyphen trimmed
    const input = 'abcdefghijklmnopqrstuvwxyzabc x extra';
    const result = sanitizeSlug(input);
    assert.ok(!result.endsWith('-'), `Expected no trailing hyphen, got "${result}"`);
    assert.ok(result.length <= 30, `Expected length <= 30, got ${result.length}`);
  });

  test('null input returns null', () => {
    assert.strictEqual(sanitizeSlug(null), null);
  });

  test('empty string returns null', () => {
    assert.strictEqual(sanitizeSlug(''), null);
  });
});

// ─── resolveIdentity ────────────────────────────────────────────────────────

describe('resolveIdentity', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('GSD_USER env var bypasses everything', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    const saved = process.env.GSD_USER;
    try {
      process.env.GSD_USER = 'override-user';
      const identity = resolveIdentity(tmpDir);
      assert.deepStrictEqual(identity, {
        slug: 'override-user',
        source: 'GSD_USER',
        raw: 'override-user',
      });
    } finally {
      if (saved !== undefined) {
        process.env.GSD_USER = saved;
      } else {
        delete process.env.GSD_USER;
      }
    }
  });

  test('git user.name resolution', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;
    const saved = process.env.GSD_USER;
    try {
      delete process.env.GSD_USER;
      const identity = resolveIdentity(tmpDir);
      assert.strictEqual(identity.slug, 'test-user');
      assert.strictEqual(identity.source, 'git-user-name');
      assert.strictEqual(identity.raw, 'Test User');
    } finally {
      if (saved !== undefined) {
        process.env.GSD_USER = saved;
      } else {
        delete process.env.GSD_USER;
      }
    }
  });

  test('email local-part fallback', () => {
    // This test creates a subprocess with a controlled git config that has
    // only user.email (no user.name) and runs resolveIdentity there.
    const os = require('os');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "alice@example.com"', { cwd: tmpDir, stdio: 'pipe' });
    // Deliberately NOT setting user.name

    // Write a small test script to run in subprocess with isolated git config
    const script = `
      const { resolveIdentity } = require('${require.resolve('../get-shit-done/bin/lib/identity.cjs').replace(/\\/g, '\\\\')}');
      const result = resolveIdentity('${tmpDir.replace(/\\/g, '\\\\')}');
      process.stdout.write(JSON.stringify(result));
    `;

    const output = execSync(`node -e "${script.replace(/"/g, '\\"')}"`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GSD_USER: '',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
    });

    const identity = JSON.parse(output.trim());
    assert.strictEqual(identity.source, 'git-user-email');
    assert.strictEqual(identity.raw, 'alice');
    assert.ok(identity.slug.startsWith('alice'), `Expected slug to start with alice, got "${identity.slug}"`);
  });
});

// ─── loadUserMap ────────────────────────────────────────────────────────────

describe('loadUserMap', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('returns empty object when file missing', () => {
    tmpDir = createTempProject();
    const map = loadUserMap(tmpDir);
    assert.deepStrictEqual(map, {});
  });

  test('returns empty object on corrupted JSON', () => {
    tmpDir = createTempProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'user-map.json'),
      'this is not valid json {{{',
      'utf-8'
    );
    const map = loadUserMap(tmpDir);
    assert.deepStrictEqual(map, {});
  });
});

// ─── lockIdentity ───────────────────────────────────────────────────────────

describe('lockIdentity', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('first registration creates entry', () => {
    tmpDir = createTempProject();
    const result = lockIdentity(tmpDir, 'Dan Halem', 'dan-halem', 'git user.name');
    assert.strictEqual(result, 'dan-halem');

    const mapPath = path.join(tmpDir, '.planning', 'user-map.json');
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    assert.strictEqual(map['Dan Halem'], 'dan-halem');
    assert.strictEqual(map._schema, 1);
  });

  test('duplicate raw name returns existing slug', () => {
    tmpDir = createTempProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'user-map.json'),
      JSON.stringify({ _schema: 1, 'Dan Halem': 'dan-halem' }, null, 2) + '\n',
      'utf-8'
    );
    const result = lockIdentity(tmpDir, 'Dan Halem', 'dan-halem', 'git user.name');
    assert.strictEqual(result, 'dan-halem');
  });

  test('slug collision appends numeric suffix', () => {
    tmpDir = createTempProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'user-map.json'),
      JSON.stringify({ _schema: 1, 'Dan H': 'dan-h' }, null, 2) + '\n',
      'utf-8'
    );
    const result = lockIdentity(tmpDir, 'Dan Halem', 'dan-h', 'git user.name');
    assert.strictEqual(result, 'dan-h-2');

    const mapPath = path.join(tmpDir, '.planning', 'user-map.json');
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    assert.strictEqual(map['Dan H'], 'dan-h');
    assert.strictEqual(map['Dan Halem'], 'dan-h-2');
  });
});
