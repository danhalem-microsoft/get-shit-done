'use strict';

/**
 * CULL-01 + CULL-02 + CULL-08 (per CONTEXT.md D-02): docs/INVENTORY.md is the
 * canonical roster of user-facing commands and agents. The 6 deprecation stubs
 * are NOT counted as commands.
 *
 * This test asserts:
 *   1. docs/INVENTORY.md lists exactly 37 user-facing commands and exactly 22 agents.
 *   2. Every command listed in INVENTORY.md maps to an existing commands/gsd/<name>.md.
 *   3. Every agent listed in INVENTORY.md maps to an existing agents/<name>.md.
 *   4. Exactly 6 deprecation stub files exist matching the consolidated quality-gate list
 *      (secure-phase, validate-phase, code-review, code-review-fix, critique,
 *      plan-review-convergence).
 *   5. agents/ filesystem contains exactly 22 gsd-*.md files (matches D-03 + INVENTORY).
 *   6. install-manifest.json structural copy rules still resolve as a sanity check
 *      (per RESEARCH.md §2.5 — install-manifest is copy-rules, not enumeration).
 *
 * Per CONTEXT.md D-04 (concurrency contract): use only fs.readFileSync (read-only)
 * and own-scope local variables.
 *
 * Filename note: per RESEARCH.md §2.5, the test asserts INVENTORY.md ↔ filesystem
 * equality, not install-manifest.json content. The filename is preserved for git
 * history and downstream cross-references (Plan 09 test_inventory references this
 * filename).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  survivingCommandCount,
  survivingAgentCount,
  deprecationStubs,
} = require('./fixtures/cull-deletion-list.cjs');

// --- INVENTORY.md parser ---------------------------------------------------
// INVENTORY.md groups commands and agents under headers like
// "## Commands (N shipped)" and "## Agents (N shipped)". Section boundaries
// are split on top-level "## " headers. Stubs live in a separate
// "## Deprecation Stubs" section per D-02 so they are NOT counted as commands.
function parseInventory() {
  const inventoryPath = path.join(ROOT, 'docs', 'INVENTORY.md');
  const text = fs.readFileSync(inventoryPath, 'utf-8');

  // Split by top-level headers; find the Commands and Agents sections.
  const sections = text.split(/^##\s+/m);
  const cmdSection = sections.find((s) => /^Commands\b/i.test(s)) || '';
  const agentSection = sections.find((s) => /^Agents\b/i.test(s)) || '';

  // Extract command names: any reference to commands/gsd/<name>.md in the section.
  const cmdNames = new Set();
  for (const m of cmdSection.matchAll(/commands\/gsd\/([a-z0-9_-]+)\.md/g)) {
    cmdNames.add(m[1]);
  }

  // Extract agent names: any `| gsd-<name> |` row in the agents section.
  const agentNames = new Set();
  for (const m of agentSection.matchAll(/^\|\s*(gsd-[a-z0-9_-]+)\s*\|/gm)) {
    agentNames.add(m[1]);
  }

  return { cmdNames, agentNames };
}

describe('CULL-01/02/08 per D-02: docs/INVENTORY.md ↔ filesystem equality', () => {
  test(`INVENTORY.md lists exactly ${survivingCommandCount} user-facing commands`, () => {
    const { cmdNames } = parseInventory();
    assert.strictEqual(
      cmdNames.size,
      survivingCommandCount,
      `Expected INVENTORY.md to list ${survivingCommandCount} commands per D-02, found ${cmdNames.size}: ${[...cmdNames].sort().join(', ')}`
    );
  });

  test(`INVENTORY.md lists exactly ${survivingAgentCount} agents`, () => {
    const { agentNames } = parseInventory();
    assert.strictEqual(
      agentNames.size,
      survivingAgentCount,
      `Expected INVENTORY.md to list ${survivingAgentCount} agents per D-02, found ${agentNames.size}: ${[...agentNames].sort().join(', ')}`
    );
  });

  test('every INVENTORY command entry has an existing commands/gsd/<name>.md file', () => {
    const { cmdNames } = parseInventory();
    const missing = [];
    for (const name of cmdNames) {
      const abs = path.join(ROOT, 'commands', 'gsd', `${name}.md`);
      if (!fs.existsSync(abs)) missing.push(name);
    }
    assert.deepStrictEqual(
      missing,
      [],
      `INVENTORY.md lists commands with no corresponding file: ${missing.join(', ')}`
    );
  });

  test('every INVENTORY agent entry has an existing agents/<name>.md file', () => {
    const { agentNames } = parseInventory();
    const missing = [];
    for (const name of agentNames) {
      const abs = path.join(ROOT, 'agents', `${name}.md`);
      if (!fs.existsSync(abs)) missing.push(name);
    }
    assert.deepStrictEqual(
      missing,
      [],
      `INVENTORY.md lists agents with no corresponding file: ${missing.join(', ')}`
    );
  });

  test('exactly 6 deprecation stub files exist (the consolidated quality-gate list)', () => {
    assert.strictEqual(deprecationStubs.length, 6, 'fixture deprecationStubs must be 6');
    const expectedStubBasenames = new Set([
      'secure-phase.md',
      'validate-phase.md',
      'code-review.md',
      'code-review-fix.md',
      'critique.md',
      'plan-review-convergence.md',
    ]);
    const fixtureBasenames = new Set(deprecationStubs.map((p) => path.basename(p)));
    assert.deepStrictEqual(
      fixtureBasenames,
      expectedStubBasenames,
      'fixture deprecationStubs must match the locked consolidated quality-gate list'
    );
    for (const stubPath of deprecationStubs) {
      const abs = path.join(ROOT, stubPath);
      assert.ok(fs.existsSync(abs), `deprecation stub missing: ${stubPath}`);
    }
  });

  test(`agents/ filesystem contains exactly ${survivingAgentCount} gsd-*.md files`, () => {
    const agentFiles = fs
      .readdirSync(path.join(ROOT, 'agents'))
      .filter((f) => /^gsd-.*\.md$/.test(f))
      .sort();
    assert.strictEqual(
      agentFiles.length,
      survivingAgentCount,
      `Expected ${survivingAgentCount} agents on filesystem, found ${agentFiles.length}: ${agentFiles.join(', ')}`
    );
  });

  test('install-manifest.json structural copy rules resolve (sources point at existing dirs)', () => {
    const manifestPath = path.join(ROOT, 'install-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'install-manifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const [key, rule] of Object.entries(manifest.sources || {})) {
      const srcPath = path.join(ROOT, rule.src);
      assert.ok(
        fs.existsSync(srcPath),
        `manifest.sources.${key}.src "${rule.src}" does not resolve to an existing path`
      );
    }
  });
});
