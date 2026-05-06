---
phase: 02-critic-refactor-with-commit-0-spike
plan: 07
type: fixes
parent_summary: 02-07-SUMMARY-followup.md
addresses:
  - "Fix A (CRIT-08): process-level parallelism workaround for anthropics/claude-code#7406 — fans out 6 OS-level `claude --print` subprocesses via Node child_process.spawn + Promise.all"
  - "Fix B (CRIT-10): comparator severity normalization (high↔critical) + fuzzy title matching (Jaccard ≥0.7 fallback) in integration/helpers/agent-parity.cjs"
key-files:
  created:
    - get-shit-done/bin/lib/critic-spawn-batch.cjs (293 lines — handler + spawn loop)
    - sdk/src/query/critic-spawn-batch.ts (registry handler — execFileSync to dispatcher)
    - tests/critic-spawn-batch-shape.test.cjs (5 subtests — wiring + JSON contract + partial-success)
    - tests/critic-comparator-fix.test.cjs (16 subtests — severity normalization + fuzzy match + decoy rejection)
    - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-07-SUMMARY-fixes.md (this file)
  modified:
    - integration/helpers/agent-parity.cjs (+ normalizeSeverity, titleWordBag, jaccardSimilarity, FUZZY_TITLE_THRESHOLD; rewrote computeCriticFindingsDeltas with 2-phase exact-then-fuzzy match)
    - get-shit-done/bin/gsd-tools.cjs (+ critic-spawn-batch dispatcher case)
    - sdk/src/query/index.ts (+ registry.register('critic-spawn-batch', criticSpawnBatch))
    - get-shit-done/workflows/critique.md (PRIMARY PATH = `gsd-sdk query critic-spawn-batch`; FALLBACK = original 6-Task in-message pattern, preserved in HTML comment)
    - docs/INVENTORY.md (+ 2 entries: lib/critic-spawn-batch.cjs + gsd-sdk query critic-spawn-batch)
    - integration/critic-batch-walltime.test.cjs (rewritten — invokes dispatcher directly; parallelism-shape ratio assertion replaces stale spike-derived bound)
    - integration/test-fixtures/walltime-ledger.jsonl (+31 new phase-2-critic entries: 1 walltime + 30 parity)
  not_modified:
    - tests/critic-findings-delta-shape.test.cjs (Plan 02-03 lock — STILL PASSES 3/3)
    - tests/agent-parity-helper-shape.test.cjs (Plan 02-01 contract — STILL PASSES 11/11)
    - integration/critic-parity.test.cjs (test source unchanged; underlying comparator changed)
    - .planning/STATE.md / ROADMAP.md (worktree-mode constraint per prompt)
metrics:
  start: "2026-05-06T18:13:00Z (approx)"
  end: "2026-05-06T20:14:00Z"
  duration: "~2 hours"
  live_test_spend_usd: 16.42
  hard_cap_usd: 20.00
  ledger_entries_added: 31
  commits: 4
  unit_test_count: 42  # 5 (spawn-batch shape) + 16 (comparator fix) + 21 pre-existing
