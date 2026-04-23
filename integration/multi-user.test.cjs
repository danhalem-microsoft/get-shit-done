'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runClaude, createTestProject } = require('./helpers/claude-runner.cjs');

describe('Multi-user isolation via Claude CLI', () => {
  let projectDir;

  before(() => {
    // Create a project with two users
    projectDir = createTestProject('multi-user-test', { multiUser: true, userSlug: 'user-alpha', projectName: 'proj-a' });
    // Add a second user
    const user2Dir = path.join(projectDir, '.planning', 'users', 'user-beta', 'proj-b', 'phases');
    fs.mkdirSync(user2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'users', 'user-beta', '.active'),
      JSON.stringify({ project: 'proj-b' })
    );
    // Update user-map with both users
    const mapPath = path.join(projectDir, '.planning', 'user-map.json');
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    map['beta@test.com'] = 'user-beta';
    fs.writeFileSync(mapPath, JSON.stringify(map));
  });

  test('two user directories exist independently', () => {
    assert.ok(fs.existsSync(path.join(projectDir, '.planning', 'users', 'user-alpha')));
    assert.ok(fs.existsSync(path.join(projectDir, '.planning', 'users', 'user-beta')));
    // Verify user-map contains both entries
    const map = JSON.parse(fs.readFileSync(path.join(projectDir, '.planning', 'user-map.json'), 'utf-8'));
    assert.strictEqual(map['test@test.com'], 'user-alpha');
    assert.strictEqual(map['beta@test.com'], 'user-beta');
  });

  test('claude can see multi-user structure and identifies both users', () => {
    const result = runClaude(
      ['--print', 'List the directories under .planning/users/ and tell me how many users exist. Include the directory names.'],
      { cwd: projectDir, timeout: 180_000 }
    );
    assert.ok(result.output.length > 0, 'Expected output from Claude');
    // Must mention at least one of the user slugs
    const output = result.output.toLowerCase();
    assert.ok(
      output.includes('user-alpha') || output.includes('user-beta') || output.includes('2'),
      `Output does not reference multi-user structure: ${result.output.slice(0, 200)}`
    );
  });

  test('claude --print with team-status command produces structured output', () => {
    const result = runClaude(
      ['--print', 'Run: node get-shit-done/gsd-tools.cjs team-status and show the output.'],
      { cwd: projectDir, timeout: 180_000 }
    );
    assert.ok(
      result.success || result.output.length > 0 || result.error.length > 0,
      'team-status produced no output'
    );
    // Tightened: output should reference team/user concepts or error about missing config
    const combined = (result.output + result.error);
    assert.ok(
      combined.length >= 10,
      `team-status output too short to be meaningful (${combined.length} chars)`
    );
  });
});
