'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');

/**
 * Claude Code + GSD skill integration tests.
 *
 * These tests invoke the real Claude CLI with tool use enabled
 * (--dangerously-skip-permissions) and verify that GSD skills
 * execute end-to-end — not just that Claude returns text, but
 * that skills fire, tools run, and structured output appears.
 *
 * Each test costs real API tokens. Budget is capped per test.
 */

describe('Claude Code GSD skill execution', () => {
  const repoRoot = getRepoRoot();

  test('/gsd-progress skill executes and returns project state', () => {
    const result = runClaudeWithTools(
      'Run /gsd-progress and show the output.',
      { cwd: repoRoot, timeout: 120_000, maxBudget: 5 }
    );

    assert.ok(result.success, `Claude failed: ${result.error || result.result.slice(0, 300)}`);
    assert.ok(result.turns >= 2,
      `Expected >= 2 tool-use turns (skill must invoke tools), got ${result.turns}`);

    // The output must contain GSD project state — not just a polite refusal or generic text
    const output = result.result.toLowerCase();
    const gsdMarkers = ['phase', 'plan', 'progress', 'roadmap', 'milestone'];
    const found = gsdMarkers.filter(m => output.includes(m));
    assert.ok(found.length >= 2,
      `Output missing GSD markers (found: ${found.join(', ')}). Full output: ${result.result.slice(0, 500)}`);
  });

  test('/gsd-help skill executes and lists available commands', () => {
    const result = runClaudeWithTools(
      'Run /gsd-help and show me the available commands.',
      { cwd: repoRoot, timeout: 120_000, maxBudget: 5 }
    );

    assert.ok(result.success, `Claude failed: ${result.error || result.result.slice(0, 300)}`);

    // Must list actual GSD commands
    const output = result.result.toLowerCase();
    const commands = ['gsd-plan-phase', 'gsd-execute-phase', 'gsd-discuss-phase', 'gsd-progress'];
    const found = commands.filter(c => output.includes(c));
    assert.ok(found.length >= 2,
      `Output should list GSD commands (found: ${found.join(', ')}). Output: ${result.result.slice(0, 500)}`);
  });

  test('/gsd-stats skill executes and returns project metrics', () => {
    const result = runClaudeWithTools(
      'Run /gsd-stats and show the output.',
      { cwd: repoRoot, timeout: 120_000, maxBudget: 5 }
    );

    assert.ok(result.success, `Claude failed: ${result.error || result.result.slice(0, 300)}`);
    assert.ok(result.turns >= 2,
      `Expected >= 2 tool-use turns, got ${result.turns}`);

    // Stats should mention phases, plans, or commits
    const output = result.result.toLowerCase();
    const statsMarkers = ['phase', 'plan', 'commit', 'file', 'line'];
    const found = statsMarkers.filter(m => output.includes(m));
    assert.ok(found.length >= 2,
      `Output missing stats markers (found: ${found.join(', ')}). Output: ${result.result.slice(0, 500)}`);
  });

  test('Claude uses multiple tools when executing a skill', () => {
    // /gsd-progress requires reading STATE.md, ROADMAP.md, running gsd-tools.cjs
    // This test verifies Claude actually used tools, not just responded from training data
    const result = runClaudeWithTools(
      'Run /gsd-progress and show the output.',
      { cwd: repoRoot, timeout: 120_000, maxBudget: 5 }
    );

    assert.ok(result.success, `Claude failed: ${result.error || result.result.slice(0, 300)}`);

    // Must have used multiple tool turns — a skill that just returns canned text is not real
    assert.ok(result.turns >= 3,
      `Skill should use multiple tool turns (read files, run commands), got only ${result.turns}`);

    // Output must reference THIS project specifically, not generic GSD docs
    const output = result.result;
    assert.ok(
      output.includes('Multi-User') || output.includes('multi-user') ||
      output.includes('monorepo') || output.includes('Monorepo') ||
      output.includes('get-shit-done') || output.includes('GSD'),
      `Output should reference this specific project, not generic content. Got: ${output.slice(0, 500)}`
    );
  });
});