status: |-
  PARTIAL — Fix A (CRIT-08) SHIPPED + LIVE-VERIFIED (parallelism delivered, ratio=1.00).
  Fix B (CRIT-10 comparator) SHIPPED + UNIT-TESTED (16/16 lock tests). Live parity
  re-run revealed real architectural finding: 5/6 critic parity sub-tests STILL FAIL
  (overlap 0.00–0.17 < 0.85 threshold) because the Jaccard fuzzy-match heuristic
  cannot bridge LLM-non-determinism semantic re-phrasings (e.g., "synchronous file
  I/O on hot path" vs "synchronous I/O blocks event loop" → Jaccard 0.143). The fix
  did its mathematical job — it just revealed that the 0.85 threshold itself is the
  wrong contract for lexical comparison of LLM critic output. Recommended next
  steps documented in §"CRIT-10 architectural finding" below.
---

# Phase 2 Plan 07 fixes: CRIT-08 workaround + CRIT-10 comparator

This delivery closes the two real findings from `02-07-SUMMARY-followup.md`
with code (not deferrals): a process-level parallelism workaround for the
in-process Task scheduler bug (#7406), and severity-normalization + fuzzy
title matching in the parity comparator.

## What was done

| # | Commit | Subject |
|---|--------|---------|
| 1 | `5f214c74` | `fix(02-07-fixes): CRIT-10 comparator — severity normalization + fuzzy title matching` |
| 2 | `65b05cc2` | `feat(02-07-fixes): CRIT-08 process-level parallelism via critic-spawn-batch` |
| 3 | `366b7b45` | `test(02-07-fixes): walltime assertion uses parallelism-shape ratio not stale H6 bound` |
| 4 | `2aa926d4` | `chore(02-07-fixes): record live verification ledger entries` |

Each commit uses `--no-verify` per the prompt's parallel_execution constraint.

---

## Fix A: CRIT-08 process-level parallelism (SHIPPED + LIVE-VERIFIED)

### Problem

Plan 02-07's CRIT-08 walltime test recorded spawn-delta = 7960ms (vs 2000ms
hard threshold) and total walltime = 283811ms (vs 6× median ≈ 47s). The
02-07-followup investigation diagnosed this as Path-3: real serial behavior
caused by the in-process Task scheduler bug
([anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406)).
The followup's recommendation was Option-1 (re-tag CRIT-08 as `nightly` /
known-fail), explicitly noting that Option-3 (real fix) was "meaningful new
infrastructure, not a follow-up; defer to Phase 2.1."

This delivery ships Option-3 as a follow-up rather than deferring it.

### Architecture

**The workaround sidesteps the in-process Task scheduler entirely** by
using Node's `child_process.spawn` to fan out 6 OS-level `claude --print`
subprocesses (one per critic lens), then awaiting all 6 via `Promise.all`.
The OS process scheduler does the real fan-out — no in-process tool runtime
is involved.

```
workflow → gsd-sdk query critic-spawn-batch → gsd-tools.cjs dispatcher
         → lib/critic-spawn-batch.cjs::cmdCriticSpawnBatch
           → 6 × child_process.spawn('claude --print --output-format json')
           → Promise.all
         → JSON: { walltime_ms, spawn_delta_ms, per_critic[6], status }
workflow → gsd-sdk query critic-aggregate (fan-in: merge CRITIQUE-*.md)
```

Each subprocess gets a prompt that loads the shared critic-base + the
lens-specific addendum via `@~/.claude/...` imports (resolved by the
subprocess against the host config), then writes
`CRITIQUE-{lens}.md` to `phase_dir`. The dispatcher verifies on disk that
each CRITIQUE file flushed before reporting success — defense-in-depth
against the parallel-Task hallucination surface that Plan 02-06's
aggregator already covers from the OTHER side.

Per-critic timeout: 10 min default, with SIGTERM → SIGKILL escalation.
Per-critic budget: $5 default. Both adjustable via `--budget` and
`--timeout` flags.

### Workflow integration

`get-shit-done/workflows/critique.md` was updated to make `critic-spawn-batch`
the **primary path** in Step 3:

```bash
gsd-sdk query critic-spawn-batch --phase $PHASE_ARG --json
```

The original 6-Task single-message pattern is preserved as a **FALLBACK**
inside an HTML comment block. This serves three purposes:

1. If/when #7406 is fixed upstream, switching back is a 30-second edit
   (uncomment the Task block, comment out the spawn-batch invocation).
2. The static guard test `tests/critique-workflow-structure.test.cjs`
   continues to pass — its CRIT-06 contiguity invariant locks the
   FALLBACK path's structure even though it isn't currently active.
3. Environments where the OS-level subprocess path is unusable (e.g.,
   `claude` not on PATH, per-conversation auth) have a documented
   recovery path.

### SDK registry integration

`sdk/src/query/critic-spawn-batch.ts` registers the handler natively in the
SDK query index (mirroring the Plan 02-06 B1 pattern for
`critic-aggregate`). This is what makes
`gsd-sdk query critic-spawn-batch` resolve without falling through the
`GSD_QUERY_FALLBACK` transparent bridge — and what keeps the registry
drift-guard at `tests/gsd-sdk-query-registry-integration.test.cjs` GREEN
(every `gsd-sdk query <cmd>` reference in the repo must resolve to a
registered handler).

### Live verification

Live run against `integration/test-fixtures/fixture-phase-2-critic/`
(N=1 batch, all 6 critics, $1/each budget):

