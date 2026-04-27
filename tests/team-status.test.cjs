/**
 * GSD Tools Tests - team-status
 *
 * Tests for scanAllUsers() cross-user directory scanning and
 * cmdTeamStatus() CLI command output.
 *
 * Requirements: TEAM-01, TEAM-02, TEAM-03
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempMultiUserProject, cleanup } = require('./helpers.cjs');

// Import functions under test
const { scanAllUsers } = require('../get-shit-done/bin/lib/context.cjs');
const { cmdTeamStatus } = require('../get-shit-done/bin/lib/commands.cjs');

// ─── scanAllUsers ──────────────────────────────────────────────────────────

describe('scanAllUsers', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('returns array with both users when 2 users exist', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Create second user (alice) with her own project
    const aliceDir = path.join(tmpDir, '.planning', 'users', 'alice');
    fs.mkdirSync(path.join(aliceDir, 'backend', 'phases'), { recursive: true });
    fs.writeFileSync(
      path.join(aliceDir, '.active'),
      JSON.stringify({ project: 'backend' }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(aliceDir, 'backend', 'STATE.md'),
      '---\nstatus: active\nmilestone: v1.0\nlast_updated: "2026-04-07T10:00:00Z"\nprogress:\n  total_phases: 3\n  completed_phases: 1\n  total_plans: 8\n  completed_plans: 4\n---\n\n# State\n',
      'utf-8'
    );

    const users = scanAllUsers(tmpDir);
    assert.strictEqual(users.length, 2);
    const userNames = users.map(u => u.user).sort();
    assert.deepStrictEqual(userNames, ['alice', 'test-user']);
  });

  test('shows active project name from .active file', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    const users = scanAllUsers(tmpDir);
    const testUser = users.find(u => u.user === 'test-user');
    assert.strictEqual(testUser.project, 'test-project');
  });

  test('shows null project when user has no .active file', () => {
    const result = createTempMultiUserProject({ withActive: false });
    tmpDir = result.tmpDir;

    const users = scanAllUsers(tmpDir);
    const testUser = users.find(u => u.user === 'test-user');
    assert.strictEqual(testUser.project, null);
  });

  test('reads STATE.md frontmatter fields correctly', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Write STATE.md with frontmatter for test-user's active project
    const projectDir = path.join(tmpDir, '.planning', 'users', 'test-user', 'test-project');
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '---\nmilestone: v2.0\nstatus: in-progress\nlast_updated: "2026-04-07T15:30:00Z"\nprogress:\n  total_phases: 5\n  completed_phases: 2\n  total_plans: 12\n  completed_plans: 7\n---\n\n# State\n',
      'utf-8'
    );

    const users = scanAllUsers(tmpDir);
    const testUser = users.find(u => u.user === 'test-user');
    assert.strictEqual(testUser.milestone, 'v2.0');
    assert.strictEqual(testUser.status, 'in-progress');
    assert.strictEqual(testUser.progress.total_phases, 5);
    assert.strictEqual(testUser.progress.completed_phases, 2);
    assert.strictEqual(testUser.progress.total_plans, 12);
    assert.strictEqual(testUser.progress.completed_plans, 7);
  });

  test('handles missing STATE.md gracefully with defaults', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Remove STATE.md if it exists
    const stateFile = path.join(tmpDir, '.planning', 'users', 'test-user', 'test-project', 'STATE.md');
    try { fs.unlinkSync(stateFile); } catch { /* may not exist */ }

    const users = scanAllUsers(tmpDir);
    const testUser = users.find(u => u.user === 'test-user');
    assert.strictEqual(testUser.status, 'unknown');
    assert.strictEqual(testUser.progress.total_phases, 0);
    assert.strictEqual(testUser.progress.completed_phases, 0);
    assert.strictEqual(testUser.progress.total_plans, 0);
    assert.strictEqual(testUser.progress.completed_plans, 0);
  });

  test('handles corrupt/empty STATE.md gracefully', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Write corrupt STATE.md
    const stateFile = path.join(tmpDir, '.planning', 'users', 'test-user', 'test-project', 'STATE.md');
    fs.writeFileSync(stateFile, 'this is not valid frontmatter', 'utf-8');

    const users = scanAllUsers(tmpDir);
    const testUser = users.find(u => u.user === 'test-user');
    assert.strictEqual(testUser.status, 'unknown');
    assert.strictEqual(testUser.progress.total_plans, 0);
    assert.strictEqual(testUser.progress.completed_plans, 0);
  });

  test('skips _archived directories and dot-directories', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Create _archived and .hidden directories
    const usersDir = path.join(tmpDir, '.planning', 'users');
    fs.mkdirSync(path.join(usersDir, '_archived', 'old-project'), { recursive: true });
    fs.mkdirSync(path.join(usersDir, '.hidden-user', 'secret'), { recursive: true });

    const users = scanAllUsers(tmpDir);
    const userNames = users.map(u => u.user);
    assert.ok(!userNames.includes('_archived'), '_archived should be skipped');
    assert.ok(!userNames.includes('.hidden-user'), 'dot-directories should be skipped');
  });

  test('returns empty array when .planning/users/ does not exist', () => {
    const os = require('os');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    // No .planning/users/ directory at all

    const users = scanAllUsers(tmpDir);
    assert.deepStrictEqual(users, []);
  });

  test('includes last_active timestamp from STATE.md last_updated field', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    const projectDir = path.join(tmpDir, '.planning', 'users', 'test-user', 'test-project');
    fs.writeFileSync(
      path.join(projectDir, 'STATE.md'),
      '---\nstatus: active\nlast_updated: "2026-04-07T12:00:00Z"\nprogress:\n  total_plans: 4\n  completed_plans: 2\n---\n\n# State\n',
      'utf-8'
    );

    const users = scanAllUsers(tmpDir);
    const testUser = users.find(u => u.user === 'test-user');
    assert.strictEqual(testUser.last_active, '2026-04-07T12:00:00Z');
  });

  test('does NOT modify any files (read-only cross-user scope)', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Create a second user
    const aliceDir = path.join(tmpDir, '.planning', 'users', 'alice');
    fs.mkdirSync(path.join(aliceDir, 'backend', 'phases'), { recursive: true });
    fs.writeFileSync(
      path.join(aliceDir, '.active'),
      JSON.stringify({ project: 'backend' }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(aliceDir, 'backend', 'STATE.md'),
      '---\nstatus: active\n---\n\n# State\n',
      'utf-8'
    );

    // Snapshot file mtimes before scan
    const aliceActive = path.join(aliceDir, '.active');
    const aliceState = path.join(aliceDir, 'backend', 'STATE.md');
    const testActive = path.join(tmpDir, '.planning', 'users', 'test-user', '.active');

    const beforeAliceActive = fs.statSync(aliceActive).mtimeMs;
    const beforeAliceState = fs.statSync(aliceState).mtimeMs;
    const beforeTestActive = fs.statSync(testActive).mtimeMs;

    // Run scan
    scanAllUsers(tmpDir);

    // Verify no file timestamps changed
    assert.strictEqual(fs.statSync(aliceActive).mtimeMs, beforeAliceActive, 'alice .active should not be modified');
    assert.strictEqual(fs.statSync(aliceState).mtimeMs, beforeAliceState, 'alice STATE.md should not be modified');
    assert.strictEqual(fs.statSync(testActive).mtimeMs, beforeTestActive, 'test-user .active should not be modified');
  });
});

