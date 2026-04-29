<purpose>
Placeholder for the validate-phase workflow. Plan 07 of the Phase 1 cull replaces this body with the consolidated `/gsd-review --coverage` flag dispatcher; the standalone Nyquist-auditor workflow has been retired.
</purpose>

<process>

This workflow is undergoing consolidation. The Nyquist validation auditor agent has been retired. The functional replacement (test-coverage gating against requirements) is being folded into the consolidated quality-gate command introduced in Plan 07: `/gsd-review --coverage <phase>`.

Until Plan 07 lands, invoking this workflow should:

1. Print: "validate-phase is being consolidated into /gsd-review --coverage. The standalone Nyquist auditor agent has been retired; coverage gating will be re-introduced as a `/gsd-review` flag in the consolidated quality-gate command."
2. Exit cleanly. Do not spawn any agent.

After Plan 07, this file is rewritten to a thin deprecation dispatcher that forwards to `/gsd-review --coverage`.

</process>

<success_criteria>
- [ ] Workflow exits without spawning the retired auditor agent
- [ ] Message clearly redirects users to the upcoming `/gsd-review --coverage` flag
</success_criteria>