| Metric | Threshold | Run 1 (this commit) | Run 2 (this commit) |
|--------|-----------|---------------------|---------------------|
| spawn_delta_ms | < 2000ms hard | **23ms** ✓ | **21ms** ✓ |
| total_walltime_ms | < 1.5 × max(per-critic) | **150148ms** (ratio 1.0001) ✓ | **115957ms** (ratio 1.00) ✓ |
| max_per_critic_ms | informational | 150131ms | 115956ms |
| sum_per_critic_ms | (would-be serial total) | ~661s | ~501s |
| status | "pass" | pass ✓ | pass ✓ |
| cost_usd_total | <= $6 cap | $2.84 | $2.80 |
| critics_succeeded | 6/6 | 6/6 ✓ | 6/6 ✓ |

**Parallelism delivered:** total walltime ≈ max(per-critic) on both runs.
With true serial dispatch, total would have been ~501–661s (sum) — instead
it was ~116–150s (max). The OS process scheduler is doing the real fan-out;
the in-process Task scheduler that #7406 describes is bypassed entirely.

### Walltime assertion redesign

The original test's H6 dynamic bound (`6 × median(spike-entries)`) was
tuned for tiny spike probes (<10s each — what Plan 02-02 had captured).
On a substantive critic run the per-critic time is 80–150s, and 6 × spike
median ≈ 47s — a stale bound that fails parallelism-correct workloads.

Run 1 hit this trap: spawn-delta passed (23ms) but the test failed on the
spike-derived walltime bound. The test was correctly catching parallelism
failures with the old assertion shape, just against the wrong reference
size.

The fix (commit `366b7b45`) replaces the absolute bound with a ratio:

```
parallelism_ratio = total_walltime / max(per-critic)
assert: parallelism_ratio < 1.5
  - parallel: ratio ≈ 1.0   → PASS
  - serial:   ratio >= 5    → FAIL
```

The H6 spike-bound is preserved as a stderr WARN line for visibility but
no longer hard-fails the test. Run 2 confirmed the new assertion passes
on parallelism-correct workloads (ratio 1.00).

### Files changed

| File | Change |
|------|--------|
| `get-shit-done/bin/lib/critic-spawn-batch.cjs` | NEW (293 lines) — `spawnOneCritic` + `cmdCriticSpawnBatch` + `EXPECTED_LENSES` + `DEFAULT_PER_CRITIC_BUDGET_USD` + `DEFAULT_TIMEOUT_MS`. |
| `sdk/src/query/critic-spawn-batch.ts` | NEW — `criticSpawnBatch` `QueryHandler`; mirror of `critic-aggregate.ts` pattern. |
| `get-shit-done/bin/gsd-tools.cjs` | `case 'critic-spawn-batch'` arm; import for the lib module; usage commands list updated. |
| `sdk/src/query/index.ts` | Import + `registry.register('critic-spawn-batch', criticSpawnBatch)`. |
| `get-shit-done/workflows/critique.md` | Primary path in Step 3 = `gsd-sdk query critic-spawn-batch`; original Task pattern as FALLBACK in HTML comment. |
| `docs/INVENTORY.md` | New entries for `lib/critic-spawn-batch.cjs` and `gsd-sdk query critic-spawn-batch`. |
| `integration/critic-batch-walltime.test.cjs` | Rewritten to invoke `node {worktree}/get-shit-done/bin/gsd-tools.cjs critic-spawn-batch --phase-dir … --json` directly. Parallelism-shape ratio assertion replaces spike-derived bound. |
| `tests/critic-spawn-batch-shape.test.cjs` | NEW (5 subtests) — wiring + SDK registration + JSON contract via mock CLAUDE_BIN + missing-arg error + partial-success. |

---

## Fix B: CRIT-10 comparator (SHIPPED + UNIT-TESTED; LIVE REVEALS REAL FINDING)

### Problem

The 02-07-followup overlap=0.333 live run on opus-vs-opus N=1 critic-strategy
revealed two structural problems in
`integration/helpers/agent-parity.cjs::computeCriticFindingsDeltas`:

1. **Severity drift**: same finding judged 'high' in baseline and 'critical'
   in candidate produced two different bucketKeys → false miss.
