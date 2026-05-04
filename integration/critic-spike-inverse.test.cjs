'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-01 inverse spike — false-positive guard.
//
// Per 02-REVIEWS.md B2 / O5: the canary-only spike (critic-spike-passes) can
// produce a false-positive PASS if Claude Code's @-resolver silently fails but
// some other path injects the canary literal into the sub-agent's context.
// This test ELIMINATES that surface by temporarily renaming the base file out
// of the way and asserting the canary is ABSENT in the sub-agent's output.
//
// Setup: fs.renameSync(BASE, BASE + '.bak')   // i.e. agents/_shared/critic-base.md.bak
// Run:   spawn gsd-critic-plan with the SAME canary-agnostic prompt
// Assert: result.success === true AND result.result does NOT include CANARY
// Teardown (try/finally): fs.renameSync(BASE + '.bak', BASE) — ALWAYS, even on
// assertion fail. The .bak file (agents/_shared/critic-base.md.bak) must NEVER
// be left on disk after the test exits — Plan 02 GO/NO-GO checkpoint asserts
// `git status --porcelain agents/_shared/` is clean.
//
// Wave-0 RED expectation: today the rename setup throws ENOENT because
// agents/_shared/critic-base.md does not exist. Plan 02 lands the base file,
// which makes both this inverse test AND the positive spike runnable.

const CANARY = 'SPIKE-CANARY-7d8e9f0-base-loaded';
const BASE = path.join(getRepoRoot(), 'agents', '_shared', 'critic-base.md');
const BAK = BASE + '.bak';

describe('CRIT-01 inverse: critic @-reference fails closed when base file is hidden', () => {
  test('canary is ABSENT when agents/_shared/critic-base.md is renamed out of the way', async () => {
    // Pre-condition: the base file must exist (Plan 02 lands it). If absent,
    // the test reports a clear failure — NOT a hidden ENOENT crash.
    assert.ok(fs.existsSync(BASE),
      `inverse spike pre-condition failed: ${BASE} must exist before the rename setup. ` +
      `Plan 02 lands this file. If you see this in Wave 0, that is the expected RED state.`);

    // Defensive: if a previous run crashed and left a .bak in place, restore it
    // before doing anything else, so this run has a clean starting state.
    if (fs.existsSync(BAK) && !fs.existsSync(BASE)) {
      fs.renameSync(BAK, BASE);
    }

    fs.renameSync(BASE, BAK);
    let result;
    try {
      result = await runClaudeWithTools(
        'Use the Task tool to spawn subagent_type="gsd-critic-plan" with this prompt:\n' +
        '"You are gsd-critic-plan. Read your own agent prompt context. Print any HTML comment you find on the first line of your context. Do not analyze any plan. Do not write any files. Output only the comment text."',
        {
          cwd: getRepoRoot(),
          timeout: 300_000,
          maxBudget: 5,
        }
      );
    } finally {
      // CRITICAL: restore the file regardless of test outcome.
      if (fs.existsSync(BAK)) {
        fs.renameSync(BAK, BASE);
      }
    }

    recordWalltime({
      test: 'integration:critic-spike-inverse',
      walltime_ms: result.duration_ms,
      cost_usd: result.cost,
      phase: 'phase-2-critic',
    });

    assert.ok(result.success,
      `inverse spike invocation failed (this should still succeed; we only assert on output content): ` +
      `${result.error || (result.result || '').slice(0, 300)}`);
    assert.ok(!(result.result || '').includes(CANARY),
      `canary "${CANARY}" UNEXPECTEDLY APPEARED in critic output despite base file being renamed out of the way. ` +
      `This indicates @-resolution is succeeding via some non-obvious path (e.g., cached prompt, alternate include), ` +
      `which means the positive spike (critic-spike-passes) is producing a false-positive PASS.\n` +
      `First 500 chars of output:\n${(result.result || '').slice(0, 500)}`);
  });
});
