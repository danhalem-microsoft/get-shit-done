'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CRITICS = ['plan', 'code', 'scope', 'verify', 'discuss', 'strategy'];
const RESEARCHERS = [
  'architecture', 'build-system', 'conventions', 'data-model', 'deployment',
  'features', 'phase-research', 'pitfalls', 'stack', 'testing', '_template',
];

// Per-runtime install layouts.
//
// The original spec assumed all three runtimes share Claude's path layout
// (`agents/gsd-critic-{c}.md`, `commands/gsd/<cmd>.md`). Task 9 + Task 10
// characterization proved that assumption wrong: each runtime has its own
// native conventions that bin/install.js correctly honors.
//
//   - Copilot: critic/synthesizer agents end in `.agent.md` (CLI convention);
//     "commands" are emitted as skills (`skills/gsd-<cmd>/SKILL.md`) rather
//     than as a `commands/gsd/` tree (which copilot doesn't recognize).
//   - OpenCode: critic agents use `.md` suffix but commands are flat
//     (`command/gsd-<cmd>.md`, singular `command`, no `gsd/` subdir).
//   - Claude: original canonical layout.
//
// Forcing install to emit a single canonical layout would actively break
// the non-Claude runtimes, so structural checks must instead recognize each
// runtime's native shape.
const LAYOUTS = {
  copilot: {
    root: '.github',
    criticFile: (c) => path.join('agents', `gsd-critic-${c}.agent.md`),
    synthesizerFile: path.join('agents', 'gsd-research-synthesizer.agent.md'),
    researcherFile: (r) => path.join('get-shit-done', 'researchers', `${r}.md`),
    commandCandidates: (cmd) => [path.join('skills', `gsd-${cmd}`, 'SKILL.md')],
    gsdToolsFile: path.join('get-shit-done', 'bin', 'gsd-tools.cjs'),
    tasteFile: path.join('get-shit-done', 'bin', 'lib', 'taste.cjs'),
  },
  opencode: {
    root: '.opencode',
    criticFile: (c) => path.join('agents', `gsd-critic-${c}.md`),
    synthesizerFile: path.join('agents', 'gsd-research-synthesizer.md'),
    researcherFile: (r) => path.join('get-shit-done', 'researchers', `${r}.md`),
    commandCandidates: (cmd) => [path.join('command', `gsd-${cmd}.md`)],
    gsdToolsFile: path.join('get-shit-done', 'bin', 'gsd-tools.cjs'),
    tasteFile: path.join('get-shit-done', 'bin', 'lib', 'taste.cjs'),
  },
  claude: {
    root: '.claude',
    criticFile: (c) => path.join('agents', `gsd-critic-${c}.md`),
    synthesizerFile: path.join('agents', 'gsd-research-synthesizer.md'),
    researcherFile: (r) => path.join('get-shit-done', 'researchers', `${r}.md`),
    commandCandidates: (cmd) => [path.join('commands', 'gsd', `${cmd}.md`)],
    gsdToolsFile: path.join('get-shit-done', 'bin', 'gsd-tools.cjs'),
    tasteFile: path.join('get-shit-done', 'bin', 'lib', 'taste.cjs'),
  },
};

// Kept for callers that look up just the root dir (e.g., lifecycle tests).
const RUNTIME_DIRS = Object.fromEntries(
  Object.entries(LAYOUTS).map(([rt, l]) => [rt, l.root])
);

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function anyExist(base, rels) { return rels.some((r) => exists(path.join(base, r))); }

function checkCritics(base, layout) {
  const missing = CRITICS.filter((c) => !exists(path.join(base, layout.criticFile(c))));
  return { feature: 'critics', pass: missing.length === 0, missing };
}

function checkResearchers(base, layout) {
  const missing = RESEARCHERS.filter((r) => !exists(path.join(base, layout.researcherFile(r))));
  return { feature: 'researchers', pass: missing.length === 0, missing };
}

function checkSynthesizer(base, layout) {
  return { feature: 'synthesizer', pass: exists(path.join(base, layout.synthesizerFile)) };
}

function checkMistakeRegistry(base, layout) {
  const a = anyExist(base, layout.commandCandidates('add-mistake'));
  const b = anyExist(base, layout.commandCandidates('mistakes'));
  const c = exists(path.join(base, layout.gsdToolsFile));
  return {
    feature: 'mistake-registry',
    pass: a && b && c,
    parts: { 'add-mistake': a, 'mistakes': b, 'gsd-tools.cjs': c },
  };
}

function checkTasteLibrary(base, layout) {
  const a = anyExist(base, layout.commandCandidates('add-taste'));
  const b = anyExist(base, layout.commandCandidates('extract-taste'));
  const c = exists(path.join(base, layout.tasteFile));
  return {
    feature: 'taste-library',
    pass: a && b && c,
    parts: { 'add-taste': a, 'extract-taste': b, 'taste.cjs': c },
  };
}

function runChecks({ root, runtime }) {
  const layout = LAYOUTS[runtime];
  if (!layout) throw new Error(`unknown runtime ${runtime}`);
  const base = path.join(root, layout.root);
  const checks = [
    checkCritics(base, layout),
    checkResearchers(base, layout),
    checkSynthesizer(base, layout),
    checkMistakeRegistry(base, layout),
    checkTasteLibrary(base, layout),
  ];
  const failures = checks.filter((c) => !c.pass);
  return { runtime, base, checks, failures, allPass: failures.length === 0 };
}

module.exports = { runChecks, RUNTIME_DIRS, LAYOUTS, CRITICS, RESEARCHERS };