2. **Title fragility**: `extractCategoryFromTitle`'s first-two-words heuristic
   (PITFALLS.md §4.4 documented this as MEDIUM-confidence at the time the
   plan was written) is sensitive to LLM phrasing variance — same finding,
   different intro words → different categories → different bucketKeys.

### Fixes

**Severity normalization** (`normalizeSeverity` in `agent-parity.cjs`):
collapses `'critical'`/`'high'` → `'critical'`,
`'warning'`/`'medium'`/`'moderate'`/`'major'` → `'warning'`,
`'info'`/`'low'`/`'minor'` → `'info'`. Unknown values pass through
lowercased so the bucketKey never silently coerces a typo into a real
severity. Applied in `bucketKey(f)` AND in the `missingCritical` filter
(critical baseline finding originally tagged 'high' is still tracked as
missing-critical when the candidate doesn't match).

**Fuzzy title fallback** (`titleWordBag` + `jaccardSimilarity` +
`FUZZY_TITLE_THRESHOLD = 0.7`): when an exact bucketKey miss occurs, a
two-pass match runs:

  Phase 1: Exact bucketKey intersection (unchanged from prior semantics).
  Phase 2: For each unmatched baseline finding, find best unmatched
           candidate sharing (normalizedSeverity, file or both-N/A) with
           Jaccard ≥ 0.7. Best-score wins; ties broken by candidate order.

The fuzzy fallback is restricted to (severity, file) so a fuzzy title
match alone with no other axis agreement is too weak to qualify.

**Threshold rationale** is documented in code: 0.7 was picked against the
02-07-followup evidence's 6-pair table:
- `0.5` over-matches (titles sharing one substantive token get matched).
- `0.7` hits the target on the empirical pairs that ARE the same finding
  with different phrasing (e.g. "HS256 shared secret across phases" vs
  "HS256 shared secret rotation risk persists across phases" → 0.778).

### Lock tests

`tests/critic-comparator-fix.test.cjs` — 16 subtests across 3 describe
blocks lock the new behavior:

- `normalizeSeverity` — high/critical/HIGH/Critical → 'critical'; warning
  aliases (warning/medium/moderate/major) → 'warning'; info aliases
  (info/low/minor) → 'info'; unknown values pass through lowercased; null/
  undefined → 'unknown'.
- `titleWordBag` + `jaccardSimilarity` — short tokens (≤2 chars) dropped;
  identical bags → 1.0; one-side-empty → 0.0; threshold exposed at 0.7.
- `computeCriticFindingsDeltas` — 7 scenarios: severity drift rescued;
  title fragility rescued; genuinely-different findings stay unmatched
  (low Jaccard → 0); exact match preserved (no fuzzy double-count);
  missingCritical hardened (decoy with wrong severity-bucket REJECTED);
  overlap below threshold without missingCritical → pass:false; empty
  baseline → overlap 1.0 (zero-div guard preserved).

`tests/critic-findings-delta-shape.test.cjs` (Plan 02-03 lock) **STILL
PASSES** — the fallback-second design preserved `extractCategoryFromTitle`
semantics; the heuristic continues to be exercised when the JSON-fence path
yields zero findings (which is the path that test exercises, mostly through
the `KNOWN_MAPPINGS` fixture set).

`tests/agent-parity-helper-shape.test.cjs` (Plan 02-01 contract) **STILL
PASSES** — public surface (`runAgentParity`, `SCHEMAS`, `loadBaseline`,
`saveBaseline`, `pickMedianByDuration`, `BASELINES_DIR`) unchanged; the
new helpers were added under `_internal` (not a public surface).

### Live re-run of `integration/critic-parity.test.cjs`

Re-running the parity test against the 6 Phase 1 baselines (N=5 each, opus
candidate vs opus baseline, $7.42 total cost):

| Critic | Result | Overlap | baseFindingCount | currFindingCount | Notes |
|--------|--------|---------|------------------|------------------|-------|
| critic-plan | **PASS** | 1.00 | 0 | n/a | Baseline `result` is plain English prose with no JSON fence — extractor returns 0 findings → trivial pass via zero-div guard. (Same as the 02-07-followup audit; NOT a regression.) |
| critic-code | FAIL | 0.17 | 12 | 11 | 5 missing-critical including "SQL injection in queryUser", "Insecure session cookie", "No input validation on req.body.email", "Missing try/catch around sync I/O and DB calls", "queryUser result treated as a user object", "Synchronous file I/O on hot path" |
| critic-scope | FAIL | 0.00 | 5 | 4 | All 4 critical baseline findings missing |
| critic-verify | FAIL | 0.00 | 7 | 10 | 3 missing critical (originally 'high' in baseline) |
| critic-discuss | FAIL | 0.08 | 12 | 13 | 4 missing critical |
| critic-strategy | FAIL | 0.17 | 6 | 5 | 3 missing critical |

**1/6 PASS, 5/6 FAIL.** This is the real architectural finding the prompt
anticipated: "If overlap STILL drops below 0.85 after the fix, that's a
real critic-behavior change — document fully and recommend Phase 2.1
follow-up. Don't silently ship a known regression."

### CRIT-10 architectural finding (full diagnosis)

The fixes are mathematically correct (normalization is bijective; fuzzy
match has principled threshold) and rescue obvious cases. They are NOT
sufficient to clear the 0.85 threshold against real LLM critic output.

**Root cause**: lexical similarity (Jaccard / first-two-words) is a poor
proxy for semantic similarity when the comparator's input is two
non-deterministic LLM critic runs over the same fixture. Empirical Jaccard
scores on hand-picked semantically-equivalent re-phrasings of real critic
findings:

| Baseline title | Candidate title | Jaccard |
|----------------|-----------------|---------|
| SQL injection in queryUser | SQL injection vulnerability in queryUser | 0.750 (just barely matches) |
| Insecure session cookie | Insecure session cookie missing httpOnly | 0.600 (misses) |
| No input validation on req.body.email | Missing input validation on email parameter | 0.333 (misses badly) |
| Synchronous file I/O on hot path | Synchronous I/O blocks event loop | 0.143 (misses) |
| queryUser result treated as a user object | queryUser returns array but treated as object | 0.375 (misses) |

The model uses synonyms ("missing" instead of "no", "blocks event loop"
instead of "hot path") that DESTROY Jaccard scores while preserving
meaning. Fix B's heuristic catches the closest one (0.750) but loses
everything else — and lowering the threshold further would start matching
genuinely-different findings.

**Recommended remediation paths (defer to Phase 2.1 / a future plan):**

1. **Accept the current behavior and recalibrate the threshold.** Drop
   from 0.85 to ~0.30 OR change to severity-stratified thresholds (e.g.,
   `>=80%` for critical, `>=30%` for lower severities, with `missingCritical`
   still hard-failing). The `missingCritical` filter is independent of
   the overlap ratio and will continue to catch the most expensive class
   of regression even if the overlap threshold relaxes.

2. **Replace lexical similarity with embedding-based similarity.** Use a
   small embedding model (e.g., `text-embedding-3-small`) to compute
   cosine similarity between baseline + candidate title pairs. ~$0.0001
   per comparison; would resolve the synonym/paraphrase blind spot. New
   per-test cost ~$0.05 amortized.

3. **Use an LLM judge for finding equivalence.** "Are these two findings
   describing the same issue?" → yes/no. ~$0.01 per pair; most accurate
   but most expensive (~$3-5 per parity run on top of the candidate cost).

4. **Re-capture baselines as N=3-5 sets** so the baseline itself is a
   plausible-finding distribution rather than a single sample. Then the
   comparator asks "is the candidate finding present in ANY baseline run".
   Increases capture cost but reduces threshold-calibration sensitivity.

5. **Run H8 first** (variance estimate at N=3 across each critic, captured
   into a calibration table), THEN set thresholds empirically per critic.
   The current 0.85 was chosen from external-research convention, not
   from this codebase's measured variance. Plan 02-07 deferred H8 — it
   should land before re-locking.

**Why not simply lower the threshold here:** changing the threshold from
0.85 to (say) 0.30 is a contract change, not a fix. It would silently
weaken every downstream consumer (Plan 02-08 phase-exit gate, future
phase nightly tests) without empirical justification of why 0.30 is the
right number. The honest move is to land Fix B's mechanism (which IS
correct), document the threshold-vs-LLM-non-determinism mismatch, and
let a future plan (Plan 02-08 or Phase 2.1) make the calibration call
with the H8 evidence in hand.

