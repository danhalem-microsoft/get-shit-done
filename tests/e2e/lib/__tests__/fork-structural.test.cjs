const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runChecks } = require('../fork-structural.cjs');

function tmp(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fs-'));
  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

test('runChecks passes when all 6 fork features are present (copilot layout)', () => {
  const root = tmp({
    '.github/agents/gsd-critic-plan.md': 'plan',
    '.github/agents/gsd-critic-code.md': 'code',
    '.github/agents/gsd-critic-scope.md': 'scope',
    '.github/agents/gsd-critic-verify.md': 'verify',
    '.github/agents/gsd-critic-discuss.md': 'discuss',
    '.github/agents/gsd-critic-strategy.md': 'strategy',
    '.github/get-shit-done/researchers/architecture.md': '#',
    '.github/get-shit-done/researchers/build-system.md': '#',
    '.github/get-shit-done/researchers/conventions.md': '#',
    '.github/get-shit-done/researchers/data-model.md': '#',
    '.github/get-shit-done/researchers/deployment.md': '#',
    '.github/get-shit-done/researchers/features.md': '#',
    '.github/get-shit-done/researchers/phase-research.md': '#',
    '.github/get-shit-done/researchers/pitfalls.md': '#',
    '.github/get-shit-done/researchers/stack.md': '#',
    '.github/get-shit-done/researchers/testing.md': '#',
    '.github/get-shit-done/researchers/_template.md': '#',
    '.github/agents/gsd-research-synthesizer.md': 'adaptive synthesis',
    '.github/commands/gsd/add-mistake.md': 'add-mistake',
    '.github/commands/gsd/list-mistakes.md': 'list-mistakes',
    '.github/commands/gsd/add-taste.md': 'add-taste',
    '.github/commands/gsd/extract-taste.md': 'extract-taste',
    '.github/sdk/gsd-tools.cjs': 'gsd-tools',
    '.github/sdk/taste.cjs': 'taste',
  });
  const report = runChecks({ root, runtime: 'copilot' });
  assert.equal(report.allPass, true, JSON.stringify(report.failures));
});

test('runChecks reports missing critics as failures', () => {
  const root = tmp({
    '.github/agents/gsd-critic-plan.md': 'plan',
  });
  const report = runChecks({ root, runtime: 'copilot' });
  assert.equal(report.allPass, false);
  assert.ok(report.failures.some((f) => f.feature === 'critics'));
});
