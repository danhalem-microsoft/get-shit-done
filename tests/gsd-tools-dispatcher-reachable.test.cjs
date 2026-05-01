'use strict';

/**
 * Structural test (CR-03 guard): every top-level switch case in
 * get-shit-done/bin/gsd-tools.cjs must either (a) be invoked by a
 * surviving caller (agent/command/workflow/SDK source), or (b) be
 * documented in docs/INVENTORY.md under a "CLI Subcommands" section.
 *
 * The SDK (sdk/src/) forwards canonical query commands (e.g.
 * `gsd-sdk query verify-summary`) to gsd-tools.cjs cases either via
 * native handler registration in `sdk/src/query/index.ts` or via
 * subprocess fallback in `sdk/src/gsd-tools.ts`. Therefore SDK source
 * is a legitimate surviving-caller surface and is included below.
 *
 * Per CONTEXT.md D-04: only fs.readFileSync (read-only), local-scope
 * variables, no process.chdir, no shared state.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TOOLS_PATH = path.join(ROOT, 'get-shit-done', 'bin', 'gsd-tools.cjs');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'INVENTORY.md');

// Caller-search roots: surviving surfaces that may invoke gsd-tools.cjs cases.
//
// Includes `sdk/src` because the SDK is the canonical entry point for many
// query/state commands and either registers native handlers under the same
// name OR forwards via subprocess fallback to gsd-tools.cjs (see
// sdk/src/gsd-tools.ts and sdk/src/query/index.ts). A case mentioned by name
// in SDK source is reachable from end-users via `gsd-sdk query <case>`.
const CALLER_ROOTS = [
  'agents',
  'commands/gsd',
  'get-shit-done/workflows',
  'get-shit-done/templates',
  'sdk/src',
];

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

/**
 * Extract top-level switch cases from gsd-tools.cjs.
 *
 * Top-level cases use exactly 4-space indent + `case ` + single-quote.
 * Indented cases (inside nested switches) use 6+ space indent.
 */
function extractTopLevelCases(src) {
  const re = /^ {4}case '([a-z][a-z0-9-]*)':/gm;
  const cases = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    cases.add(m[1]);
  }
  return [...cases];
}

