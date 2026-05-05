---
phase: 02-critic-refactor-with-commit-0-spike
plan: 05
subsystem: agents/critics
tags: [bulk-trim, lens-addendum, CRIT-03, CRIT-04, CRIT-05, H9-Jaccard]

requires:
  - agents/_shared/critic-base.md (Plan 02-02 — CRIT-02 base prompt, 120 lines)
  - agents/gsd-critic-strategy.md (Plan 02-04 pilot — proven 54-line lens-addendum shape)
  - tests/critic-line-budget.test.cjs (Plan 02-01 — CRIT-02/03/04 + reachability)
  - tests/critic-no-base-shadowing.test.cjs (Plan 02-01 — CRIT-05 tag-name scan + H9 Jaccard)
provides:
  - agents/gsd-critic-plan.md (53-line lens addendum)
  - agents/gsd-critic-code.md (59-line lens addendum — biggest pre-cut at 5.8× compression)
  - agents/gsd-critic-scope.md (55-line lens addendum)
  - agents/gsd-critic-verify.md (58-line lens addendum)
  - agents/gsd-critic-discuss.md (60-line lens addendum)
  - 5 finalized <{lens}_specific_checklist> tag names (consumed by Plan 02-06 workflows/critique.md Task prompts)
affects:
  - Plan 02-06 (workflows/critique.md authors Task prompts; depends_on includes Plan 05 for tag-name finalization — B4 cascade)
  - Plan 02-07 (CRIT-10 N=5 parity test will validate behavioral preservation across all 6 trimmed critics)

tech-stack:
  added: []
  patterns:
    - "first non-frontmatter line = @-import to agents/_shared/critic-base.md (uniform across all 6 critics)"
    - "addendum body = exactly <lens> + <{lens}_specific_checklist> + <{lens}_calibration_examples>"
    - "calibration examples in lens-specific prose (avoids H9 Jaccard ≥0.80 vs base)"
    - "code-critic preserves cross-artifact contradiction lane (P1 plan-vs-code, P2 context-vs-code, P3 summary-vs-code, P4 verify-vs-code) + deviation-exemption logic — its lens-unique surface"

key-files:
  created: []
  modified:
    - agents/gsd-critic-plan.md (299 → 53 lines, -246)
    - agents/gsd-critic-code.md (341 → 59 lines, -282)
    - agents/gsd-critic-scope.md (263 → 55 lines, -208)
    - agents/gsd-critic-verify.md (271 → 58 lines, -213)
    - agents/gsd-critic-discuss.md (301 → 60 lines, -241)

decisions:
  - "All 5 critics landed in 53–60 lines, well below the 60–90 RESEARCH band but above the 50-line floor of strategy. Driver: each lens, after dropping base-owned content, has 6–8 critical-tier and 6–10 warning-tier checklist items; that lands consistently in the 50s. The pilot's 54-line outcome was not an outlier — it was the natural shape."
  - "Code critic preserved the cross-artifact contradiction surface as inline critical-tier checklist items rather than a separate <cross_artifact_detection> section. Rationale: the previous separate section caused confusion about whether cross-artifact was 'lens' or 'role', and the trim makes it explicit that contradiction-detection IS code-critic's lens. The four priorities (P1 plan-vs-code, P2 context-vs-code, P3 summary-vs-code, P4 verify-vs-code) are kept; the deviation-exemption rule (`Deviation documented: Yes/No`) is captured in the <lens> block."
  - "Skipped the optional pilot parity (Step E from Plan 04) for the same reason as the pilot: parity infra is owned by Plan 07. CRIT-10 N=5 parity test in Plan 07 will provide stronger evidence than single-run inspection across 6 critics."

metrics:
  duration: ~22 minutes
  completed: 2026-05-05T16:17:30Z
  tasks_completed: 3
  files_changed: 5
  lines_removed: 1190
  lines_added: 176
---

# Phase 02 Plan 05: Bulk trim of 5 remaining critics — Summary

Applied the Plan 02-04 pilot pattern across the remaining 5 critics. Each trimmed from 263–341 source lines down to 53–60 lines, leaving exactly the lens-unique surface: `<lens>` + `<{lens}_specific_checklist>` + `<{lens}_calibration_examples>`, prefixed with the canonical `@`-import to `agents/_shared/critic-base.md`. All four `tests/critic-line-budget.test.cjs` sub-tests AND both `tests/critic-no-base-shadowing.test.cjs` sub-tests are GREEN across all 6 critics.

