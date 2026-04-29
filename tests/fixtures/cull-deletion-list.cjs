'use strict';

/**
 * Source of truth for Phase 1 cull (TEST-01).
 *
 * Read by tests/cull-no-orphan-references.test.cjs (orphan-reference scan)
 * and tests/migration-table-present.test.cjs (Plan 09 — CULL-07).
 *
 * Locked by .planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-CONTEXT.md `<decisions>` (including disambiguations D-01..D-04).
 * Do NOT edit without re-running /gsd-discuss-phase.
 */

module.exports = {
  // 49 commands deleted outright (no consolidation target).
  // NOTE: 'review' is in this list because the OLD /gsd-review (git/PR helper) is being
  // removed. Per CONTEXT.md D-01, the NEW /gsd-review is the consolidated quality-gate
  // entry point and must NOT be treated as an orphan reference — see slashMentionExcludes.
  deletedCommands: [
    // audit/diagnostic (9)
    'audit-fix', 'audit-uat', 'forensics', 'health', 'stats', 'scan',
    'intel', 'map-codebase', 'graphify',
    // specialty phases (8)
    'ai-integration-phase', 'ui-phase', 'ui-review', 'eval-review',
    'spike', 'sketch', 'spike-wrap-up', 'sketch-wrap-up',
    // debug/explore (2)
    'debug', 'explore',
    // idea capture (5)
    'note', 'plant-seed', 'add-backlog', 'thread', 'review-backlog',
    // milestone extras (5)
    'audit-milestone', 'plan-milestone-gaps', 'milestone-summary',
    'archive-project', 'restore-project',
    // git/PR extras (4)
    'ship', 'undo', 'inbox', 'review',
    // process control (6)
    'manager', 'autonomous', 'fast', 'do', 'next', 'session-report',
    // phase manip extras (4)
    'spec-phase', 'import', 'ultraplan-phase', 'list-phase-assumptions',
    // docs (2)
    'docs-update', 'ingest-docs',
    // misc (4)
    'from-gsd2', 'add-tests', 'analyze-dependencies', 'cleanup',
  ],

  // 9 commands consolidated. The OLD names should not appear except in
  // (a) deprecation stub files (allowed) and (b) migration table
  // (allowed in CHANGELOG.md and commands/gsd/help.md).
  consolidatedCommands: {
    'code-review':                'gsd-review --code',
    'code-review-fix':            'gsd-review --code-fix',
    'secure-phase':               'gsd-review --security',
    'validate-phase':             'gsd-review --coverage',
    'critique':                   'gsd-review --critique',
    'plan-review-convergence':    'gsd-review --converge',
    'add-phase':                  'gsd-phase add',
    'insert-phase':               'gsd-phase insert',
    'remove-phase':               'gsd-phase remove',
  },

  // The 6 quality-gate deprecation stubs (CULL-05). These files KEEP existing
  // their old names but become deprecation stubs — the orphan-reference test
  // ALLOW-LISTS them so they may legitimately mention their own old name.
  deprecationStubs: [
    'commands/gsd/code-review.md',
    'commands/gsd/code-review-fix.md',
    'commands/gsd/secure-phase.md',
    'commands/gsd/validate-phase.md',
    'commands/gsd/critique.md',
    'commands/gsd/plan-review-convergence.md',
  ],

  // Per CONTEXT.md D-01 (LOCKED): names that ARE in deletedCommands but should
  // be excluded from the slash-mention scan because the same name is reused by
  // a consolidated command (different functionality, same name). The
  // file-deletion check still uses the full deletedCommands list — only the
  // slash-mention scanner consults this carve-out.
  //
  // For Phase 1, this is exactly: ['review']. The OLD /gsd-review (git/PR
  // helper) is removed; the NEW /gsd-review (consolidated quality-gate) is
  // added in Plan 07. Slash-mentions like `/gsd-review --security` in surviving
  // prose, deprecation stubs, migration tables, and the consolidated workflow
  // file MUST NOT be flagged as orphan references.
  slashMentionExcludes: ['review'],

  // 17 agents deleted outright. gsd-research-synthesizer is NOT in this list
  // (it survives Phase 1 untouched; merged-then-deleted in Phase 3).
  deletedAgents: [
    'gsd-debugger', 'gsd-debug-session-manager',
    'gsd-doc-writer', 'gsd-doc-classifier', 'gsd-doc-synthesizer', 'gsd-doc-verifier',
    'gsd-domain-researcher', 'gsd-eval-auditor', 'gsd-eval-planner',
    'gsd-framework-selector', 'gsd-ai-researcher',
    'gsd-ui-auditor', 'gsd-ui-checker', 'gsd-ui-researcher',
    'gsd-codebase-mapper', 'gsd-intel-updater',
    'gsd-nyquist-auditor',
  ],

  // Surviving roster — for reverse-checking and CULL-01/02/08 enforcement.
  // Per CONTEXT.md D-02: 37 user-facing commands (NOT counting the 6 deprecation
  // stubs); 22 agents.
  survivingCommandCount: 37,
  survivingAgentCount: 22,
};