// ─── cmdTeamStatus ──────────────────────────────────────────────────────────

describe('cmdTeamStatus', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      cleanup(tmpDir);
      tmpDir = null;
    }
  });

  test('outputs JSON with users array and count', () => {
    const result = createTempMultiUserProject();
    tmpDir = result.tmpDir;

    // Create a second user
    const aliceDir = path.join(tmpDir, '.planning', 'users', 'alice');
    fs.mkdirSync(path.join(aliceDir, 'backend', 'phases'), { recursive: true });
    fs.writeFileSync(
      path.join(aliceDir, '.active'),
      JSON.stringify({ project: 'backend' }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(aliceDir, 'backend', 'STATE.md'),
      '---\nstatus: active\nmilestone: v1.0\nlast_updated: "2026-04-07T10:00:00Z"\nprogress:\n  total_plans: 8\n  completed_plans: 4\n---\n\n# State\n',
      'utf-8'
    );

    // Capture output — core.cjs output() uses fs.writeSync(1, data)
    let captured = '';
    const originalWriteSync = fs.writeSync;
    fs.writeSync = (fd, data) => {
      if (fd === 1) { captured += data; return Buffer.byteLength(data); }
      return originalWriteSync.call(fs, fd, data);
    };

    try {
      cmdTeamStatus(tmpDir, false);
    } finally {
      fs.writeSync = originalWriteSync;
    }

    const parsed = JSON.parse(captured);
    assert.ok(Array.isArray(parsed.users), 'should have users array');
    assert.strictEqual(parsed.count, 2);
    assert.ok(parsed.timestamp, 'should have timestamp');
  });
});
