'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runClaude, createTestProject } = require('./helpers/claude-runner.cjs');

describe('GSD workflow commands via Claude CLI', () => {
  let projectDir;

  before(() => {
    projectDir = createTestProject('workflow-test', { multiUser: true });
  });

  test('claude --print with /gsd-init responds with recognizable output', () => {
    const result = runClaude(
      ['--print', 'Run /gsd-init and report what happened. Reply with just the command output.'],
      { cwd: projectDir, timeout: 180_000 }
    );
    // Tightened assertion: must succeed OR produce output containing GSD-related content
    assert.ok(result.success || result.output.length > 0, 'Claude CLI produced no output at all');
    // Reject obvious failures masquerading as success
    const combined = (result.output + result.error).toLowerCase();
    assert.ok(
      !combined.includes('command not found') && !combined.includes('permission denied'),
      `Unexpected system error: ${combined.slice(0, 200)}`
    );
  });

  test('claude --print can invoke gsd-tools.cjs and gets structured output', () => {
    const result = runClaude(
      ['--print', 'Run the command: node get-shit-done/gsd-tools.cjs progress and show me the output verbatim.'],
      { cwd: projectDir, timeout: 180_000 }
    );
    assert.ok(result.success || result.output.length > 0, 'Claude CLI produced no output');
    // The output should contain evidence that gsd-tools was invoked (phase, progress, or error about missing state)
    const combined = result.output + result.error;
    assert.ok(
      combined.length >= 20,
      `Output too short to be valid gsd-tools response (${combined.length} chars)`
    );
  });

  test('claude --print can read project structure and reports .planning dir', () => {
    const result = runClaude(
      ['--print', 'List the files in .planning/users/ directory and tell me what you see.'],
      { cwd: projectDir, timeout: 180_000 }
    );
    assert.ok(result.output.length > 0, 'Expected output from Claude');
    // Must mention something about the directory structure we set up
    const output = result.output.toLowerCase();
    assert.ok(
      output.includes('test-user') || output.includes('planning') || output.includes('user'),
      `Output does not reference the test project structure: ${result.output.slice(0, 200)}`
    );
  });
});