## Final Per-Critic Line Counts

| File | Pre-trim | Post-trim | Δ | Compression ratio |
|------|---------:|----------:|---:|------------------:|
| `agents/_shared/critic-base.md` | n/a | 120 | n/a | base file (Plan 02-02) |
| `agents/gsd-critic-strategy.md` | 54  | 54 | 0 | unchanged (Plan 02-04 pilot) |
| `agents/gsd-critic-plan.md`     | 299 | 53 | −246 | 5.6× |
| `agents/gsd-critic-code.md`     | 341 | 59 | −282 | 5.8× (biggest cut) |
| `agents/gsd-critic-scope.md`    | 263 | 55 | −208 | 4.8× |
| `agents/gsd-critic-verify.md`   | 271 | 58 | −213 | 4.7× |
| `agents/gsd-critic-discuss.md`  | 301 | 60 | −241 | 5.0× |
| **Aggregate (base + 6 critics)** | **1731** | **459** | **−1272** | **3.8× overall (73.5% reduction)** |

459 lines vs 700-line cap = 241 lines of headroom. All critics land in 53–60 lines, a tighter clustering than the 60–90 RESEARCH target band — see Decision 1 above.

## Per-Critic Keep-Lists (Critical-tier surface)

The lens-unique critical-tier items that survived. These are what Plan 07's CRIT-10 parity test must confirm are still being caught.

### gsd-critic-plan.md (6 critical, 6 warning, 2 info)

**Critical:** requirement coverage complete; no contradiction with locked CONTEXT.md decisions; dependencies acyclic and valid; deferred ideas not included; no dead-code tasks; task `<files>` paths exist or are created.

**Warning:** task action specificity; scope within budget; must_haves.truths user-observable; must_haves.key_links cover wiring; verify blocks runnable; done criteria measurable.

**Info:** parallelization opportunities; task granularity for atomic commits.

### gsd-critic-code.md (7 critical, 10 warning, 3 info)

**Critical:** no security vulnerabilities (OWASP Top 10 + CWE); no unhandled error paths; no data-corruption paths; no resource leaks; no circular dependencies; **plan-vs-code (P1)**; **context-vs-code (P2)**.

**Warning:** tests cover happy + error paths; CONVENTIONS.md adherence; no empty/silent catch blocks; type-safety drift; TODO/FIXME/HACK markers; floating promises; magic numbers / deeply nested conditionals; performance hot-paths without measurement; **summary-vs-code (P3)**; **verify-vs-code (P4)**.

**Info:** reuse opportunities; minor naming/structure drift (cross-artifact); documentation gaps.

The cross-artifact lane (P1–P4) + deviation-exemption rule (`Deviation documented: Yes/No`) is the unique value of code-critic. It is preserved as critical-tier (P1, P2) and warning-tier (P3, P4) items inline in the checklist, with the rule itself stated in `<lens>`.

### gsd-critic-scope.md (5 critical, 6 warning, 3 info)

**Critical:** deferred-idea reintroduction (with deferral line + violating task line citation); locked-decision violation; cross-phase scope leak; requirement creep without ROADMAP edit; unauthorized technology addition (new package.json/requirements.txt deps not in STACK.md / CONTEXT.md).

**Warning:** "while we're here" additions; hidden assumptions in task actions; optimism in scope estimate; requirement drift from REQUIREMENTS.md; phase-dependency chain length > 2; success criteria exceed planned work.

**Info:** scope-reduction opportunities; deferral candidates; roadmap consistency observations.

### gsd-critic-verify.md (6 critical, 8 warning, 3 info)