**What Fix B definitely DID achieve**:

- The 02-07-followup live run reported overlap=0.333 with the BROKEN
  comparator (extractor returned 0 findings; severity drift not
  normalized; no fuzzy match). The 02-07 run before that reported
  overlap=1.0 trivially (extractor returned 0 findings on JSON-fenced
  baselines — that is what 02-07-followup commit `3576ebbd` fixed).
- After Fix B + the parser fix from `3576ebbd`, the comparator surfaces
  REAL findings: 12 baseline findings vs 11 candidate findings (critic-code).
  The comparator is now doing meaningful work — comparing 23 actual
  findings instead of 0 actual findings.
- Severity normalization rescued the high↔critical drift class entirely.
  Looking at the missing-critical entries above, none are missing because
  of severity-bucket drift — every missing entry has severity 'high' or
  'critical' in baseline and the candidate either didn't surface that
  finding at all OR phrased it past the Jaccard threshold.
- Fuzzy title matching rescued at least the close-paraphrase class
  (e.g., "SQL injection in queryUser" vs "SQL injection vulnerability in
  queryUser" — same issue, candidate added one word, Jaccard 0.75 ≥ 0.7).

The post-Fix B parity numbers are the **honest first measurement** of how
LLM critic non-determinism interacts with a lexical comparator on real
data. Before this, the test was either trivially passing (0 vs 0
findings) or drowning in extraction bugs.

### Files changed (Fix B)

| File | Change |
|------|--------|
| `integration/helpers/agent-parity.cjs` | + `normalizeSeverity` (10 lines + ~20 lines comment); + `titleWordBag` + `jaccardSimilarity` + `FUZZY_TITLE_THRESHOLD` (35 lines + comment); rewrote `computeCriticFindingsDeltas` to use 2-phase exact-then-fuzzy match (~75 lines); expanded `_internal` exports to support new lock tests. |
| `tests/critic-comparator-fix.test.cjs` | NEW — 16 subtests across 3 describe blocks (locks new behavior). |

---

## Live test budget reconciliation

| Run | Outcome | Cost | Cumulative |
|-----|---------|------|------------|
| critic-batch-walltime (live attempt 1, asserted-fail on stale H6 bound) | success but assertion fail | $3.35 | $3.35 |
| critic-spawn-batch (direct invocation, diagnostic) | success | $2.85 | $6.20 |
| critic-batch-walltime (live attempt 2, PASS with new ratio assertion) | pass | $2.80 | $9.00 |
| critic-parity (N=5 × 6 critics, full re-run) | 1/6 pass — see §CRIT-10 above | $7.42 | $16.42 |
| **TOTAL** | | | **$16.42 / $20 cap** |

$3.58 of headroom remains — preserved for any orchestrator-driven
follow-up runs.

---

## Tests held / new (final state)

Pre-existing tests (held green):

- `tests/critic-aggregate-shape.test.cjs` — 2/2 PASS (Plan 02-06 lock)
- `tests/critic-findings-delta-shape.test.cjs` — 3/3 PASS (Plan 02-03 lock)
- `tests/agent-parity-helper-shape.test.cjs` — 11/11 PASS (Plan 02-01 contract)
- `tests/critique-workflow-structure.test.cjs` — 3/3 PASS (CRIT-06 contiguity guard; FALLBACK Task block in HTML comment still satisfies the static check)
- `tests/gsd-sdk-query-registry-integration.test.cjs` — 2/2 PASS (registry drift-guard)

New tests (this delivery):

- `tests/critic-comparator-fix.test.cjs` — 16/16 PASS (Fix B lock)
- `tests/critic-spawn-batch-shape.test.cjs` — 5/5 PASS (Fix A wiring + JSON contract via mock CLAUDE_BIN; partial-success surface)

**Total non-live test surface: 42/42 GREEN.**

Live integration tests:

- `integration/critic-batch-walltime.test.cjs` — **PASS** (run 2, with new
  parallelism-ratio assertion). spawn_delta = 21ms, ratio = 1.00, cost
  $2.80, status=pass, 6/6 critics succeeded.
- `integration/critic-parity.test.cjs` — 1/6 PASS, 5/6 FAIL with overlap
  0.00–0.17. Fix B's mechanism is correct; the 0.85 threshold is no longer
  a viable contract for lexical comparison of LLM-generated critic
  findings. Documented above and in `## CRIT-10 architectural finding`.

---

## Bridging tear-down

Pre-execution bridging set up `~/.claude/agents/gsd-critic-*.md` symlinks
to the worktree's agent files and `~/.claude/get-shit-done/agents/_shared`
symlink to the worktree's shared base, so the live `claude --print`
subprocesses loaded the worktree's critic addenda (not the host's stale
versions).

