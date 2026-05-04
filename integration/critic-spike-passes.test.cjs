'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-01 spike — verify Claude Code's @-reference resolves at Task-spawn time
// for the gsd-critic-plan agent.
//
// 2026-05-04 redesign (per 02-02-SUMMARY.md option B-2 — behavioral canary):
//   The PROMPT is canary-agnostic — the sub-agent is asked the exact literal
//   question "what is your spike canary, in one word?". The CANARY literal
//   appears ONLY in agents/_shared/critic-base.md (inside a SPIKE-PROBE
//   instruction in the <role> block) and in this test file's ASSERTION below.
//   It is NOT present in the prompt that gets sent to the sub-agent.
//
//   If @-import resolution succeeded at Task-spawn time, critic-base.md was
//   loaded and the SPIKE-PROBE directive instructs the agent to emit the
//   canary token in response to the exact-literal question. If @-resolution
//   silently failed, the directive never loaded and the agent responds
//   normally (no token in output). This works because the agent is
//   answering by INSTRUCTION-FOLLOWING, not introspection — its tool grants
//   (Read/Bash/Grep/Glob) don't matter for this probe.
//
//   This replaces the original B2 canary-agnostic-introspection probe, which
//   was structurally unverifiable (the agent has no tool to inspect its own
//   loaded prompt context window — see 02-02-SUMMARY.md Diagnosis section).
//
// Wave-0 RED expectation: until Plan 02 lands critic-base.md with the
// SPIKE-PROBE directive AND inserts the @-import in gsd-critic-plan.md, this
// test fails (sub-agent has no instruction to emit the canary).

const CANARY = 'SPIKE-CANARY-CYAN-7d8e9f0';
// Asymmetry-signal pattern: the SPIKE-PROBE label exists ONLY in
// agents/_shared/critic-base.md (line 17). If @-import resolved at Task spawn,
// the sub-agent's response will reference SPIKE-PROBE (either by emitting the
// strict canary token via rule-following, or by echoing the section label).
// Inverse spike asserts the same pattern is ABSENT when the base file is hidden.
// Per 02-02-SUMMARY-redesign.md: positive runs reliably emit the section label
// "SPIKE-PROBE" even when the strict canary token is not emitted (the model
// treats the directive as something to identify rather than execute). The
// asymmetry between positive and inverse IS the discriminating signal.
const SPIKE_EVIDENCE = /SPIKE-CANARY-CYAN-7d8e9f0|SPIKE-PROBE/;

describe('CRIT-01: critic @-reference resolves at Task spawn (spike — B-2 behavioral canary)', () => {
  test('SPIKE-PROBE directive from agents/_shared/critic-base.md fires in spawned critic output', async () => {
    const result = await runClaudeWithTools(
      'Use the Task tool to spawn subagent_type="gsd-critic-plan" with this prompt:\n' +
      '"what is your spike canary, in one word?"',
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
    assert.ok(SPIKE_EVIDENCE.test(result.result || ''),
      `Neither the strict canary "${CANARY}" nor the SPIKE-PROBE label was found in critic output ` +
      `— @-reference resolution at Task spawn time may have failed.\n` +
      `(B-2 design: both strings live ONLY in critic-base.md SPIKE-PROBE directive; sub-agent ` +
      `is asked the canary-agnostic question "what is your spike canary, in one word?" ` +
      `and answers by following or echoing the directive — no introspection required. ` +
      `The inverse spike confirms this is a discriminating signal by asserting absence after rename.)\n` +
      `First 500 chars of output:\n${(result.result || '').slice(0, 500)}`);
  });
});