**Critical:** must_have not verified; VERIFICATION.md claim contradicted by disk; no-op assertions creating false confidence; green-washing tests (mocks for SUT, error-suppression); SUMMARY.md claim unbacked by code (≥3 spot-checks); evidence-of-test absent (verify exited 0 but didn't exercise the behavior).

**Warning:** manual-only checks with CLI alternatives; vague verify command; verification method mismatch; missing artifact-existence check (disk-flush race); anti-pattern markers in claimed-complete code; test isolation gaps; key_links not verified; opaque test names.

**Info:** additional edge cases; VERIFICATION.md evidence specificity; test organization.

### gsd-critic-discuss.md (7 critical, 8 warning, 4 info)

**Critical:** decision lacks rationale; decision contradicts another locked decision; ambiguous locked decision; missing requirement coverage (no decision OR explicit deferral); "Claude's Discretion" item that should be locked; missing error/failure-mode discussion (OWASP Secure Coding Practices); critical-dependency integration decisions absent.

**Warning:** vague Claude's-Discretion delegation; deferred item without rationale; decision incomplete (WHAT without HOW-much-context); phase boundary ambiguity; missing edge-case discussion; implicit assumption; missing success indicator; thin evidence on a non-trivial decision.

**Info:** stylistic inconsistency; redundant decision; missing reference/link; overly specific implementation detail.

## Universal "Dropped" Items (Now owned by base)

Across all 5 critics, the same base-owned content was removed. Per Plan 02-04's load-bearing finding, the universal H9 Jaccard offender was the base `<role>` paragraph at lines 6–18 ("You are an adversarial GSD critic..."). Dropping it eliminated all H9 violations without further work.

| Section | Source-of-truth in base |
|---------|-------------------------|
| `<role>` framing — adversarial-critic stance, primary/cross-flag tone, "tough code reviewer" tone | base `<role>` (lines 6–18) |
| `<context_loading>` 3-tier loading hierarchy | base `<context_loading>` (lines 20–31) — lens-specific "Primary input" line in `<lens>` replaces it |
| `<finding_format>` — finding card schema, REJECT criteria, file:line requirement | base `<finding_format>` + `<evidence_requirements>` |
| `<cross_flag_rules>` — 30% cross-flag cap, thin-evidence default to info | base `<cross_flag_rules>` |
| `<output>` (CRITIQUE-{lens}.md generation procedure, frontmatter schema) | base `<output_contract>` (with post-write verify) |
| `<anti_patterns>` — generic "DO NOT produce findings without evidence" / "DO NOT miscalibrate severity" / "DO NOT cross-lane overreach" | base `<role>` (philosophy + cross-flag) + base `<severity_rubric>` |
| `<success_criteria>` — generic CRITIQUE.md correctness contract | base `<success_criteria>` |

## Transformations (Lens-Specific Content That Survived in New Locations)

- **Old `<role>` Good/Bad examples** → moved to `<{lens}_calibration_examples>` and rewritten in lens-specific vocabulary to avoid H9 Jaccard against base prose.
- **code-critic `<cross_artifact_detection>` section** (originally a separate ~70-line section unique to code-critic) → folded into `<code_specific_checklist>` as 4 critical/warning items (P1–P4) with the deviation-exemption rule stated in `<lens>`. The rationale, side-by-side evidence format, and 2-pass strategy are not lost — they are now expressed via the calibration example (P1 example shows the side-by-side `Plan says / Code shows / Deviation documented: No` format) plus the explicit rule in `<lens>`.
- **discuss-critic locked-vs-discretion calibration** → captured via the new critical-tier item "Claude's Discretion item that should be locked" + the warning-tier "vague Claude's-Discretion delegation".
- **scope-critic enforcement posture** ("scope creep is the #1 project killer; be the guardrail that doesn't bend") → moved into `<lens>` as a posture sentence rather than a standalone philosophy block.
- **verify-critic audit posture** ("verify the verifier; audit the auditor; test the tests") → similarly moved into `<lens>`.

## Base-Shadowing Test Outcomes (CRIT-05)

Both sub-tests of `tests/critic-no-base-shadowing.test.cjs` are CLEAN for all 6 critics:

| Sub-test | Behavior | Result across 6 critics |
|----------|----------|-------------------------|
| 1 — tag-name scan | Reject any addendum XML tag that also appears in `critic-base.md`, except `<lens>` and `<*_specific_checklist>` / `<*_calibration_examples>`. | Zero violations. |
| 2 — H9 Jaccard 5-line window scan | Reject any 5-line non-blank window with ≥ 0.80 Jaccard token overlap with any base 5-line window. | Zero violations. |

### How H9 violations were avoided

For each critic the previous offender was the duplicated `<role>` paragraph at base lines 6–18. Dropping that paragraph in the trim eliminated the violation without further work (matches the pilot's finding). New `<lens>` prose was written with lens-specific vocabulary (e.g., "milestone" / "ROADMAP" / "cumulative drift" for strategy; "deferred-idea reintroduction" / "while-we're-here" for scope; "verify the verifier" / "green-washing tests" for verify; "WHAT and WHY decisions" / "Claude's Discretion" for discuss; "cross-artifact contradiction lane" / "deviation-exemption" for code; "task action specificity" / "must_haves derivation" for plan) — none of which appear as base prose. The Jaccard scan saw no near-match.

## Plan 06 Tag-Name Confirmation (B4 Dependency)

The 5 finalized `<{lens}_specific_checklist>` tag names are exactly the names Plan 02-06 will reference in its `workflows/critique.md` Task prompts:

| Critic | Tag name |
|--------|----------|
| `gsd-critic-plan.md`     | `<plan_specific_checklist>` |
| `gsd-critic-code.md`     | `<code_specific_checklist>` |
| `gsd-critic-scope.md`    | `<scope_specific_checklist>` |
| `gsd-critic-verify.md`   | `<verify_specific_checklist>` |
| `gsd-critic-discuss.md`  | `<discuss_specific_checklist>` |

(Plan 02-04 already finalized `<strategy_specific_checklist>` for the 6th critic.)

These match the pattern declared in 02-05-PLAN.md `must_haves.key_links` and the `<interfaces>` table at lines 117–124. Plan 06's `depends_on: [1, 2, 3, 4, 5]` resolves cleanly — no rename needed.

## Base-prompt adjustments needed: NONE

The base prompt at `agents/_shared/critic-base.md` (committed in Plan 02-02) supports all 5 newly-trimmed lenses cleanly without any tweaks. Specifically:

- `<context_loading>` references `<{lens}_specific_checklist>` generically — every lens's specific input list is communicated through the `<lens>` "Primary input" line.
- `<severity_rubric>` (critical / warning / info with "Ship It?" calibration) covers all 6 lens domains: requirement coverage (plan), security/correctness (code), boundary violation (scope), false-confidence (verify), decision quality (discuss), milestone drift (strategy).
- `<finding_format>` `{lens_prefix}` wildcard accepts `plan-`, `code-`, `scope-`, `verify-`, `discuss-`, `strategy-` cleanly.
- `<output_contract>` post-write verify check (`test -f "${PHASE_DIR}/CRITIQUE-${lens}.md"`) works for every lens.
- `<cross_flag_rules>` 30% cap applies uniformly.

No base-prompt amendment is needed for any of the 5 lenses, matching the pilot's outcome for strategy.

## Deviations from Plan

None — plan executed as written. All three tasks (1, 2a, 2b) completed in sequence with the proven template applied. Optional pilot parity (S4) was not triggered because Plan 05 didn't include it as a step (it was a Plan 04 pilot-only option).

## Threat Flags

None. The trim only restructured existing critic prompts; no new network endpoints, auth paths, file access patterns, or trust-boundary surfaces.

## Self-Check: PASSED

- [x] `agents/gsd-critic-plan.md` exists at 53 lines (≤ 100).
- [x] `agents/gsd-critic-code.md` exists at 59 lines (≤ 100).
- [x] `agents/gsd-critic-scope.md` exists at 55 lines (≤ 100).
- [x] `agents/gsd-critic-verify.md` exists at 58 lines (≤ 100).
- [x] `agents/gsd-critic-discuss.md` exists at 60 lines (≤ 100).
- [x] All 5 critics begin (post-frontmatter) with the canonical `@~/.claude/get-shit-done/agents/_shared/critic-base.md` line.
- [x] Each critic's body contains exactly `<lens>`, `<{lens}_specific_checklist>`, `<{lens}_calibration_examples>` — no other XML tags.
- [x] No forbidden base-shadowing tags in any of the 5 critics — `grep -cE "<role>\|<severity_rubric>\|<finding_format>\|<cross_flag_rules>\|<evidence_requirements>\|<output_contract>\|<success_criteria>\|<context_loading>"` returns 0 for each.
- [x] Aggregate `wc -l agents/_shared/critic-base.md agents/gsd-critic-*.md | tail -1` = 459 (≤ 700).
- [x] `node --test tests/critic-line-budget.test.cjs` exits 0 — all 4 sub-tests GREEN (CRIT-02, CRIT-03, CRIT-04, @-import reachability).
- [x] `node --test tests/critic-no-base-shadowing.test.cjs` exits 0 — both sub-tests GREEN (tag-name scan + H9 Jaccard scan) for ALL 6 critics.
- [x] Three task commits exist: 31726570 (plan), 8f3f4f28 (code), f99bad42 (scope/verify/discuss).
