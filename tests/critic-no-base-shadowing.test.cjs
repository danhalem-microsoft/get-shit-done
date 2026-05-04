// tests/critic-no-base-shadowing.test.cjs
//
// Static guard for CRIT-05 (Phase 2 Wave 0).
//
// Sub-test 1 (tag-name scan): each addendum's XML tags + ## headings must
// not duplicate sections already declared in agents/_shared/critic-base.md.
// Whitelist: <lens>, <*_specific_checklist>, <*_calibration_examples>.
//
// Sub-test 2 (H9 — content-overlap scan): no addendum 5-line non-blank window
// may have ≥ 0.80 Jaccard similarity with any 5-line window in critic-base.md.
// Catches prose duplication that the tag-name scan misses (per 02-REVIEWS.md
// verify-W-004).
//
// Wave-0 RED expectation: until Plan 02 lands agents/_shared/critic-base.md,
// the existence assert fails. Plan 04 + Plan 05 keep both violations arrays
// empty as addendums are trimmed.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'agents', '_shared', 'critic-base.md');
const CRITICS = [
  'gsd-critic-plan', 'gsd-critic-code', 'gsd-critic-scope',
  'gsd-critic-verify', 'gsd-critic-discuss', 'gsd-critic-strategy',
];

const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','in','for','on','at','by','is','are',
  'be','was','were','it','this','that','as','with','from','your','you','i',
  '-','*','**','---'
]);

function extractBaseSections(content) {
  const xmlTags = [...content.matchAll(/<([a-z_][a-z0-9_-]*)>/gi)].map((m) => m[1]);
  const mdHeadings = [...content.matchAll(/^##+\s+(.+)$/gm)].map((m) => m[1].trim());
  return { xmlTags: new Set(xmlTags), mdHeadings: new Set(mdHeadings) };
}

// H9 (per 02-REVIEWS.md): tokenize a single line into a stop-word-filtered set
// for Jaccard similarity. Lowercase, strip non-alphanum, keep tokens length >= 3.
function tokenize(line) {
  return new Set(
    line.toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

// H9: 5-line non-blank windows. body lines after the leading @-import; skip frontmatter.
function nonBlankWindows(content, windowSize = 5) {
  const lines = content.split('\n');
  const afterFrontmatter = lines.findIndex((l, i) => i > 0 && l.trim() === '---') + 1;
  const body = lines.slice(afterFrontmatter > 0 ? afterFrontmatter : 0)
    .map((l, idx) => ({ idx, text: l.trim() }))
    .filter((l) => l.text.length > 0 && !l.text.startsWith('@'));
  const windows = [];
  for (let i = 0; i + windowSize <= body.length; i++) {
    const slice = body.slice(i, i + windowSize);
    windows.push({ startLine: slice[0].idx + 1, endLine: slice[slice.length - 1].idx + 1, text: slice.map((s) => s.text).join(' ') });
  }
  return windows;
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

test('addendums do not re-define base XML tag sections (CRIT-05 sub-test 1: tag-name scan)', () => {
  assert.ok(fs.existsSync(BASE),
    'agents/_shared/critic-base.md must exist (Plan 02 lands it)');
  const baseContent = fs.readFileSync(BASE, 'utf-8');
  const baseSections = extractBaseSections(baseContent);
  const violations = [];

  for (const name of CRITICS) {
    const file = path.join(ROOT, 'agents', `${name}.md`);
    const content = fs.readFileSync(file, 'utf-8');
    const addendumSections = extractBaseSections(content);

    for (const tag of addendumSections.xmlTags) {
      if (tag === 'lens') continue;
      if (tag.endsWith('_specific_checklist')) continue;
      if (tag.endsWith('_calibration_examples')) continue;
      if (baseSections.xmlTags.has(tag)) {
        violations.push(`${name}.md re-defines <${tag}> already in base`);
      }
    }
    for (const heading of addendumSections.mdHeadings) {
      if (baseSections.mdHeadings.has(heading)) {
        violations.push(`${name}.md re-defines "${heading}" heading already in base`);
      }
    }
  }

  assert.deepStrictEqual(violations, [],
    'base-shadowing detected — addendums must contain only lens-specific content:\n' +
    violations.join('\n'));
});

test('addendums do not re-state base content via 5-line windows (CRIT-05 sub-test 2: H9 Jaccard scan)', () => {
  assert.ok(fs.existsSync(BASE),
    'agents/_shared/critic-base.md must exist (Plan 02 lands it)');
  const baseContent = fs.readFileSync(BASE, 'utf-8');
  const baseWindows = nonBlankWindows(baseContent).map((w) => ({ ...w, tokens: tokenize(w.text) }));
  const violations = [];

  for (const name of CRITICS) {
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${name}.md`), 'utf-8');
    const addWindows = nonBlankWindows(content).map((w) => ({ ...w, tokens: tokenize(w.text) }));
    for (const a of addWindows) {
      for (const b of baseWindows) {
        const score = jaccard(a.tokens, b.tokens);
        if (score >= 0.80) {
          violations.push(
            `${name}.md window L${a.startLine}-L${a.endLine} ` +
            `≥80% Jaccard (${score.toFixed(2)}) against base window L${b.startLine}-L${b.endLine}`
          );
          break; // one violation per addendum window is enough
        }
      }
    }
  }

  assert.deepStrictEqual(violations, [],
    'content-overlap detected via H9 Jaccard scan — addendums duplicate base prose:\n' +
    violations.join('\n'));
});
