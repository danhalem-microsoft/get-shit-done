'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runChecks, LAYOUTS, CRITICS, RESEARCHERS } = require('../fork-structural.cjs');

function tmp(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fs-'));
  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

// Builds a complete-passing fixture for the given runtime by walking its
// declared layout. This way the test stays correct if a layout is tweaked.
function buildPassingFixture(runtime) {
  const layout = LAYOUTS[runtime];
  const files = {};
  const put = (rel) => { files[path.join(layout.root, rel)] = '#'; };
  for (const c of CRITICS) put(layout.criticFile(c));
  put(layout.synthesizerFile);
  for (const r of RESEARCHERS) put(layout.researcherFile(r));
  for (const cmd of ['add-mistake', 'mistakes', 'add-taste', 'extract-taste']) {
    put(layout.commandCandidates(cmd)[0]);
  }
  put(layout.gsdToolsFile);
  put(layout.tasteFile);
  return files;
}

for (const runtime of ['copilot', 'opencode', 'claude']) {
  test(`runChecks passes when all 5 fork features are present (${runtime} layout)`, () => {
    const root = tmp(buildPassingFixture(runtime));
    const report = runChecks({ root, runtime });
    assert.equal(report.allPass, true, JSON.stringify(report.failures, null, 2));
  });
}

test('runChecks reports missing critics as failures (copilot)', () => {
  const root = tmp({
    '.github/agents/gsd-critic-plan.agent.md': 'plan',
  });
  const report = runChecks({ root, runtime: 'copilot' });
  assert.equal(report.allPass, false);
  assert.ok(report.failures.some((f) => f.feature === 'critics'));
});

test('copilot layout: critic files use the .agent.md suffix', () => {
  // Regression guard: under the copilot CLI convention, agents end in
  // `.agent.md`, not `.md`. A plain `.md` critic file must NOT satisfy
  // the check; only the suffixed file does.
  const wrongRoot = tmp({
    '.github/agents/gsd-critic-plan.md': 'wrong suffix',
  });
  const wrongReport = runChecks({ root: wrongRoot, runtime: 'copilot' });
  const wrongCritics = wrongReport.checks.find((c) => c.feature === 'critics');
  assert.deepEqual(wrongCritics.missing, CRITICS);

  const okRoot = tmp({
    '.github/agents/gsd-critic-plan.agent.md': 'right',
    '.github/agents/gsd-critic-code.agent.md': 'right',
    '.github/agents/gsd-critic-scope.agent.md': 'right',
    '.github/agents/gsd-critic-verify.agent.md': 'right',
    '.github/agents/gsd-critic-discuss.agent.md': 'right',
    '.github/agents/gsd-critic-strategy.agent.md': 'right',
  });
  const okReport = runChecks({ root: okRoot, runtime: 'copilot' });
  const okCritics = okReport.checks.find((c) => c.feature === 'critics');
  assert.equal(okCritics.pass, true);
});

test('copilot layout: mistake/taste commands resolve to .github/skills/gsd-<cmd>/SKILL.md', () => {
  const root = tmp({
    '.github/skills/gsd-add-mistake/SKILL.md': '#',
    '.github/skills/gsd-mistakes/SKILL.md': '#',
    '.github/get-shit-done/bin/gsd-tools.cjs': '#',
  });
  const report = runChecks({ root, runtime: 'copilot' });
  const m = report.checks.find((c) => c.feature === 'mistake-registry');
  assert.equal(m.pass, true);
});

test('opencode layout: commands resolve to .opencode/command/gsd-<cmd>.md (flat)', () => {
  const root = tmp({
    '.opencode/command/gsd-add-mistake.md': '#',
    '.opencode/command/gsd-mistakes.md': '#',
    '.opencode/get-shit-done/bin/gsd-tools.cjs': '#',
  });
  const report = runChecks({ root, runtime: 'opencode' });
  const m = report.checks.find((c) => c.feature === 'mistake-registry');
  assert.equal(m.pass, true);
});
