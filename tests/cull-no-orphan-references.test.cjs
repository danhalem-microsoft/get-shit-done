'use strict';

/**
 * Orphan-reference enforcement for Phase 1 cull (TEST-01).
 *
 * Reads tests/fixtures/cull-deletion-list.cjs and scans every surviving
 * surface for any mention of a deleted command/agent name across 6 syntactic
 * contexts. The deletion-list fixture is the source of truth.
 *
 * Per CONTEXT.md D-01: slashMentionExcludes (currently ['review']) carves
 * redefined names out of the slash-mention scan. The file-deletion check
 * still uses the full deletedCommands list.
 *
 * Expected to fail RED until Phase 1 cull (Plans 06-08) is complete.
 * Per RESEARCH.md §1.1: this is Phase 1's primary cull-gate test.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const {
  deletedCommands,
  deletedAgents,
  slashMentionExcludes,
} = require('./fixtures/cull-deletion-list.cjs');

// Per D-01: names in slashMentionExcludes are deleted as files but the same
// name is reused by a consolidated command. The slash-mention scanner must
// skip these names. The set is built once at module load.
const SLASH_EXCLUDE_SET = new Set(slashMentionExcludes || []);

// Allow-list — files where deleted names legitimately appear.
// Per RESEARCH.md §1.1 lines 196-211 + CONTEXT.md D-01 (consolidated /gsd-review
// and /gsd-phase command files + workflow bodies). Keep MINIMAL.
//
// Why these are allow-listed:
//   - cull-deletion-list.cjs / cull-no-orphan-references.test.cjs: source-of-truth + self.
//   - migration-table-present.test.cjs: Plan 09's static test enumerates deleted names.
//   - 6 deprecation stub files: Plan 07 overwrites these in place; they keep their old name.
//   - help.md (commands + workflow): Plan 09 populates the migration table.
//   - CHANGELOG.md: Plan 09 mirrors the migration table.
//   - commands/gsd/review.md + workflows/review.md: per D-01, NEW /gsd-review (consolidated)
//     mentions `--code | --security | ...` flags but its file body does NOT mention OLD
//     /gsd-review by name; allow-listed defensively in case Plan 07 lands prose like
//     "replaces /gsd-code-review" (which is fine — code-review is in deletedCommands but the
//     consolidated file is the legitimate landing site).
//   - commands/gsd/phase.md + workflows/phase.md: same rationale for /gsd-phase consolidation
//     (replaces /gsd-add-phase, /gsd-insert-phase, /gsd-remove-phase).
const ALLOW_LIST = new Set([
  'tests/fixtures/cull-deletion-list.cjs',
  'tests/cull-no-orphan-references.test.cjs',  // self-reference (this file)
  'tests/migration-table-present.test.cjs',     // Plan 09 will add this; allow now
  // The 6 deprecation stubs (Plan 07 will overwrite these in place):
  'commands/gsd/secure-phase.md',
  'commands/gsd/validate-phase.md',
  'commands/gsd/code-review.md',
  'commands/gsd/code-review-fix.md',
  'commands/gsd/critique.md',
  'commands/gsd/plan-review-convergence.md',
  // Migration tables (Plan 09 will populate):
  'commands/gsd/help.md',
  'get-shit-done/workflows/help.md',
  'CHANGELOG.md',
  // Per D-01: consolidated command files + workflow bodies (Plan 07 creates).
  // These legitimately reference the OLD names they replace via migration prose.
  'commands/gsd/review.md',
  'commands/gsd/phase.md',
  'get-shit-done/workflows/review.md',
  'get-shit-done/workflows/phase.md',
]);

// ALLOW_LIST is exactly 16 entries — do not add more without re-discussion gate.
// (3 test infra + 6 deprecation stubs + 3 migration-table files + 4 consolidated
// command files/workflows = 16 entries.)
// Note: the plan body's arithmetic comment said "17" but the explicit enumeration
// in the plan listed exactly the 16 entries above; preserving the literal list per
// CONTEXT.md D-01 and treating the arithmetic as a plan-level off-by-one (Rule 1).

// 10 scan roots per RESEARCH.md §1.1 lines 180-191. The bin/ entries are
// CRITICAL — the design spec missed them; they hardcode deleted agent names.
const SCAN_ROOTS = [
  'agents',
  'commands/gsd',
  'get-shit-done/workflows',
  'get-shit-done/templates',
  'tests',
  'integration',
  'docs',
  'bin/install.js',                    // single file
  'get-shit-done/bin/lib',              // CRITICAL — model-profiles, intel, docs, init
  'CHANGELOG.md',                       // single file
];

// Skip the .planning/ tree (has its own state, may legitimately mention
// deleted names in historical context).

function* walkFiles(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isFile()) { yield rel; return; }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* walkFiles(path.join(rel, entry.name));
    else if (entry.isFile()) yield path.join(rel, entry.name);
  }
}

function readScannableFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    for (const rel of walkFiles(root)) {
      // Skip binary files and lockfiles
      if (rel.endsWith('.png') || rel.endsWith('.lock') || rel.endsWith('.json.lock')) continue;
      if (ALLOW_LIST.has(rel)) continue;
      files.push(rel);
    }
  }
  return files;
}

// CLI-module sanity check (WARNING-fix per plan-checker): assert that the walk
// reaches the 4 known-stale CLI files in get-shit-done/bin/lib/. Fail-soft —
// emit a stderr warning if absent, but do not fail the test (the test only
// fails on actual orphan findings). This catches a silent skip-the-CLI bug.
function sanityCheckCliCoverage(allFiles) {
  const required = ['model-profiles.cjs', 'intel.cjs', 'docs.cjs', 'init.cjs'];
  const found = required.filter((name) =>
    allFiles.some((f) => f === path.join('get-shit-done/bin/lib', name)));
  if (found.length < required.length) {
    const missing = required.filter((n) => !found.includes(n));
    process.stderr.write(`[cull-no-orphan-references] WARN: SCAN_ROOTS walk did not yield ${missing.join(', ')} from get-shit-done/bin/lib/. CLI-module reference rot may be skipped silently.\n`);
  }
}

// Phase 2 (Plan 03 of phase 02-critic-refactor) per Phase 1 RESEARCH §5.6
// explicit handoff: also scan agents/_shared/*.md alongside agents/gsd-*.md.
// The recursive walkFiles('agents') already descends into _shared/ today;
// this explicit assertion locks that coverage so a future refactor of
// walkFiles (e.g. adding a "skip dot-prefixed dirs" filter) cannot silently
// drop _shared/ from scope. Hard-fails if the walk misses the dir.
function assertSharedDirCoverage(allFiles) {
  const sharedDir = path.join(ROOT, 'agents', '_shared');
  if (!fs.existsSync(sharedDir)) return; // dir not yet created in some branches; ALLOW soft-skip
  const sharedFiles = fs.readdirSync(sharedDir).filter((f) => f.endsWith('.md'));
  for (const f of sharedFiles) {
    const rel = path.join('agents', '_shared', f);
    if (!allFiles.includes(rel)) {
      throw new Error(
        `[cull-no-orphan-references] Phase 2 §5.6 handoff: SCAN_ROOTS walk missed ` +
        `${rel}. agents/_shared/*.md MUST be scanned for orphan refs to deleted ` +
        `command/agent names.`);
    }
  }
}

// Context 1: @-references resolving to deleted command/agent files.
// Pattern: @<anything>/(commands/gsd/<cmd>.md|agents/<agent>.md)
function scanContext1(rel, content) {
  const findings = [];
  const lines = content.split('\n');
  for (const cmd of deletedCommands) {
    const re = new RegExp(`@[^\\s]*?\\/commands\\/gsd\\/${cmd}\\.md\\b`);
    lines.forEach((line, i) => {
      if (re.test(line)) findings.push(`${rel}:${i+1} (@-ref to deleted command): ${line.trim()}`);
    });
  }
  for (const agent of deletedAgents) {
    const re = new RegExp(`@[^\\s]*?\\/agents\\/${agent}\\.md\\b`);
    lines.forEach((line, i) => {
      if (re.test(line)) findings.push(`${rel}:${i+1} (@-ref to deleted agent): ${line.trim()}`);
    });
  }
  return findings;
}

// Context 2: slash-mentions of deleted commands.
// Per D-01: skip names in SLASH_EXCLUDE_SET (currently ['review']).
// Pattern: /gsd-<cmd> with negative-lookbehind to avoid matching prefixes.
function scanContext2(rel, content) {
  const findings = [];
  const lines = content.split('\n');
  for (const cmd of deletedCommands) {
    if (SLASH_EXCLUDE_SET.has(cmd)) continue;  // D-01 carve-out
    // Order longer names first to avoid sub-name false positives;
    // lookbehind `(?<![A-Za-z0-9_-])` and trailing `\b` with negative-lookahead enforce word boundary.
    const re = new RegExp(`(?<![A-Za-z0-9_-])\\/gsd-${cmd}(?![A-Za-z0-9_-])`);
    lines.forEach((line, i) => {
      if (re.test(line)) findings.push(`${rel}:${i+1} (slash-mention of deleted command): ${line.trim()}`);
    });
  }
  return findings;
}

// Context 3: install-manifest.json walk (parsed, not raw text).
// Per RESEARCH.md §2.5: current manifest is copy-rules, not enumeration.
// This scan still fires if any string value mentions a deleted name (defensive).
function scanContext3() {
  const findings = [];
  const manifestPath = path.join(ROOT, 'install-manifest.json');
  if (!fs.existsSync(manifestPath)) return findings;
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return findings; }
  const walk = (node, pathStr = 'install-manifest.json') => {
    if (typeof node === 'string') {
      for (const cmd of deletedCommands) {
        if (SLASH_EXCLUDE_SET.has(cmd)) continue;  // D-01 carve-out applies here too
        if (node.includes(`/${cmd}.md`) || node === cmd) {
          findings.push(`${pathStr} (manifest string mentions deleted command "${cmd}"): ${node}`);
        }
      }
      for (const agent of deletedAgents) {
        if (node.includes(agent)) {
          findings.push(`${pathStr} (manifest string mentions deleted agent "${agent}"): ${node}`);
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${pathStr}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${pathStr}.${k}`);
    }
  };
  walk(parsed);
  return findings;
}

// Context 4: workflow-markdown cross-references (covered by 1+2 above).
// Context 5: YAML frontmatter `agents:` / `commands:` arrays — string match by deleted name.
function scanContext5(rel, content) {
  if (!content.startsWith('---')) return [];
  const fm = content.split('---')[1] || '';
  const findings = [];
  for (const agent of deletedAgents) {
    // Look for the agent name in frontmatter (e.g., agents: [gsd-debugger])
    const re = new RegExp(`(?<![A-Za-z0-9_-])${agent}(?![A-Za-z0-9_-])`);
    if (re.test(fm)) findings.push(`${rel} (frontmatter mentions deleted agent "${agent}")`);
  }
  for (const cmd of deletedCommands) {
    if (SLASH_EXCLUDE_SET.has(cmd)) continue;  // D-01 carve-out
    const re = new RegExp(`(?<![A-Za-z0-9_-])gsd-${cmd}(?![A-Za-z0-9_-])`);
    if (re.test(fm)) findings.push(`${rel} (frontmatter mentions deleted command "gsd-${cmd}")`);
  }
  return findings;
}

// Context 6: fixture file references — covered by contexts 1+2+5 already.
// (The fixtures themselves are scanned in their text content.)

describe('TEST-01: no orphan references to deleted commands/agents', () => {
  const allFiles = readScannableFiles();
  sanityCheckCliCoverage(allFiles);
  assertSharedDirCoverage(allFiles); // Phase 2 / Plan 03 / RESEARCH §5.6 handoff

  const allFindings = [];
  for (const rel of allFiles) {
    const abs = path.join(ROOT, rel);
    const content = fs.readFileSync(abs, 'utf-8');
    allFindings.push(...scanContext1(rel, content));
    allFindings.push(...scanContext2(rel, content));
    if (rel.endsWith('.md')) allFindings.push(...scanContext5(rel, content));
  }
  allFindings.push(...scanContext3());

  test('zero orphan references across all 6 syntactic contexts and 10 scan roots', () => {
    assert.strictEqual(allFindings.length, 0,
      `Found ${allFindings.length} orphan reference(s):\n  ` + allFindings.join('\n  '));
  });
});

// CR-01 guard (Plan 01-10): ALLOW_LIST is intended for migration-table prose, not
// live command docs. The body of an allow-listed file MUST NOT contain
// `Usage: /gsd-<deleted-command>` patterns — those are live command-reference
// blocks that contradict the migration table at the bottom of the same file.
//
// The migration-table rows themselves use `Removed`/`/gsd-review --…` syntax,
// not `Usage:` syntax — so this regex does not collide with legitimate migration
// prose. The carve-out (`slashMentionExcludes`, currently `['review']`) applies
// here too: the NEW /gsd-review IS a live consolidated command and its Usage
// block is legitimate.
//
// Per CONTEXT.md D-04 (per-test concurrency contract): read-only fs access,
// own-scope locals, no process.chdir, no shared-state mutation.
describe('CR-01 guard: ALLOW_LIST files have no live Usage blocks for deleted commands', () => {
  const cr01Findings = [];
  // Build the carve-out set locally (own-scope, no shared mutation).
  const carveOut = new Set(slashMentionExcludes || []);
  // deletedCommands minus slashMentionExcludes — the set of names whose
  // `Usage: /gsd-<name>` blocks must NOT appear in any allow-listed file body.
  const guardedCommands = deletedCommands.filter((cmd) => !carveOut.has(cmd));

  for (const relPath of ALLOW_LIST) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) continue;  // some allow-listed files may not yet exist (Plan 09 may add them)
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split('\n');
    for (const cmd of guardedCommands) {
      // Match `Usage: /gsd-<cmd>` or `Usage: \`/gsd-<cmd>\`` (backticks optional),
      // with word-boundary at end so `/gsd-do` does not match `/gsd-docs-update`.
      const usageRe = new RegExp(`Usage:\\s*\`?/gsd-${cmd}\\b`, 'g');
      lines.forEach((line, i) => {
        if (usageRe.test(line)) {
          cr01Findings.push(
            `${relPath}:${i + 1} (allow-listed file contains live Usage block for deleted command /gsd-${cmd}): ${line.trim()}`
          );
        }
      });
    }
  }

  test('ALLOW_LIST files have no live Usage blocks for deleted commands (CR-01 guard)', () => {
    assert.deepStrictEqual(cr01Findings, [],
      `ALLOW_LIST is intended for migration-table prose, not live command docs.\n` +
      `Bodies of allow-listed files MUST NOT contain \`Usage: /gsd-<deleted>\` patterns.\n` +
      `The migration-table rows themselves use \`Removed\`/\`/gsd-review --…\` syntax,\n` +
      `not \`Usage:\` syntax — so this regex does not collide with legitimate migration prose.\n\n` +
      `Found ${cr01Findings.length} violation(s):\n  ` + cr01Findings.join('\n  '));
  });
});