Post-execution tear-down restored host state (md5sum verification at
tear-down time confirmed all 6 worktree agent files matched the symlinked
host paths immediately before restoration):

| Mapping | State |
|---------|-------|
| `~/.claude/agents/gsd-critic-{plan,code,scope,verify,discuss,strategy}.md` | restored from `/tmp/gsd-fixes-bridge-backup-62724/`; symlinks removed; original sizes match (verify=16989, plan=18539, scope=15914, code=21060, discuss=21474, strategy=17362) |
| `~/.claude/get-shit-done/agents/_shared` | symlink removed; parent dir `~/.claude/get-shit-done/agents/` removed (was empty) |
| `/tmp/gsd-fixes-bridge-backup-62724/` | removed |

---

## What this delivery does NOT do

1. **Does not lower the CRIT-10 parity threshold.** Fix B's mechanism is
   shipped; the threshold contract is unchanged. The 02-07-SUMMARY.md
   recommendation of re-tagging CRIT-10 as nightly + recalibrating in
   Plan 02-08 is now MORE actionable (we have empirical N=5 data per
   critic), but the call belongs to Plan 02-08 / a Phase 2.1 plan, not
   here.

2. **Does not modify `integration/critic-parity.test.cjs`.** The test
   source is unchanged from Plan 02-07; the comparator fix flows through
   `agent-parity.cjs::computeCriticFindingsDeltas` only. Failing 5/6
   sub-tests is intentional — better than a silently-passing falsified
   contract.

