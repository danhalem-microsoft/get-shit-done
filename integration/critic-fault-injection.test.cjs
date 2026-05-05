'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

// CRIT-09: 1-of-N failure injection — orchestrator must skip-and-continue.
// LOCKED to Option-a (bad-subagent-name) per RESEARCH §Open-Q-3, with B5
// pre-condition + 3-part contract.
//
// B7: runs against integration/test-fixtures/fixture-phase-2-critic/, NOT
// Phase 1's .planning/. afterEach scrubs CRITIQUE-*.md residue. If the
// Option-b file-mutation fallback is used, the .bak rename is wrapped in
// try/finally + defensiveRestoreCriticFile to ensure the worktree returns
// clean even on a crash mid-run.

const FIXTURE_DIR = path.resolve(__dirname, 'test-fixtures', 'fixture-phase-2-critic');
const FAULT_LENS = 'discuss';
const REPO_ROOT = getRepoRoot();
const CRITIC_DISCUSS = path.join(REPO_ROOT, 'agents', 'gsd-critic-discuss.md');
const CRITIC_DISCUSS_BAK = CRITIC_DISCUSS + '.bak.fault-injection';

function cleanFixtureCritiques() {
  if (!fs.existsSync(FIXTURE_DIR)) return;
  for (const f of fs.readdirSync(FIXTURE_DIR)) {
    if (/^CRITIQUE.*\.md$/.test(f)) fs.unlinkSync(path.join(FIXTURE_DIR, f));
  }
}

// Defensive: if a previous run crashed mid file-mutation, restore the critic file.
function defensiveRestoreCriticFile() {
  if (fs.existsSync(CRITIC_DISCUSS_BAK) && !fs.existsSync(CRITIC_DISCUSS)) {
    fs.renameSync(CRITIC_DISCUSS_BAK, CRITIC_DISCUSS);
  }
}

describe('CRIT-09: orchestrator skip-and-continue when 1-of-N critic fails (B5 3-part contract)', () => {
  afterEach(() => { cleanFixtureCritiques(); defensiveRestoreCriticFile(); });

  // B5 pre-condition (per 02-REVIEWS.md verify-C-002 / H7):
  // RESEARCH A3 was MEDIUM-confidence about bad-subagent-name producing a
  // detectable error. Verify it. If fails, fall back to Option-b file-mutation
  // in the main test.
  let optionAViable = false;
  test('B5 pre-condition: bad-subagent-name produces a detectable error response shape', async () => {
    defensiveRestoreCriticFile();
    cleanFixtureCritiques();
    const result = await runClaudeWithTools(
      'Use the Task tool to spawn ONE single Task with subagent_type="gsd-critic-DOESNOTEXIST" ' +
      'and prompt="echo test". Do not spawn any other Tasks. Report the result verbatim — ' +
      'including any error message you observe from the Task tool.',
      { cwd: REPO_ROOT, timeout: 120_000, maxBudget: 5 }
    );
    // Heuristic: error is detectable if any of:
    //   - result.success === false with non-empty error
    //   - result.result contains the literal "DOESNOTEXIST" alongside an
    //     error/missing/not-found token
    //   - result.raw indicates a tool error
    const text = (result.result || '').toLowerCase();
    const errorTokens = /(not found|does ?not exist|unknown agent|invalid subagent|error)/i;
    optionAViable =
      (result.success === false && (result.error || '').length > 0) ||
      (errorTokens.test(text) && /doesnotexist/i.test(text));
    process.stdout.write(
      `# B5 pre-condition: Option-a (bad-subagent-name) viable=${optionAViable}\n` +
      `# observed result.success=${result.success}, ` +
      `result.result snippet="${(result.result || '').slice(0, 200).replace(/\n/g, ' ')}"\n`
    );
    // Pre-condition does NOT hard-fail the suite — it determines which
    // mechanism the main test uses.
  });

  test('CRIT-09 main: 3-part contract — orchestrator continues, JSON lists missing, merged has info finding', async () => {
    defensiveRestoreCriticFile();
    cleanFixtureCritiques();

    let mechanismUsed;
    let result;
    try {
      if (optionAViable) {
        // Option-a: bad-subagent-name in the prompt
        mechanismUsed = 'option-a-bad-subagent-name';
        result = await runClaudeWithTools(buildOptionAPrompt(), {
          cwd: REPO_ROOT, timeout: 600_000, maxBudget: 30,
        });
      } else {
        // Option-b fallback: rename agents/gsd-critic-discuss.md → .bak inside try/finally
        mechanismUsed = 'option-b-file-mutation';
        fs.renameSync(CRITIC_DISCUSS, CRITIC_DISCUSS_BAK);
        result = await runClaudeWithTools(buildOptionBPrompt(), {
          cwd: REPO_ROOT, timeout: 600_000, maxBudget: 30,
        });
      }
    } finally {
      // ALWAYS restore in Option-b
      if (fs.existsSync(CRITIC_DISCUSS_BAK)) {
        fs.renameSync(CRITIC_DISCUSS_BAK, CRITIC_DISCUSS);
      }
    }

    recordWalltime({
      test: 'integration:critic-fault-injection',
      walltime_ms: result.duration_ms,
      cost_usd: result.cost,
      phase: 'phase-2-critic',
    });

    process.stdout.write(`# CRIT-09: mechanism used = ${mechanismUsed}\n`);

    // ASSERTION (1) — orchestrator continues
    assert.ok(result.success,
      `[B5 part 1/3] orchestrator must continue when 1 critic errors; ` +
      `got: ${result.error || (result.result || '').slice(0, 300)}`);

    // ASSERTION (2) — critic-aggregate JSON lists `discuss` in critics_missing (NOT trusted from agent text)
    const aggOut = execFileSync('node', [
      path.join(REPO_ROOT, 'get-shit-done', 'bin', 'gsd-tools.cjs'),
      'critic-aggregate',
      '--phase-dir', FIXTURE_DIR,
      '--json',
    ], { cwd: REPO_ROOT, encoding: 'utf-8' });
    const agg = JSON.parse(aggOut);
    assert.ok(Array.isArray(agg.critics_missing) && agg.critics_missing.includes(FAULT_LENS),
      `[B5 part 2/3] critic-aggregate JSON must list "${FAULT_LENS}" in critics_missing; ` +
      `got: ${JSON.stringify(agg.critics_missing)}`);

    // ASSERTION (3) — merged CRITIQUE.md contains info-severity finding for the missing critic
    const mergedPath = path.join(FIXTURE_DIR, 'CRITIQUE.md');
    assert.ok(fs.existsSync(mergedPath),
      `[B5 part 3/3] merged ${mergedPath} not found — orchestrator did not write the merged report`);
    const merged = fs.readFileSync(mergedPath, 'utf-8');
    assert.match(merged, new RegExp(`\\[INFO\\][\\s\\S]*${FAULT_LENS}[\\s\\S]*missing-critic-output`, 'i'),
      `[B5 part 3/3] merged CRITIQUE.md must contain INFO finding citing missing critic ` +
      `"${FAULT_LENS}" with category missing-critic-output`);
  });
});

