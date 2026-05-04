'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-01 spike — verify Claude Code's @-reference resolves at Task-spawn time
// for the gsd-critic-plan agent.
//
// B2 redesign (per 02-REVIEWS.md verify-C-001):
//   The PROMPT is canary-agnostic — the sub-agent is asked to print any HTML
//   comment it finds on the first line of its context. The CANARY literal
//   appears only in the ASSERTION below, not in the prompt sent over the wire.
//   Plan 02 plants the canary as an HTML comment on line 1 of critic-base.md.
//   If @-resolution silently fails, the sub-agent has no HTML comment to print
//   and the assertion fails — eliminating the false-positive PASS surface.
//
// Wave-0 RED expectation: until Plan 02 lands the base file with the canary
// HTML comment AND temporarily inserts the @-import in gsd-critic-plan.md for
// the spike, this test fails (sub-agent finds no HTML comment in its context,
// or returns the empty string).

const CANARY = 'SPIKE-CANARY-7d8e9f0-base-loaded';

describe('CRIT-01: critic @-reference resolves at Task spawn (spike — B2 canary-agnostic prompt)', () => {
  test('canary HTML comment from agents/_shared/critic-base.md appears in spawned critic output', async () => {
    const result = await runClaudeWithTools(
      'Use the Task tool to spawn subagent_type="gsd-critic-plan" with this prompt:\n' +
      '"You are gsd-critic-plan. Read your own agent prompt context. Print any HTML comment you find on the first line of your context. Do not analyze any plan. Do not write any files. Output only the comment text."',
      {
        cwd: getRepoRoot(),
        timeout: 300_000,
        maxBudget: 5,
      }
    );

    // Record walltime ledger entry (XCUT-03 — phase-2-critic).
    // CR-05: pass `cost_usd` (NOT `cost`) — silent-zero coercion bug from Phase 1.
    recordWalltime({
      test: 'integration:critic-spike-passes',
      walltime_ms: result.duration_ms,
      cost_usd: result.cost,
      phase: 'phase-2-critic',
    });

    assert.ok(result.success,
      `spike invocation failed: ${result.error || (result.result || '').slice(0, 300)}`);
    assert.ok((result.result || '').includes(CANARY),
      `canary "${CANARY}" not found in critic output — @-reference may have failed to resolve.\n` +
      `(B2 design: canary is an HTML comment in critic-base.md; sub-agent prompt is canary-agnostic.)\n` +
      `First 500 chars of output:\n${(result.result || '').slice(0, 500)}`);
  });
});
