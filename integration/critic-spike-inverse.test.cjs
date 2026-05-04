'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-01 inverse spike — false-positive guard.
//
// 2026-05-04 redesign (per 02-02-SUMMARY.md option B-2 — behavioral canary):
//   This is the inverse counterpart to integration/critic-spike-passes.test.cjs.
//   The positive spike asks the canary-agnostic question "what is your spike
//   canary, in one word?" and asserts the SPIKE-CANARY-CYAN-7d8e9f0 token IS
//   PRESENT in the response (because the SPIKE-PROBE directive in critic-base.md
//   loaded via @-import). This inverse spike asks the SAME question after
//   renaming critic-base.md out of the way — and asserts the token is ABSENT
//   in the response (because the directive never loaded).
//
//   If the inverse PASSES (no token), it confirms the positive spike's PASS
//   was driven by @-resolution and not by some unrelated path (cached prompt,
//   alternate include, hallucination, etc).
//
//   The original B2 canary-agnostic-introspection design produced a symmetric
//   "no canary" reply across positive and inverse — see 02-02-SUMMARY.md
//   Diagnosis. The behavioral-canary redesign breaks that symmetry: positive
//   sees the directive and follows it, inverse sees no directive and answers
//   freely (no canary token in output).
//
// Setup: fs.renameSync(BASE, BASE + '.bak')   // i.e. agents/_shared/critic-base.md.bak
// Run:   spawn gsd-critic-plan with the SAME canary-agnostic question
// Assert: result.success === true AND result.result does NOT include CANARY
// Teardown (try/finally): fs.renameSync(BASE + '.bak', BASE) — ALWAYS, even on
// assertion fail. The .bak file (agents/_shared/critic-base.md.bak) must NEVER
// be left on disk after the test exits — Plan 02 GO/NO-GO checkpoint asserts
// `git status --porcelain agents/_shared/` is clean.
//
// Wave-0 RED expectation: today the rename setup throws ENOENT because
// agents/_shared/critic-base.md does not exist. Plan 02 lands the base file,
// which makes both this inverse test AND the positive spike runnable.

const CANARY = 'SPIKE-CANARY-CYAN-7d8e9f0';
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
        '"what is your spike canary, in one word?"',
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
      `canary "${CANARY}" UNEXPECTEDLY APPEARED in critic output despite agents/_shared/critic-base.md ` +
      `being renamed out of the way. This indicates the SPIKE-PROBE directive loaded into the agent ` +
      `via some non-obvious path (cached prompt, alternate include, hallucination), which means the ` +
      `positive spike (critic-spike-passes) is producing a false-positive PASS.\n` +
      `First 500 chars of output:\n${(result.result || '').slice(0, 500)}`);
  });
});