function buildOptionAPrompt() {
  return `You are testing the GSD critic orchestrator's skip-and-continue behavior (CRIT-09).

Phase dir: ${FIXTURE_DIR}

In a SINGLE assistant message, emit ALL 6 Task() calls in one contiguous block. FIVE of them use the valid critic subagent types; ONE — the ${FAULT_LENS} critic — uses the deliberately bad subagent type \`gsd-critic-DOESNOTEXIST\`:

  Task(subagent_type="gsd-critic-plan",     prompt="Phase dir: ${FIXTURE_DIR}. Run plan-lens critique. Write CRITIQUE-plan.md. Verify file flushed before returning.")
  Task(subagent_type="gsd-critic-code",     prompt="Phase dir: ${FIXTURE_DIR}. Run code-lens critique. Write CRITIQUE-code.md. Verify file flushed before returning.")
  Task(subagent_type="gsd-critic-scope",    prompt="Phase dir: ${FIXTURE_DIR}. Run scope-lens critique. Write CRITIQUE-scope.md. Verify file flushed before returning.")
  Task(subagent_type="gsd-critic-verify",   prompt="Phase dir: ${FIXTURE_DIR}. Run verify-lens critique. Write CRITIQUE-verify.md. Verify file flushed before returning.")
  Task(subagent_type="gsd-critic-DOESNOTEXIST", prompt="Phase dir: ${FIXTURE_DIR}. Run ${FAULT_LENS}-lens critique. Write CRITIQUE-${FAULT_LENS}.md. Verify file flushed before returning.")
  Task(subagent_type="gsd-critic-strategy", prompt="Phase dir: ${FIXTURE_DIR}. Run strategy-lens critique. Write CRITIQUE-strategy.md. Verify file flushed before returning.")

After all 6 Tasks return, follow the workflow's skip-and-continue policy from \`get-shit-done/workflows/critique.md\` Step 5:

1. Run \`gsd-sdk query critic-aggregate --phase-dir ${FIXTURE_DIR} --json\` (or \`node get-shit-done/bin/gsd-tools.cjs critic-aggregate --phase-dir ${FIXTURE_DIR} --json\`) via Bash to get the aggregated JSON.
2. For any critic in the returned \`critics_missing\` array, emit one info-severity finding into the merged CRITIQUE.md at ${FIXTURE_DIR}/CRITIQUE.md, using the EXACT template from the workflow:

   ### [INFO] <critic-name> did not produce CRITIQUE
   **ID:** orchestrator-i-<seq>
   **File:** N/A — orchestrator-level finding
   **Severity:** info
   **Lane:** primary
   **Category:** missing-critic-output
   **Evidence:** Expected \`CRITIQUE-<lens>.md\` not found in phase_dir after the parallel Task batch returned. The aggregator surfaced this critic in \`critics_missing\`.
   **Suggested Fix:** rerun \`/gsd-review --critique <phase>\`.

3. Synthesize the per-critic findings (from each file in JSON \`files[]\`) into ${FIXTURE_DIR}/CRITIQUE.md with combined YAML frontmatter (sum of severity_counts, derived status) and a body grouped first by severity then by critic. Append the missing-critic info findings inline.
4. Print a human-readable summary to stdout.

Do NOT halt the workflow when a Task fails — that is the explicit skip-and-continue policy this test verifies.`;
}

function buildOptionBPrompt() {
  // Fallback: agents/gsd-critic-discuss.md is renamed out of the way; the
  // orchestrator attempts to spawn it normally and Claude Code's resolver
  // returns "not found".
  return `You are testing the GSD critic orchestrator's skip-and-continue behavior (CRIT-09).

Phase dir: ${FIXTURE_DIR}

Run /gsd-review --critique against the fixture phase directory at ${FIXTURE_DIR}. Resolve phase_dir directly to that path (do NOT call gsd-sdk query find-phase). Then proceed per get-shit-done/workflows/critique.md, including all 6 Task() calls in a single contiguous block. The ${FAULT_LENS} critic file has been renamed out of the way for this test — its Task spawn will fail. Per workflow Step 5, run \`gsd-sdk query critic-aggregate --phase-dir ${FIXTURE_DIR} --json\` and emit a missing-critic-output info finding for it; continue and write the merged CRITIQUE.md.`;
}