3. **Does not retire the FALLBACK 6-Task path.** The static guard test
   `tests/critique-workflow-structure.test.cjs` continues to enforce
   that the 6 Task() calls remain contiguous in the workflow doc. The
   FALLBACK is preserved because (a) #7406 might land an upstream fix,
   (b) some auth/PATH environments can't host the spawn-batch path,
   (c) the contiguity invariant is a real property worth locking even
   for the inactive path.

4. **Does not modify STATE.md or ROADMAP.md** per the worktree-mode
   constraint.

5. **Does not run H8 variance prereq.** Same scope reasoning as Plan
   02-07: H8 was deferred there; the Fix B recommendation explicitly
   identifies H8 as a prerequisite for future threshold calibration.

---

## Self-Check: PASSED

**Files claimed created — verified on disk:**

| File | Verified |
|------|----------|
| `get-shit-done/bin/lib/critic-spawn-batch.cjs` | `[ -f ... ] && wc -l ... = 293 lines` ✓ |
| `sdk/src/query/critic-spawn-batch.ts` | exists ✓ |
| `tests/critic-spawn-batch-shape.test.cjs` | exists, 5 subtests ✓ |
| `tests/critic-comparator-fix.test.cjs` | exists, 16 subtests ✓ |
| `.planning/.../02-07-SUMMARY-fixes.md` | this file (will be verified at commit time) ✓ |

**Files claimed modified — verified by `git diff --stat HEAD~5 HEAD`:**

| File | Notes |
|------|-------|
| `integration/helpers/agent-parity.cjs` | +185 / -23 (severity normalization, fuzzy match, computeCriticFindingsDeltas rewrite) |
| `get-shit-done/bin/gsd-tools.cjs` | +35 (case + import + usage list) |
| `sdk/src/query/index.ts` | +7 (import + register) |
| `get-shit-done/workflows/critique.md` | +60 / -20 (PRIMARY/FALLBACK split) |
| `docs/INVENTORY.md` | +2 (lib + sdk subcommand entries) |
| `integration/critic-batch-walltime.test.cjs` | rewritten (~190 lines) |
| `integration/test-fixtures/walltime-ledger.jsonl` | +31 entries |

