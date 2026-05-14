'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runAgentParity, SCHEMAS } = require('./helpers/agent-parity.cjs');
const { createSandbox } = require('./helpers/claude-runner.cjs');

// CRIT-10 (Phase 2 + Phase 2.1 embedding rebuild): N=5 median, >=85% finding
// overlap by severity-bucketed key + cosine-embedding similarity (D-CTX-03
// threshold 0.80 for the per-finding "same finding" judgement), no missing
// critical, vs Phase 1 baselines. Expensive — ~$25 critic + ~$1 embeddings,
// ~30min — nightly + phase-exit only.
//
// Phase 2.1 (Plan 02.1-02) hooks into this test:
//   - `useEmbeddings: true` opts into the embedding-cosine comparator path
//     (integration/helpers/agent-parity.cjs::computeCriticFindingsDeltasEmbedding).
//   - `cacheBucket: criticName` scopes the per-critic on-disk embedding cache
//     at integration/test-fixtures/baselines/embeddings/<criticName>/<sha>.json
//     (D-CTX-10) — re-runs against the same baseline reuse embeddings, only
//     novel candidate titles pay the API cost.
//   - `phase: 'phase-2.1-crit10'` tags the walltime ledger entry (D-CTX-13).
//   - Failure messages include per-finding diagnosis (D-CTX-12) so the
//     reviewer can see which baseline findings have no semantic match plus
//     the best-candidate cosine score per unmatched finding.
//
// Threshold rationale and cosine↔Jaccard relationship: see
// .planning/users/dan-halem/gsd-slim-and-integrate/phases/02.1-crit10-comparator-rebuild/02.1-CONTEXT.md
// (D-CTX-03) and integration/helpers/agent-parity.cjs `COSINE_TITLE_THRESHOLD`.
//
// B10 (per 02-REVIEWS.md scope-M-001 / plan-H-005 / verify-I-002):
//   Fixture IDs are VERIFIED — read from `ls integration/test-fixtures/baselines/critic-*/`
//   pre-execution and substituted below. loadFixture is called INSIDE each test body
//   (lazy init), so a wrong ID surfaces as a clean per-test failure, not a module crash.
//
// IMPORTANT — naming convention: Phase 1 baselines use the SHORT agent name
// ('critic-plan', not 'gsd-critic-plan'). Per integration/test-fixtures/baselines/_capture.cjs
// the AGENTS list keys baseline directories by the short name, and runAgentParity
// stores baselines via saveBaseline(agentName, ...) → BASELINES_DIR/<agentName>/<fixtureId>.json.
// To find an existing Phase 1 baseline, the agentName argument MUST be the short name.

const N = 5;  // H8 prereq variance estimate not run; using documented default per plan.
const BASELINES_DIR = path.resolve(__dirname, 'test-fixtures', 'baselines');

// B10: VERIFIED at execution time — pre-flight `ls integration/test-fixtures/baselines/critic-*/`
// 2026-05-05:
//   critic-code/      → code-with-smells
//   critic-discuss/   → discuss-with-assumptions
//   critic-plan/      → plan-with-known-issues
//   critic-scope/     → scope-with-creep
//   critic-strategy/  → strategy-with-tradeoffs
//   critic-verify/    → verify-with-gaps
const FIXTURE_IDS = {
  'critic-plan':     'plan-with-known-issues',
  'critic-code':     'code-with-smells',
  'critic-scope':    'scope-with-creep',
  'critic-verify':   'verify-with-gaps',
  'critic-discuss':  'discuss-with-assumptions',
  'critic-strategy': 'strategy-with-tradeoffs',
};

function loadFixture(criticName, fixtureId) {
  // criticName arrives as the short form ('critic-plan'); baselines live under that.
  const inputFile = path.join(BASELINES_DIR, criticName, `${fixtureId}.input.json`);
  if (!fs.existsSync(inputFile)) {
    throw new Error(`baseline input file not found: ${inputFile} (B10: was the fixtureId verified via ls?)`);
  }
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  return { fixtureId, ...input };
}

// Materialize the fixture's sandbox_files into a tmp sandbox so the critic
// has something to read at fixture.cwd. Mirrors integration/test-fixtures/baselines/_capture.cjs.
function materializeSandbox(criticName, fixture) {
  const sandboxPath = createSandbox(`parity-${criticName}-${fixture.fixtureId}`);
  if (fixture.sandbox_files) {
    for (const [relPath, content] of Object.entries(fixture.sandbox_files)) {
      const abs = path.join(sandboxPath, relPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }
  return sandboxPath;
}

for (const [criticName, fixtureId] of Object.entries(FIXTURE_IDS)) {
  test(`CRIT-10: ${criticName} parity (N=${N}, >=85% overlap, no missing critical)`, async () => {
    // B10: lazy init — loadFixture inside test body so a wrong ID fails THIS test cleanly.
    const fixture = loadFixture(criticName, fixtureId);
    const sandboxPath = materializeSandbox(criticName, fixture);

    const result = await runAgentParity(
      criticName,
      { ...fixture, cwd: sandboxPath },
      SCHEMAS['critic-findings'],
      {
        n: N,
        mode: 'compare',
        phase: 'phase-2.1-crit10',  // D-CTX-13 walltime ledger tag (Plan 02.1-02)
        walltimeBudgetMs: 600_000,
        maxCostUsd: 30,
        useEmbeddings: true,         // Plan 02.1-02 — opt into cosine path
        cacheBucket: criticName,     // D-CTX-10 — per-critic embedding disk cache
      }
    );

    // Plan 02.1-02 D-CTX-12: per-finding diagnosis on failure. Lists each
    // baseline finding whose cosine to its best candidate match fell below
    // COSINE_TITLE_THRESHOLD (0.80) — those are the findings the comparator
    // could not semantically match. `cosine === null` means the baseline title
    // had no embedding lookup (typically only happens in the unit-test or
    // fallback path).
    const unmatched = (result.deltas?.perFindingDiagnosis ?? [])
      .filter((d) => d.cosine === null || d.cosine < 0.80)
      .map((d) => `  - baseline=${d.baselineId} bestMatch=${d.bestCandidateId ?? 'NONE'} cosine=${d.cosine === null ? 'N/A' : d.cosine.toFixed(3)}`)
      .join('\n');

    assert.ok(result.pass,
      `parity FAIL for ${criticName}:\n` +
      `  overlap=${result.deltas?.overlap?.toFixed(2) ?? 'n/a'}\n` +
      `  cosineMatches=${result.deltas?.cosineMatchCount ?? 0}\n` +
      `  fuzzyMatches=${result.deltas?.fuzzyMatchCount ?? 0}\n` +
      `  baseFindingCount=${result.deltas?.baseFindingCount ?? 'n/a'}\n` +
      `  currFindingCount=${result.deltas?.currFindingCount ?? 'n/a'}\n` +
      `  missingCritical=${JSON.stringify(result.deltas?.missingCritical ?? [])}\n` +
      `  usedFallback=${result.deltas?.usedFallback ?? false}\n` +
      `  fallbackReason=${result.deltas?.fallbackReason ?? 'n/a'}\n` +
      `  unmatchedBaselineFindings:\n${unmatched || '  (all matched)'}\n`);
  });
}