function buildCallerCorpus() {
  const corpus = [];
  for (const root of CALLER_ROOTS) {
    for (const rel of walkFiles(root)) {
      // Skip binaries, lockfiles, and built artifacts (we scan source only)
      if (rel.endsWith('.png') || rel.endsWith('.lock')) continue;
      if (rel.includes('/dist/') || rel.includes('/node_modules/')) continue;
      try {
        corpus.push({ rel, content: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
      } catch { /* skip unreadable */ }
    }
  }
  return corpus;
}

function caseHasCaller(caseName, corpus) {
  // A case is "reachable" if any surviving surface mentions it as an argument
  // to gsd-tools, gsd-sdk, or registers it as a handler name. Patterns the
  // regex must match (all observed in this codebase):
  //
  //   gsd-tools <case>                     -- direct CJS invocation
  //   gsd-tools.cjs <case>
  //   ./bin/gsd-tools <case>
  //   node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" <case>
  //   gsd-sdk query <case>                 -- SDK forwards to dispatcher case
  //   gsd-sdk <case>                       -- shorter SDK form
  //   registry.register('<case>', ...)     -- SDK native handler registration
  //   registry.register('<case>.<sub>', ...) -- SDK dotted alias for case.sub
  //   args[0] === '<case>' / cjs: '<case>' -- SDK gsd-tools subprocess shim & golden table
  //
  // The contract: if any surviving surface names the case in any of these
  // contexts, it is reachable. False positives (incidental mentions) are
  // acceptable; false negatives (missed surviving caller) are NOT — they
  // produce a permanently-failing test.
  //
  // Build several patterns and OR-test them. Anchor each on a recognizable
  // CLI/SDK token so plain prose mentions of the case word do not trigger.
  const escName = caseName.replace(/[-]/g, '\\-');
  const patterns = [
    // gsd-tools / gsd-tools.cjs / bin/gsd-tools — argv-style following
    new RegExp(`\\b(?:[./]?bin/)?gsd-tools(?:\\.cjs)?\\b[^\\n]{0,160}?\\b${escName}\\b`),
    // gsd-sdk query <case> or gsd-sdk <case>
    new RegExp(`\\bgsd-sdk\\b[^\\n]{0,80}?\\b${escName}\\b`),
    // SDK registry.register('<case>', ...) or .register('<case>.subform', ...)
    new RegExp(`\\bregister\\s*\\(\\s*['\"]${escName}(?:[.\\b'\"])`),
    // SDK gsd-tools shim args[0] === '<case>'
    new RegExp(`args\\[0\\]\\s*===\\s*['\"]${escName}['\"]`),
    // Golden table cjs: '<case>' (sdk/src/golden/)
    new RegExp(`cjs:\\s*['\"]${escName}['\"]`),
    // execRaw('<case>', ...) inside SDK gsd-tools.ts
    new RegExp(`execRaw\\s*\\(\\s*['\"]${escName}['\"]`),
  ];
  for (const f of corpus) {
    for (const re of patterns) {
      if (re.test(f.content)) return f.rel;
    }
  }
  return null;
}

function caseInInventory(caseName, inventory) {
  const lines = inventory.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (/^## /.test(line)) inSection = /CLI Subcommands/i.test(line);
    if (inSection && new RegExp(`\\b${caseName}\\b`).test(line)) return true;
  }
  return false;
}

test('every top-level case in gsd-tools.cjs is reachable from a surviving caller or documented (CR-03 guard)', () => {
  const src = fs.readFileSync(TOOLS_PATH, 'utf8');
  const cases = extractTopLevelCases(src);

  assert.ok(cases.length > 0, 'extractTopLevelCases returned 0 cases — extractor is broken');

  const corpus = buildCallerCorpus();
  const inventory = fs.existsSync(INVENTORY_PATH) ? fs.readFileSync(INVENTORY_PATH, 'utf8') : '';

  const orphans = [];
  for (const caseName of cases) {
    const callerHit = caseHasCaller(caseName, corpus);
    const inInventory = caseInInventory(caseName, inventory);
    if (!callerHit && !inInventory) {
      orphans.push(caseName);
    }
  }

  assert.deepStrictEqual(orphans, [],
    `dead dispatcher cases (no surviving caller, not in INVENTORY.md CLI Subcommands): ${orphans.join(', ')}. ` +
    `Each case must be invoked by an agent/command/workflow/SDK source OR documented as a public CLI subcommand. ` +
    `Per CR-03 prescription: delete the case + handler, OR add an INVENTORY.md "CLI Subcommands" entry.`);
});

test('extractTopLevelCases returns a non-trivial set of known cases (sanity)', () => {
  const src = fs.readFileSync(TOOLS_PATH, 'utf8');
  const cases = new Set(extractTopLevelCases(src));
  // Spot-check known top-level surviving cases from the actual source:
  // - `commit` (line 618), `verify` (line 697), `workstream` (line 1150),
  //   `graphify` (line 1226), `learnings` (line 1260) — all top-level cases.
  // Note: `query` is NOT a top-level case in gsd-tools.cjs; it is the SDK CLI
  // command that forwards to dispatcher cases. So it is intentionally absent.
  const expectedSurvivors = ['commit', 'verify', 'workstream', 'graphify', 'learnings'];
  for (const name of expectedSurvivors) {
    assert.ok(cases.has(name),
      `extractor missed top-level case '${name}'; check the regex (expected 4-space indent)`);
  }
});

test('survivor cases are NOT flagged as orphans pre-Task-2 (BLOCKER 2 sub-issue B guard)', () => {
  // This test is structured so it passes BOTH before and after Task 2.
  // The contract: if any of these survivor case names ever lands in the
  // orphans list, the caller-search regex has regressed and the dead-route
  // detection has become unreliable.
  const src = fs.readFileSync(TOOLS_PATH, 'utf8');
  const cases = new Set(extractTopLevelCases(src));
  const corpus = buildCallerCorpus();
  const inventory = fs.existsSync(INVENTORY_PATH) ? fs.readFileSync(INVENTORY_PATH, 'utf8') : '';

  // Known survivor cases that genuinely exist as top-level cases in the
  // current source. Each MUST resolve to either a caller hit or an
  // INVENTORY.md entry. They are the false-positive guard for the
  // caller-search regex.
  const KNOWN_SURVIVORS = ['commit', 'verify', 'workstream', 'graphify', 'learnings'];

  const surviveButFlagged = [];
  for (const name of KNOWN_SURVIVORS) {
    if (!cases.has(name)) continue;  // not a top-level case in current source
    const callerHit = caseHasCaller(name, corpus);
    const inInventory = caseInInventory(name, inventory);
    if (!callerHit && !inInventory) surviveButFlagged.push(name);
  }

  assert.deepStrictEqual(surviveButFlagged, [],
    `caller-search regex false-positives — known survivor cases ${surviveButFlagged.join(', ')} ` +
    `were flagged as orphans. The regex must be relaxed (or the caller corpus expanded) before ` +
    `Task 2 deletes the dead cases, otherwise the test will be permanently failing post-Task-2.`);
});
