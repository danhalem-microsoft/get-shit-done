---
project: gsd-slim-and-integrate
last_updated: 2026-05-04
---

# Requirements

## Active Requirements

Active requirements are tracked per-phase in the phase PLAN.md frontmatter
`requirements:` arrays and per-PROJECT in the umbrella spec. This file is the
landing site for Future Requirements that have been deferred from the
in-flight milestone but need a permanent tracking record so future planning
passes can promote them.

## Future Requirements (Phase 7+, deferred)

- Multi-runtime install verification for `agents/_shared/` — Phase 2's
  `tests/install-shared-dir.test.cjs` covers the Claude runtime only.
  Verifying that `bin/install.js` correctly copies and manifests the shared
  agent fragments under all 11 supported runtimes (Codex, Cursor, Cline,
  Windsurf, Augment, Gemini, OpenCode, Kilo, Antigravity, Trae, Qwen) is
  deferred per Phase 2 RESEARCH §Open-Q-4. See 02-REVIEWS.md §H3
  (scope-H-002) for the tracking record.
