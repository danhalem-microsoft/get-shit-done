'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_DIRS = { copilot: '.github', opencode: '.opencode', claude: '.claude' };

const CRITICS = ['plan', 'code', 'scope', 'verify', 'discuss', 'strategy'];
const RESEARCHERS = [
  'architecture', 'build-system', 'conventions', 'data-model', 'deployment',
  'features', 'phase-research', 'pitfalls', 'stack', 'testing', '_template',
];

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function checkCritics(base) {
  const missing = CRITICS.filter((c) => !exists(path.join(base, 'agents', `gsd-critic-${c}.md`)));
  return { feature: 'critics', pass: missing.length === 0, missing };
}

function checkResearchers(base) {
  const missing = RESEARCHERS.filter((r) => !exists(path.join(base, 'get-shit-done', 'researchers', `${r}.md`)));
  return { feature: 'researchers', pass: missing.length === 0, missing };
}

function checkSynthesizer(base) {
  return { feature: 'synthesizer', pass: exists(path.join(base, 'agents', 'gsd-research-synthesizer.md')) };
}

// NOTE: paths reflect the actual Claude reference install (the working
// runtime this fork was developed against), not the plan's spec source.
// The plan listed list-mistakes.md / sdk/gsd-tools.cjs / sdk/taste.cjs,
// but those files do not exist anywhere in the fork. The real names are:
//   commands/gsd/mistakes.md
//   get-shit-done/bin/gsd-tools.cjs
//   get-shit-done/bin/lib/taste.cjs
function checkMistakeRegistry(base) {
  const a = exists(path.join(base, 'commands', 'gsd', 'add-mistake.md'));
  const b = exists(path.join(base, 'commands', 'gsd', 'mistakes.md'));
  const c = exists(path.join(base, 'get-shit-done', 'bin', 'gsd-tools.cjs'));
  return { feature: 'mistake-registry', pass: a && b && c, parts: { 'add-mistake': a, 'mistakes': b, 'gsd-tools.cjs': c } };
}

function checkTasteLibrary(base) {
  const a = exists(path.join(base, 'commands', 'gsd', 'add-taste.md'));
  const b = exists(path.join(base, 'commands', 'gsd', 'extract-taste.md'));
  const c = exists(path.join(base, 'get-shit-done', 'bin', 'lib', 'taste.cjs'));
  return { feature: 'taste-library', pass: a && b && c, parts: { 'add-taste': a, 'extract-taste': b, 'taste.cjs': c } };
}

function runChecks({ root, runtime }) {
  const subdir = RUNTIME_DIRS[runtime];
  if (!subdir) throw new Error(`unknown runtime ${runtime}`);
  const base = path.join(root, subdir);
  const checks = [
    checkCritics(base),
    checkResearchers(base),
    checkSynthesizer(base),
    checkMistakeRegistry(base),
    checkTasteLibrary(base),
  ];
  const failures = checks.filter((c) => !c.pass);
  return { runtime, base, checks, failures, allPass: failures.length === 0 };
}

module.exports = { runChecks, RUNTIME_DIRS, CRITICS, RESEARCHERS };
