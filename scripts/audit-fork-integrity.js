#!/usr/bin/env node
/*
 * audit-fork-integrity.js — FORK.md Binding Rule 1, invariant #1 auditor.
 *
 * Scans every `commands/gsd/**` markdown file RECURSIVELY, extracts every
 *   @$HOME/.claude/...   or   @~/.claude/...
 * include reference, resolves each to a repo-relative source path via a
 * HARDCODED prefix table, and checks that the target file exists. Results
 * are diffed against a frozen JSON baseline captured at 6b9b3f8^ (the
 * pre-murder tree).
 *
 * Exit codes: 0 clean · 1 findings · 2 usage error.
 *
 * Operational Policy (triplicated with --help and docs/audit-fork-integrity-README.md):
 *
 *   Running this auditor against HEAD during Phases 5–7 is EXPECTED TO FAIL
 *   because the baseline is captured at 6b9b3f8^ (pre-murder) and HEAD
 *   contains known murder-merge damage. CI/gate invocation lands in Phase 8
 *   (PREV-05). This is not a phase-5 regression. Do NOT add a
 *   --allow-known-damage flag — it would break the fail-closed contract.
 *
 * Operators and CI MUST NOT:
 *   - Treat this expected Phases-5–7 failure as a phase-5 regression.
 *   - Add a --allow-known-damage flag, a damage-inventory-file bypass, or
 *     any env-var override.
 *   - Invoke the auditor as a gate or CI check prior to Phase 8.
 *
 * Operators and CI MAY:
 *   - Invoke with --root <path-to-pre-murder-worktree> for baseline-shape
 *     work during Phases 5–7.
 *   - Invoke against HEAD ad hoc for diagnostic purposes, understanding
 *     that non-zero exit is the expected state until Phase 7 completes.
 *
 * See docs/audit-fork-integrity-README.md for operational policy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Hardcoded prefix table — NO manifest loading, unconditional.
const PREFIXES = {
  '~/.claude/get-shit-done/': 'get-shit-done/',
  '~/.claude/agents/': 'agents/',
  '~/.claude/commands/': 'commands/',
};

// Exact trailing-punctuation set to strip from matched reference tokens.
const TRAIL = new Set(['.', ',', ')', ']', ';', ':', '`', "'", '"']);

const INCLUDE_RE = /@(?:\$HOME|~)\/\.claude\/\S+/g;

const CMP = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'variant' });

function usage() {
  return [
    'Usage: audit-fork-integrity.js [--root <dir>] [--baseline <path>] [--json] [--regenerate] [--help]',
    '',
    '  --root <dir>        Scan root (default: repo root).',
    '  --baseline <path>   Baseline JSON path (default: scripts/fixtures/fork-integrity-baseline.json).',
    '  --json              Emit machine-readable findings.',
    '  --regenerate        Write the baseline from the current scan (dev-only). Exits 0.',
    '  --help, -h          Print this message and the operational policy.',
    '',
    'Exit codes: 0 clean · 1 findings · 2 usage.',
    '',
    'Operational Policy:',
    '  Running this auditor against HEAD during Phases 5–7 is expected to fail',
    '  because the baseline is captured at 6b9b3f8^ (pre-murder) and HEAD',
    '  contains known murder-merge damage. CI/gate invocation lands in Phase 8',
    '  (PREV-05). This is not a phase-5 regression. Do NOT add a',
    '  --allow-known-damage flag.',
    '',
    '  See docs/audit-fork-integrity-README.md for the full policy.',
    '',
  ].join('\n');
}

function stripTrailing(token) {
  while (token.length && TRAIL.has(token[token.length - 1])) {
    token = token.slice(0, -1);
  }
  return token;
}

function resolveRefToRelPath(refText) {
  // Normalize $HOME → ~.
  let r = refText.replace(/^@/, '');
  r = r.replace(/^\$HOME\//, '~/');
  for (const [prefix, repoRel] of Object.entries(PREFIXES)) {
    if (r.startsWith(prefix)) {
      const suffix = r.slice(prefix.length);
      // Reject suffixes that contain path-traversal or absolute segments.
      // Splitting on "/" avoids OS-specific separator handling (refs are
      // posix-style by contract). Any ".." segment or absolute suffix
      // escapes the prefixed subtree, so we treat the ref as unmapped
      // (caller records exists: false → MISSING_TARGET).
      if (suffix.length === 0) return repoRel;
      const segs = suffix.split('/');
      if (segs.some((s) => s === '..' || s === '')) return null;
      if (path.isAbsolute(suffix)) return null;
      return repoRel + suffix;
    }
  }
  return null; // unmapped — caller treats as unresolved.
}

function walkMarkdown(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return null;
  }
  for (const dirent of entries) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      const sub = walkMarkdown(full);
      if (sub) out.push(...sub);
    } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function buildDigest(root) {
  const cmdDir = path.join(root, 'commands', 'gsd');
  if (!fs.existsSync(cmdDir) || !fs.statSync(cmdDir).isDirectory()) {
    return { error: `commands/gsd not found under root: ${root}` };
  }
  const files = walkMarkdown(cmdDir) || [];
  const entries = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(INCLUDE_RE) || [];
    const seen = new Set();
    const refs = [];
    for (const raw of matches) {
      const refText = stripTrailing(raw);
      if (seen.has(refText)) continue;
      seen.add(refText);
      const repoRel = resolveRefToRelPath(refText);
      let resolvedPath;
      let exists;
      if (repoRel === null) {
        resolvedPath = null;
        exists = false;
      } else {
        resolvedPath = repoRel;
        const abs = path.join(root, repoRel);
        exists = fs.existsSync(abs);
      }
      refs.push({ ref_text: refText, resolved_path: resolvedPath, exists });
    }
    refs.sort((a, b) => CMP(a.ref_text, b.ref_text));
    entries.push({ command_file: rel, refs });
  }
  entries.sort((a, b) => CMP(a.command_file, b.command_file));
  return { entries };
}

function loadBaseline(pathname) {
  const text = fs.readFileSync(pathname, 'utf8');
  const parsed = JSON.parse(text);
  // Accept either { entries: [...] } or a top-level array.
  if (Array.isArray(parsed)) return { entries: parsed };
  if (parsed && Array.isArray(parsed.entries)) return parsed;
  throw new Error(`baseline at ${pathname} has unexpected shape`);
}

function writeBaselineAtomic(pathname, digest) {
  const tmp = pathname + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(digest, null, 2) + '\n');
  fs.renameSync(tmp, pathname);
}

function indexByFileAndRef(digest) {
  const idx = new Map();
  for (const e of digest.entries) {
    const refMap = new Map();
    for (const r of e.refs) refMap.set(r.ref_text, r);
    idx.set(e.command_file, refMap);
  }
  return idx;
}

function computeFindings(currentDigest, baselineDigest) {
  const findings = [];
  const curIdx = indexByFileAndRef(currentDigest);
  const baseIdx = indexByFileAndRef(baselineDigest);

  // Missing targets in current + regressions vs baseline.
  for (const [file, refs] of curIdx.entries()) {
    for (const [refText, r] of refs.entries()) {
      if (!r.exists) {
        findings.push({
          code: 'MISSING_TARGET',
          command_file: file,
          ref_text: refText,
          resolved_path: r.resolved_path,
        });
      }
      const baseRef = baseIdx.get(file) && baseIdx.get(file).get(refText);
      if (baseRef && baseRef.exists === true && r.exists === false) {
        findings.push({
          code: 'REGRESSION',
          command_file: file,
          ref_text: refText,
          resolved_path: r.resolved_path,
        });
      }
      if (!baseIdx.has(file) || !baseIdx.get(file).has(refText)) {
        findings.push({
          code: 'NEW_REF',
          command_file: file,
          ref_text: refText,
          resolved_path: r.resolved_path,
        });
      }
    }
  }

  // Dropped refs (informational).
  for (const [file, refs] of baseIdx.entries()) {
    for (const refText of refs.keys()) {
      if (!curIdx.has(file) || !curIdx.get(file).has(refText)) {
        findings.push({
          code: 'DROPPED_REF',
          command_file: file,
          ref_text: refText,
          resolved_path: null,
        });
      }
    }
  }

  return findings;
}

function parseArgs(argv) {
  const opts = { root: null, baseline: null, json: false, regenerate: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--regenerate') opts.regenerate = true;
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '--baseline') opts.baseline = argv[++i];
    else return { error: `unknown flag: ${a}` };
  }
  return { opts };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(parsed.error + '\n' + usage());
    process.exit(2);
  }
  const { opts } = parsed;
  if (opts.help) {
    process.stdout.write(usage());
    process.exit(0);
  }

  const root = path.resolve(opts.root || path.join(__dirname, '..'));
  const baselinePath = path.resolve(
    opts.baseline || path.join(__dirname, 'fixtures', 'fork-integrity-baseline.json')
  );

  const digest = buildDigest(root);
  if (digest.error) {
    process.stderr.write(`error: ${digest.error}\n`);
    process.exit(2);
  }

  if (opts.regenerate) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeBaselineAtomic(baselinePath, digest);
    if (!opts.json) {
      process.stdout.write(`wrote baseline: ${baselinePath} (${digest.entries.length} entries)\n`);
    } else {
      process.stdout.write(JSON.stringify({ regenerated: baselinePath, entries: digest.entries.length }) + '\n');
    }
    process.exit(0);
  }

  let baseline;
  try {
    baseline = loadBaseline(baselinePath);
  } catch (err) {
    process.stderr.write(`error: cannot load baseline at ${baselinePath}: ${err.message}\n`);
    process.exit(2);
  }

  const findings = computeFindings(digest, baseline);
  const blocking = findings.filter((f) => f.code === 'MISSING_TARGET' || f.code === 'REGRESSION');
  const exitCode = blocking.length > 0 ? 1 : 0;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        findings,
        summary: {
          total: findings.length,
          missing_target: findings.filter((f) => f.code === 'MISSING_TARGET').length,
          regression: findings.filter((f) => f.code === 'REGRESSION').length,
          new_ref: findings.filter((f) => f.code === 'NEW_REF').length,
          dropped_ref: findings.filter((f) => f.code === 'DROPPED_REF').length,
        },
      }) + '\n'
    );
  } else {
    if (blocking.length === 0) {
      process.stdout.write('audit-fork-integrity: clean (no missing targets, no regressions)\n');
    } else {
      process.stdout.write(`audit-fork-integrity: ${blocking.length} blocking finding(s)\n`);
      for (const f of blocking) {
        process.stdout.write(
          `  [${f.code}] ${f.command_file} -> ${f.ref_text} (resolved: ${f.resolved_path || '<unmapped>'})\n`
        );
      }
    }
  }
  process.exit(exitCode);
}

main();
