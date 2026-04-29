<purpose>
Consolidated quality-gate review dispatcher. Single entry point for phase code review, security audit, coverage validation, plan critique, and review convergence — replaces six standalone commands. The user-facing command surface (`commands/gsd/review.md`) is consolidated; the per-flag workflow bodies (`code-review.md`, `secure-phase.md`, `validate-phase.md`, `critique.md`, `plan-review-convergence.md`, `code-review-fix.md`) are unchanged in this phase and continue to own their own gates and orchestration.

This is a thin dispatch wrapper. Per `commands/gsd/review.md`, the supplied flag in `$ARGUMENTS` selects exactly one of the six review types; the dispatched workflow runs end-to-end and owns the artifact (REVIEW.md, SECURITY.md, VALIDATION.md, CRITIQUE.md, REVIEWS.md/REVIEW-FIX.md). This wrapper does no review work itself.

Flag → workflow mapping (LOCKED):

- `--code`     → `code-review.md`
- `--code-fix` → `code-review-fix.md`
- `--security` → `secure-phase.md`
- `--coverage` → `validate-phase.md`
- `--critique` → `critique.md`
- `--converge` → `plan-review-convergence.md`
</purpose>

<process>

<step name="parse_flag">
Parse `$ARGUMENTS` for exactly one of the six dispatch flags listed above.

Validation:
- Zero flags supplied → error: `Specify exactly one review type. Flags: --code | --code-fix | --security | --coverage | --critique | --converge.`
- Two or more flags supplied → error: `Specify exactly one review type. Found: <list>.`
</step>

<step name="dispatch">
Strip the dispatched flag from `$ARGUMENTS`, then forward the remaining arguments + the phase identifier to the corresponding workflow file. Execute that workflow end-to-end. Do NOT re-implement review logic in this wrapper.

| Flag        | Dispatched workflow                                                  |
| ----------- | -------------------------------------------------------------------- |
| `--code`    | `@~/.claude/get-shit-done/workflows/code-review.md`                  |
| `--code-fix`| `@~/.claude/get-shit-done/workflows/code-review-fix.md`              |
| `--security`| `@~/.claude/get-shit-done/workflows/secure-phase.md`                 |
| `--coverage`| `@~/.claude/get-shit-done/workflows/validate-phase.md`               |
| `--critique`| `@~/.claude/get-shit-done/workflows/critique.md`                     |
| `--converge`| `@~/.claude/get-shit-done/workflows/plan-review-convergence.md`      |
</step>

</process>

<success_criteria>
- [ ] Exactly one dispatch flag was identified in `$ARGUMENTS`.
- [ ] The corresponding workflow file was executed end-to-end.
- [ ] Remaining arguments + the phase identifier reached the dispatched workflow unchanged.
</success_criteria>
</content>