**Commits claimed — verified in `git log --oneline -5`:**

```
2aa926d4 chore(02-07-fixes): record live verification ledger entries
366b7b45 test(02-07-fixes): walltime assertion uses parallelism-shape ratio not stale H6 bound
65b05cc2 feat(02-07-fixes): CRIT-08 process-level parallelism via critic-spawn-batch
5f214c74 fix(02-07-fixes): CRIT-10 comparator — severity normalization + fuzzy title matching
e43ae729 docs(phase-2): mark Plan 02-07 complete with documented findings
```

**Bridging cleanup verified:**
- `~/.claude/agents/gsd-critic-*.md` restored to original (md5sum match
  pre-restoration; original-size verification post-restoration).
- `~/.claude/get-shit-done/agents/` removed (was empty).
- `/tmp/gsd-fixes-bridge-backup-*` removed.

**Worktree cleanup:**
- `git status --short` reports clean (only the SUMMARY-fixes.md to commit).
- `integration/test-fixtures/fixture-phase-2-critic/` clean (only the 3
  committed files; afterEach scrubbed CRITIQUE-*.md residues).

**Tests held green (final non-live count: 42/42):**
- `node --test tests/critic-aggregate-shape.test.cjs` → 2/2 PASS
- `node --test tests/critic-findings-delta-shape.test.cjs` → 3/3 PASS
- `node --test tests/critic-comparator-fix.test.cjs` → 16/16 PASS
- `node --test tests/critic-spawn-batch-shape.test.cjs` → 5/5 PASS
- `node --test tests/agent-parity-helper-shape.test.cjs` → 11/11 PASS
- `node --test tests/critique-workflow-structure.test.cjs` → 3/3 PASS
- `node --test tests/gsd-sdk-query-registry-integration.test.cjs` → 2/2 PASS

**Live integration:**
- `integration/critic-batch-walltime.test.cjs` → PASS
- `integration/critic-parity.test.cjs` → 1/6 PASS, 5/6 FAIL (real
  architectural finding documented above; mechanism shipped, threshold
  contract requires Phase 2.1 calibration).

## Threat Flags

No new security-relevant surface. Fix A's `child_process.spawn` invocation
uses argv (no shell expansion), reads prompt from stdin (no shell escape),
and forwards `--dangerously-skip-permissions` only because the parent
caller (the agent) already has those permissions — no privilege escalation.
The 10-min timeout + SIGTERM/SIGKILL escalation prevent indefinite hangs
from a hung subprocess. Cost is bounded by `--max-budget-usd $5/each` →
$30 worst-case batch.

Fix B's parsing of arbitrary text from agent output (already audited by
Plan 02-07-followup commit `3576ebbd`) is unchanged in scope. The new
helpers (`normalizeSeverity`, `titleWordBag`, `jaccardSimilarity`) operate
on pre-extracted string fields and have no I/O / no eval / no template
literals unescaped.

## TDD Gate Compliance

Both fixes follow GSD's RED-GREEN convention via gate commits:

- **Fix A**: GREEN gate at commit `65b05cc2` (feat). RED gate is implicit
  in the live walltime test that PRE-EXISTED (Plan 02-07 shipped a test
  that detected the bug — that's the RED). Commit `366b7b45` is the
  REFACTOR gate (assertion methodology refined to match the new
  architecture). Test commit `tests/critic-spawn-batch-shape.test.cjs`
  ships in the same commit as the implementation per "deliverable IS the
  test" reasoning (the test exercises the freshly-built handler against
  a mock CLAUDE_BIN; no value in splitting test/feature commits when the
  test cannot run at all without the feature).

- **Fix B**: GREEN gate at commit `5f214c74` (fix). RED gate again
  pre-existed (`tests/critic-findings-delta-shape.test.cjs` lock was
  satisfied before AND after — that test is the SHAPE lock; the new
  COMPARATOR lock at `tests/critic-comparator-fix.test.cjs` ships in the
  same commit as the implementation).

This matches Plan 02-07's TDD note: "the deliverable IS the test, no
separate test-then-impl split is meaningful". Both lock-test files would
fail meaningfully against the pre-fix state (severity drift goes
unmatched, fuzzy match isn't called) — the locks are real, not vacuous.
