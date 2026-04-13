/**
 * Core — Shared utilities, constants, and internal helpers
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync, spawnSync } = require('child_process');
const { MODEL_PROFILES } = require('./model-profiles.cjs');

const WORKSTREAM_SESSION_ENV_KEYS = [
  'GSD_SESSION_KEY',
  'CODEX_THREAD_ID',
  'CLAUDE_SESSION_ID',
  'CLAUDE_CODE_SSE_PORT',
  'OPENCODE_SESSION_ID',
  'GEMINI_SESSION_ID',
  'CURSOR_SESSION_ID',
  'WINDSURF_SESSION_ID',
  'TERM_SESSION_ID',
  'WT_SESSION',
  'TMUX_PANE',
  'ZELLIJ_SESSION_NAME',
];

let cachedControllingTtyToken = null;
let didProbeControllingTtyToken = false;

// Track all .planning/.lock files held by this process so they can be removed
// on exit. process.on('exit') fires even on process.exit(1), unlike try/finally
// which is skipped when error() calls process.exit(1) inside a locked region (#1916).
const _heldPlanningLocks = new Set();
process.on('exit', () => {
  for (const lockPath of _heldPlanningLocks) {
    try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
  }
});

// ─── Path helpers ────────────────────────────────────────────────────────────

/** Normalize a relative path to always use forward slashes (cross-platform). */
function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

/**
 * Scan immediate child directories for separate git repos.
 * Returns a sorted array of directory names that have their own `.git`.
 * Excludes hidden directories and node_modules.
 */
function detectSubRepos(cwd) {
  const results = [];
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const gitPath = path.join(cwd, entry.name, '.git');
      try {
        if (fs.existsSync(gitPath)) {
          results.push(entry.name);
        }
      } catch {}
    }
  } catch {}
  return results.sort();
}

/**
 * Walk up from `startDir` to find the project root that owns `.planning/`.
 *
 * In multi-repo workspaces, Claude may open inside a sub-repo (e.g. `backend/`)
 * instead of the project root. This function prevents `.planning/` from being
 * created inside the sub-repo by locating the nearest ancestor that already has
 * a `.planning/` directory.
 *
 * Detection strategy (checked in order for each ancestor):
 * 1. Parent has `.planning/config.json` with `sub_repos` listing this directory
 * 2. Parent has `.planning/config.json` with `multiRepo: true` (legacy format)
 * 3. Parent has `.planning/` and current dir has its own `.git` (heuristic)
 *
 * Returns `startDir` unchanged when no ancestor `.planning/` is found (first-run
 * or single-repo projects).
 */
function findProjectRoot(startDir) {
  const resolved = path.resolve(startDir);
  const root = path.parse(resolved).root;
  const homedir = require('os').homedir();

  // If startDir already contains .planning/, it IS the project root.
  // Do not walk up to a parent workspace that also has .planning/ (#1362).
  const ownPlanning = path.join(resolved, '.planning');
  if (fs.existsSync(ownPlanning) && fs.statSync(ownPlanning).isDirectory()) {
    return startDir;
  }

  // Check if startDir or any of its ancestors (up to AND including the
  // candidate project root) contains a .git directory. This handles both
  // `backend/` (direct sub-repo) and `backend/src/modules/` (nested inside),
  // as well as the common case where .git lives at the same level as .planning/.
  function isInsideGitRepo(candidateParent) {
    let d = resolved;
    while (d !== root) {
      if (fs.existsSync(path.join(d, '.git'))) return true;
      if (d === candidateParent) break;
      d = path.dirname(d);
    }
    return false;
  }

  let dir = resolved;
  while (dir !== root) {
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    if (parent === homedir) break; // never go above home

    const parentPlanning = path.join(parent, '.planning');
    if (fs.existsSync(parentPlanning) && fs.statSync(parentPlanning).isDirectory()) {
      const configPath = path.join(parentPlanning, 'config.json');
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const subRepos = config.sub_repos || config.planning?.sub_repos || [];

        // Check explicit sub_repos list
        if (Array.isArray(subRepos) && subRepos.length > 0) {
          const relPath = path.relative(parent, resolved);
          const topSegment = relPath.split(path.sep)[0];
          if (subRepos.includes(topSegment)) {
            return parent;
          }
        }

        // Check legacy multiRepo flag
        if (config.multiRepo === true && isInsideGitRepo(parent)) {
          return parent;
        }
      } catch {
        // config.json missing or malformed — fall back to .git heuristic
      }

      // Heuristic: parent has .planning/ and we're inside a git repo
      if (isInsideGitRepo(parent)) {
        return parent;
      }
    }
    dir = parent;
  }
  return startDir;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

/**
 * Remove stale gsd-* temp files/dirs older than maxAgeMs (default: 5 minutes).
 * Runs opportunistically before each new temp file write to prevent unbounded accumulation.
 * @param {string} prefix - filename prefix to match (e.g., 'gsd-')
 * @param {object} opts
 * @param {number} opts.maxAgeMs - max age in ms before removal (default: 5 min)
 * @param {boolean} opts.dirsOnly - if true, only remove directories (default: false)
 */
/**
 * Dedicated GSD temp directory: path.join(os.tmpdir(), 'gsd').
 * Created on first use. Keeps GSD temp files isolated from the system
 * temp directory so reap scans only GSD files (#1975).
 */
const GSD_TEMP_DIR = path.join(require('os').tmpdir(), 'gsd');

function ensureGsdTempDir() {
  fs.mkdirSync(GSD_TEMP_DIR, { recursive: true });
}

function reapStaleTempFiles(prefix = 'gsd-', { maxAgeMs = 5 * 60 * 1000, dirsOnly = false } = {}) {
  try {
    ensureGsdTempDir();
    const now = Date.now();
    const entries = fs.readdirSync(GSD_TEMP_DIR);
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) continue;
      const fullPath = path.join(GSD_TEMP_DIR, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else if (!dirsOnly) {
            fs.unlinkSync(fullPath);
          }
        }
      } catch {
        // File may have been removed between readdir and stat — ignore
      }
    }
  } catch {
    // Non-critical — don't let cleanup failures break output
  }
}

function output(result, raw, rawValue) {
  let data;
  if (raw && rawValue !== undefined) {
    data = String(rawValue);
  } else {
    const json = JSON.stringify(result, null, 2);
    // Large payloads exceed Claude Code's Bash tool buffer (~50KB).
    // Write to tmpfile and output the path prefixed with @file: so callers can detect it.
    if (json.length > 50000) {
      reapStaleTempFiles();
      ensureGsdTempDir();
      const tmpPath = path.join(GSD_TEMP_DIR, `gsd-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      data = '@file:' + tmpPath;
    } else {
      data = json;
    }
  }
  // process.stdout.write() is async when stdout is a pipe — process.exit()
  // can tear down the process before the reader consumes the buffer.
  // fs.writeSync(1, ...) blocks until the kernel accepts the bytes, and
  // skipping process.exit() lets the event loop drain naturally.
  fs.writeSync(1, data);
}

function error(message) {
  fs.writeSync(2, 'Error: ' + message + '\n');
  process.exit(1);
}

// ─── File & Config utilities ──────────────────────────────────────────────────

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
/**
 * Soft-resolve the planning root for internal functions.
 * Uses tryGetPlanningContext (which returns null gracefully on no active project)
 * and falls back to '.planning' for backward compatibility with test fixtures
 * that haven't been migrated to multi-user structure yet.
 */
function _resolvePlanningRootSoft(cwd) {
  const ctx = tryGetPlanningContext(cwd);
  return (ctx && ctx.planning_root) ? ctx.planning_root : '.planning';
}

// ─── Config env var mapping ──────────────────────────────────────────────────

const ENV_KEY_MAP = {
  model_profile: 'GSD_MODEL_PROFILE',
  commit_docs: 'GSD_COMMIT_DOCS',
  parallelization: 'GSD_PARALLELIZATION',
  granularity: 'GSD_GRANULARITY',
  brave_search: 'GSD_BRAVE_SEARCH',
  research: 'GSD_RESEARCH',
  plan_checker: 'GSD_PLAN_CHECKER',
  verifier: 'GSD_VERIFIER',
  nyquist_validation: 'GSD_NYQUIST_VALIDATION',
};

/**
 * Canonical config defaults. Single source of truth — imported by config.cjs and verify.cjs.
 */
const CONFIG_DEFAULTS = {
  model_profile: 'balanced',
  commit_docs: true,
  search_gitignored: false,
  branching_strategy: 'none',
  phase_branch_template: 'gsd/phase-{phase}-{slug}',
  milestone_branch_template: 'gsd/{milestone}-{slug}',
  quick_branch_template: null,
  research: true,
  plan_checker: true,
  verifier: true,
  nyquist_validation: true,
  ai_integration_phase: true,
  parallelization: true,
  brave_search: false,
  firecrawl: false,
  exa_search: false,
  text_mode: false,
  sub_repos: [],
  resolve_model_ids: false,
  context_window: 200000,
  phase_naming: 'sequential',
  project_code: null,
  subagent_timeout: 300000,
};

function loadConfig(cwd) {
  const defaults = CONFIG_DEFAULTS;

  const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };

  // Helper: safely read and parse a JSON config file
  function safeReadJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Helper: migrate deprecated "depth" key to "granularity" in a config file
  function migrateDepth(parsed, filePath) {
    if ('depth' in parsed && !('granularity' in parsed)) {
      parsed.granularity = depthToGranularity[parsed.depth] || parsed.depth;
      delete parsed.depth;
      try { fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8'); } catch {}
    }
  }

  // Helper: extract a config value from parsed config (top-level first, then nested)
  function get(parsed, key, nested) {
    if (parsed[key] !== undefined) return parsed[key];
    if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
      return parsed[nested.section][nested.field];
    }
    return undefined;
  }

  // Layer 1: Global config (always at repo root .planning/)
  const globalPath = path.join(cwd, '.planning', 'config.json');
  const globalConfig = safeReadJson(globalPath) || {};

  // Layer 2: Per-project config (only when an active project exists)
  const planningRoot = _resolvePlanningRootSoft(cwd);
  // Guard: don't read per-project config when planningRoot is '.planning' (same as global)
  const projectPath = (planningRoot !== '.planning')
    ? path.join(cwd, planningRoot, 'config.json')
    : null;
  const projectConfig = projectPath ? (safeReadJson(projectPath) || {}) : {};

  // Migrate depth in whichever file contains it
  // Per-project takes precedence if both have it
  if (projectPath && 'depth' in projectConfig) {
    migrateDepth(projectConfig, projectPath);
  }
  if ('depth' in globalConfig) {
    migrateDepth(globalConfig, globalPath);
  }

  // Define key mapping: config key → nested section lookup
  const keyMap = {
    model_profile: null,
    commit_docs: { section: 'planning', field: 'commit_docs' },
    search_gitignored: { section: 'planning', field: 'search_gitignored' },
    branching_strategy: { section: 'git', field: 'branching_strategy' },
    phase_branch_template: { section: 'git', field: 'phase_branch_template' },
    milestone_branch_template: { section: 'git', field: 'milestone_branch_template' },
    quick_branch_template: { section: 'git', field: 'quick_branch_template' },
    research: { section: 'workflow', field: 'research' },
    plan_checker: { section: 'workflow', field: 'plan_check' },
    verifier: { section: 'workflow', field: 'verifier' },
    nyquist_validation: { section: 'workflow', field: 'nyquist_validation' },
    ai_integration_phase: { section: 'workflow', field: 'ai_integration_phase' },
    parallelization: null,
    brave_search: null,
    firecrawl: null,
    exa_search: null,
    text_mode: null,
    sub_repos: null,
    resolve_model_ids: null,
    context_window: null,
    phase_naming: null,
    project_code: null,
    subagent_timeout: null,
    granularity: null,
  };

  // Merge: per-project > global > defaults
  const result = {};
  const sources = {};

  for (const [key, nested] of Object.entries(keyMap)) {
    const projectVal = get(projectConfig, key, nested);
    const globalVal = get(globalConfig, key, nested);

    if (projectVal !== undefined) {
      result[key] = projectVal;
      sources[key] = projectPath;
    } else if (globalVal !== undefined) {
      result[key] = globalVal;
      sources[key] = globalPath;
    } else if (defaults[key] !== undefined) {
      result[key] = defaults[key];
      sources[key] = 'default';
    } else {
      sources[key] = 'default';
    }
  }

  // Normalize parallelization (boolean or object with enabled field)
  const rawParallel = result.parallelization;
  if (typeof rawParallel === 'boolean') {
    result.parallelization = rawParallel;
  } else if (typeof rawParallel === 'object' && rawParallel !== null && 'enabled' in rawParallel) {
    result.parallelization = rawParallel.enabled;
  } else if (rawParallel === undefined) {
    result.parallelization = defaults.parallelization;
    sources.parallelization = 'default';
  }

  // Handle model_overrides (not in defaults, special merge)
  const projectOverrides = projectConfig.model_overrides;
  const globalOverrides = globalConfig.model_overrides;
  if (projectOverrides) {
    result.model_overrides = projectOverrides;
    sources.model_overrides = projectPath || globalPath;
  } else if (globalOverrides) {
    result.model_overrides = globalOverrides;
    sources.model_overrides = globalPath;
  } else {
    result.model_overrides = null;
    sources.model_overrides = 'default';
  }

  result._sources = sources;

  // Layer 3: Environment variable overrides (highest priority)
  // Applied AFTER normalization so env vars always win and don't get re-normalized.
  // Env var values are self-parsed here (string->boolean/number), so normalization
  // blocks above only need to handle config-file values.
  for (const [key, envName] of Object.entries(ENV_KEY_MAP)) {
    const envVal = process.env[envName];
    if (envVal !== undefined) {
      if (envVal === 'true') result[key] = true;
      else if (envVal === 'false') result[key] = false;
      else if (/^\d+$/.test(envVal)) result[key] = parseInt(envVal, 10);
      else result[key] = envVal;
      sources[key] = `env:${envName}`;
    }
  }
  result._sources = sources;

  return result;
}

/**
 * Resolve a config key showing its value, source layer, and full tier chain.
 * Used by `gsd-tools.cjs config-resolve <key>` for config debugging.
 */
function cmdConfigResolve(cwd, key, raw) {
  // Define valid keys (same as keyMap inside loadConfig)
  const validKeys = new Set([
    'model_profile', 'commit_docs', 'search_gitignored',
    'branching_strategy', 'phase_branch_template', 'milestone_branch_template',
    'research', 'plan_checker', 'verifier', 'nyquist_validation',
    'parallelization', 'brave_search', 'granularity',
  ]);

  if (!validKeys.has(key)) {
    error('Unknown config key: ' + key);
  }

  const config = loadConfig(cwd);

  // Hardcoded defaults (same as inside loadConfig)
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'gsd/phase-{phase}-{slug}',
    milestone_branch_template: 'gsd/{milestone}-{slug}',
    research: true,
    plan_checker: true,
    verifier: true,
    nyquist_validation: true,
    parallelization: true,
    brave_search: false,
  };

  // Key mapping for nested section lookups
  const keyMap = {
    model_profile: null,
    commit_docs: { section: 'planning', field: 'commit_docs' },
    search_gitignored: { section: 'planning', field: 'search_gitignored' },
    branching_strategy: { section: 'git', field: 'branching_strategy' },
    phase_branch_template: { section: 'git', field: 'phase_branch_template' },
    milestone_branch_template: { section: 'git', field: 'milestone_branch_template' },
    research: { section: 'workflow', field: 'research' },
    plan_checker: { section: 'workflow', field: 'plan_check' },
    verifier: { section: 'workflow', field: 'verifier' },
    nyquist_validation: { section: 'workflow', field: 'nyquist_validation' },
    parallelization: null,
    brave_search: null,
    granularity: null,
  };

  // Helper to read a key from parsed config
  function getFromParsed(parsed, k) {
    const nested = keyMap[k];
    if (parsed[k] !== undefined) return parsed[k];
    if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
      return parsed[nested.section][nested.field];
    }
    return null;
  }

  // Read raw config files for layer info
  const globalPath = path.join(cwd, '.planning', 'config.json');
  const planningRoot = _resolvePlanningRootSoft(cwd);
  const projectPath = (planningRoot !== '.planning')
    ? path.join(cwd, planningRoot, 'config.json')
    : null;

  let globalVal = null;
  let projectVal = null;

  try {
    const globalConfig = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
    globalVal = getFromParsed(globalConfig, key);
  } catch {}

  if (projectPath) {
    try {
      const projectConfig = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
      projectVal = getFromParsed(projectConfig, key);
    } catch {}
  }

  // Check env var
  const envName = ENV_KEY_MAP[key];
  const envVal = envName ? (process.env[envName] !== undefined ? process.env[envName] : null) : null;

  const layers = {
    default: defaults[key] !== undefined ? defaults[key] : null,
    global: globalVal,
    project: projectVal,
    env: envVal,
  };

  output({
    key,
    value: config[key],
    source: config._sources[key],
    layers,
  }, raw);
}

// ─── Git utilities ────────────────────────────────────────────────────────────

const _gitIgnoredCache = new Map();

function isGitIgnored(cwd, targetPath) {
  const key = cwd + '::' + targetPath;
  if (_gitIgnoredCache.has(key)) return _gitIgnoredCache.get(key);
  try {
    // --no-index checks .gitignore rules regardless of whether the file is tracked.
    // Without it, git check-ignore returns "not ignored" for tracked files even when
    // .gitignore explicitly lists them — a common source of confusion when .planning/
    // was committed before being added to .gitignore.
    // Use execFileSync (array args) to prevent shell interpretation of special characters
    // in file paths — avoids command injection via crafted path names.
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', targetPath], {
      cwd,
      stdio: 'pipe',
    });
    _gitIgnoredCache.set(key, true);
    return true;
  } catch {
    _gitIgnoredCache.set(key, false);
    return false;
  }
}

// ─── Markdown normalization ─────────────────────────────────────────────────

/**
 * Normalize markdown to fix common markdownlint violations.
 * Applied at write points so GSD-generated .planning/ files are IDE-friendly.
 *
 * Rules enforced:
 *   MD022 — Blank lines around headings
 *   MD031 — Blank lines around fenced code blocks
 *   MD032 — Blank lines around lists
 *   MD012 — No multiple consecutive blank lines (collapsed to 2 max)
 *   MD047 — Files end with a single newline
 */
function normalizeMd(content) {
  if (!content || typeof content !== 'string') return content;

  // Normalize line endings to LF for consistent processing
  let text = content.replace(/\r\n/g, '\n');

  const lines = text.split('\n');
  const result = [];

  // Pre-compute fence state in a single O(n) pass instead of O(n^2) per-line scanning
  const fenceRegex = /^```/;
  const insideFence = new Array(lines.length);
  let fenceOpen = false;
  for (let i = 0; i < lines.length; i++) {
    if (fenceRegex.test(lines[i].trimEnd())) {
      if (fenceOpen) {
        // This is a closing fence — mark as NOT inside (it's the boundary)
        insideFence[i] = false;
        fenceOpen = false;
      } else {
        // This is an opening fence
        insideFence[i] = false;
        fenceOpen = true;
      }
    } else {
      insideFence[i] = fenceOpen;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';
    const prevTrimmed = prev.trimEnd();
    const trimmed = line.trimEnd();
    const isFenceLine = fenceRegex.test(trimmed);

    // MD022: Blank line before headings (skip first line and frontmatter delimiters)
    if (/^#{1,6}\s/.test(trimmed) && i > 0 && prevTrimmed !== '' && prevTrimmed !== '---') {
      result.push('');
    }

    // MD031: Blank line before fenced code blocks (opening fences only)
    if (isFenceLine && i > 0 && prevTrimmed !== '' && !insideFence[i] && (i === 0 || !insideFence[i - 1] || isFenceLine)) {
      // Only add blank before opening fences (not closing ones)
      if (i === 0 || !insideFence[i - 1]) {
        result.push('');
      }
    }

    // MD032: Blank line before lists (- item, * item, N. item, - [ ] item)
    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i > 0 &&
        prevTrimmed !== '' && !/^(\s*[-*+]\s|\s*\d+\.\s)/.test(prev) &&
        prevTrimmed !== '---') {
      result.push('');
    }

    result.push(line);

    // MD022: Blank line after headings
    if (/^#{1,6}\s/.test(trimmed) && i < lines.length - 1) {
      const next = lines[i + 1];
      if (next !== undefined && next.trimEnd() !== '') {
        result.push('');
      }
    }

    // MD031: Blank line after closing fenced code blocks
    if (/^```\s*$/.test(trimmed) && i > 0 && insideFence[i - 1] && i < lines.length - 1) {
      const next = lines[i + 1];
      if (next !== undefined && next.trimEnd() !== '') {
        result.push('');
      }
    }

    // MD032: Blank line after last list item in a block
    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line) && i < lines.length - 1) {
      const next = lines[i + 1];
      if (next !== undefined && next.trimEnd() !== '' &&
          !/^(\s*[-*+]\s|\s*\d+\.\s)/.test(next) &&
          !/^\s/.test(next)) {
        // Only add blank line if next line is not a continuation/indented line
        result.push('');
      }
    }
  }

  text = result.join('\n');

  // MD012: Collapse 3+ consecutive blank lines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // MD047: Ensure file ends with exactly one newline
  text = text.replace(/\n*$/, '\n');

  return text;
}

function execGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
  };
}

// ─── Common path helpers ──────────────────────────────────────────────────────

/**
 * Resolve the main worktree root when running inside a git worktree.
 * In a linked worktree, .planning/ lives in the main worktree, not in the linked one.
 * Returns the main worktree path, or cwd if not in a worktree.
 */
function resolveWorktreeRoot(cwd) {
  // If the current directory already has its own .planning/, respect it.
  // This handles linked worktrees with independent planning state (e.g., Conductor workspaces).
  if (fs.existsSync(path.join(cwd, '.planning'))) {
    return cwd;
  }

  // Check if we're in a linked worktree
  const gitDir = execGit(cwd, ['rev-parse', '--git-dir']);
  const commonDir = execGit(cwd, ['rev-parse', '--git-common-dir']);

  if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) return cwd;

  // In a linked worktree, .git is a file pointing to .git/worktrees/<name>
  // and git-common-dir points to the main repo's .git directory
  const gitDirResolved = path.resolve(cwd, gitDir.stdout);
  const commonDirResolved = path.resolve(cwd, commonDir.stdout);

  if (gitDirResolved !== commonDirResolved) {
    // We're in a linked worktree — resolve main worktree root
    // The common dir is the main repo's .git, so its parent is the main worktree root
    return path.dirname(commonDirResolved);
  }

  return cwd;
}

/**
 * Acquire a file-based lock for .planning/ writes.
 * Prevents concurrent worktrees from corrupting shared planning files.
 * Lock is auto-released after the callback completes.
 */
function withPlanningLock(cwd, fn) {
  const lockPath = path.join(planningDir(cwd), '.lock');
  const lockTimeout = 10000; // 10 seconds
  const retryDelay = 100;
  const start = Date.now();

  // Ensure .planning/ exists
  try { fs.mkdirSync(planningDir(cwd), { recursive: true }); } catch { /* ok */ }

  while (Date.now() - start < lockTimeout) {
    try {
      // Atomic create — fails if file exists
      fs.writeFileSync(lockPath, JSON.stringify({
        pid: process.pid,
        cwd,
        acquired: new Date().toISOString(),
      }), { flag: 'wx' });

      // Register for exit-time cleanup so process.exit(1) inside a locked region
      // cannot leave a stale lock file (#1916).
      _heldPlanningLocks.add(lockPath);

      // Lock acquired — run the function
      try {
        return fn();
      } finally {
        _heldPlanningLocks.delete(lockPath);
        try { fs.unlinkSync(lockPath); } catch { /* already released */ }
      }
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock exists — check if stale (>30s old)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            fs.unlinkSync(lockPath);
            continue; // retry
          }
        } catch { continue; }

        // Wait and retry (cross-platform, no shell dependency)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        continue;
      }
      throw err;
    }
  }
  // Timeout — force acquire (stale lock recovery)
  try { fs.unlinkSync(lockPath); } catch { /* ok */ }
  return fn();
}

/**
 * Get the .planning directory path, project- and workstream-aware.
 *
 * Resolution order:
 * 1. If GSD_PROJECT is set (env var or explicit `project` arg), routes to
 *    `.planning/{project}/` — supports multi-project workspaces where several
 *    independent projects share a single `.planning/` root directory (e.g.,
 *    an Obsidian vault or monorepo knowledge base used as a command center).
 * 2. If GSD_WORKSTREAM is set, routes to `.planning/workstreams/{ws}/`.
 * 3. Otherwise returns `.planning/`.
 *
 * GSD_PROJECT and GSD_WORKSTREAM can be combined:
 *   `.planning/{project}/workstreams/{ws}/`
 *
 * @param {string} cwd - project root
 * @param {string} [ws] - explicit workstream name; if omitted, checks GSD_WORKSTREAM env var
 * @param {string} [project] - explicit project name; if omitted, checks GSD_PROJECT env var
 */
function planningDir(cwd, ws, project) {
  if (project === undefined) project = process.env.GSD_PROJECT || null;
  if (ws === undefined) ws = process.env.GSD_WORKSTREAM || null;

  // Reject path separators and traversal components in project/workstream names
  const BAD_SEGMENT = /[/\\]|\.\./;
  if (project && BAD_SEGMENT.test(project)) {
    throw new Error(`GSD_PROJECT contains invalid path characters: ${project}`);
  }
  if (ws && BAD_SEGMENT.test(ws)) {
    throw new Error(`GSD_WORKSTREAM contains invalid path characters: ${ws}`);
  }

  let base = path.join(cwd, '.planning');
  if (project) base = path.join(base, project);
  if (ws) base = path.join(base, 'workstreams', ws);
  return base;
}

/** Always returns the root .planning/ path, ignoring workstreams and projects. For shared resources. */
function planningRoot(cwd) {
  return path.join(cwd, '.planning');
}

// ─── Active Workstream Detection ─────────────────────────────────────────────

function sanitizeWorkstreamSessionToken(value) {
  if (value === null || value === undefined) return null;
  const token = String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return token ? token.slice(0, 160) : null;
}

function probeControllingTtyToken() {
  if (didProbeControllingTtyToken) return cachedControllingTtyToken;
  didProbeControllingTtyToken = true;

  // `tty` reads stdin. When stdin is already non-interactive, spawning it only
  // adds avoidable failures on the routing hot path and cannot reveal a stable token.
  if (!(process.stdin && process.stdin.isTTY)) {
    return cachedControllingTtyToken;
  }

  try {
    const ttyPath = execFileSync('tty', [], {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'ignore'],
    }).trim();
    if (ttyPath && ttyPath !== 'not a tty') {
      const token = sanitizeWorkstreamSessionToken(ttyPath.replace(/^\/dev\//, ''));
      if (token) cachedControllingTtyToken = `tty-${token}`;
    }
  } catch {}

  return cachedControllingTtyToken;
}

function getControllingTtyToken() {
  for (const envKey of ['TTY', 'SSH_TTY']) {
    const token = sanitizeWorkstreamSessionToken(process.env[envKey]);
    if (token) return `tty-${token.replace(/^dev_/, '')}`;
  }

  return probeControllingTtyToken();
}

/**
 * Resolve a deterministic session key for workstream-local routing.
 *
 * Order:
 * 1. Explicit runtime/session env vars (`GSD_SESSION_KEY`, `CODEX_THREAD_ID`, etc.)
 * 2. Terminal identity exposed via `TTY` or `SSH_TTY`
 * 3. One best-effort `tty` probe when stdin is interactive
 * 4. `null`, which tells callers to use the legacy shared pointer fallback
 */
function getWorkstreamSessionKey() {
  for (const envKey of WORKSTREAM_SESSION_ENV_KEYS) {
    const raw = process.env[envKey];
    const token = sanitizeWorkstreamSessionToken(raw);
    if (token) return `${envKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${token}`;
  }

  return getControllingTtyToken();
}

function getSessionScopedWorkstreamFile(cwd) {
  const sessionKey = getWorkstreamSessionKey();
  if (!sessionKey) return null;

  // Use realpathSync.native so the hash is derived from the canonical filesystem
  // path. On Windows, path.resolve returns whatever case the caller supplied,
  // while realpathSync.native returns the case the OS recorded — they differ on
  // case-insensitive NTFS, producing different hashes and different tmpdir slots.
  // Fall back to path.resolve when the directory does not yet exist.
  let planningAbs;
  try {
    planningAbs = fs.realpathSync.native(planningRoot(cwd));
  } catch {
    planningAbs = path.resolve(planningRoot(cwd));
  }
  const projectId = crypto
    .createHash('sha1')
    .update(planningAbs)
    .digest('hex')
    .slice(0, 16);

  const dirPath = path.join(os.tmpdir(), 'gsd-workstream-sessions', projectId);
  return {
    sessionKey,
    dirPath,
    filePath: path.join(dirPath, sessionKey),
  };
}

function clearActiveWorkstreamPointer(filePath, cleanupDirPath) {
  try { fs.unlinkSync(filePath); } catch {}

  // Session-scoped pointers for a repo share one tmp directory. Only remove it
  // when it is empty so clearing or self-healing one session never deletes siblings.
  // Explicitly check remaining entries rather than relying on rmdirSync throwing
  // ENOTEMPTY — that error is not raised reliably on Windows.
  if (cleanupDirPath) {
    try {
      const remaining = fs.readdirSync(cleanupDirPath);
      if (remaining.length === 0) {
        fs.rmdirSync(cleanupDirPath);
      }
    } catch {}
  }
}

/**
 * Pointer files are self-healing: invalid names or deleted-workstream pointers
 * are removed on read so the session falls back to `null` instead of carrying
 * silent stale state forward. Session-scoped callers may also prune an empty
 * per-project tmp directory; shared `.planning/active-workstream` callers do not.
 */
function readActiveWorkstreamPointer(filePath, cwd, cleanupDirPath = null) {
  try {
    const name = fs.readFileSync(filePath, 'utf-8').trim();
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      clearActiveWorkstreamPointer(filePath, cleanupDirPath);
      return null;
    }
    const wsDir = path.join(planningRoot(cwd), 'workstreams', name);
    if (!fs.existsSync(wsDir)) {
      clearActiveWorkstreamPointer(filePath, cleanupDirPath);
      return null;
    }
    return name;
  } catch {
    return null;
  }
}

/**
 * Get the active workstream name.
 *
 * Resolution priority:
 * 1. Session-scoped pointer (tmpdir) when the runtime exposes a stable session key
 * 2. Legacy shared `.planning/active-workstream` file when no session key is available
 *
 * The shared file is intentionally ignored when a session key exists so multiple
 * concurrent sessions do not overwrite each other's active workstream.
 */
function getActiveWorkstream(cwd) {
  const sessionScoped = getSessionScopedWorkstreamFile(cwd);
  if (sessionScoped) {
    return readActiveWorkstreamPointer(sessionScoped.filePath, cwd, sessionScoped.dirPath);
  }

  const sharedFilePath = path.join(planningRoot(cwd), 'active-workstream');
  return readActiveWorkstreamPointer(sharedFilePath, cwd);
}

/**
 * Set the active workstream. Pass null to clear.
 *
 * When a stable session key is available, this updates a tmpdir-backed
 * session-scoped pointer. Otherwise it falls back to the legacy shared
 * `.planning/active-workstream` file for backward compatibility.
 */
function setActiveWorkstream(cwd, name) {
  const sessionScoped = getSessionScopedWorkstreamFile(cwd);
  const filePath = sessionScoped
    ? sessionScoped.filePath
    : path.join(planningRoot(cwd), 'active-workstream');

  if (!name) {
    clearActiveWorkstreamPointer(filePath, sessionScoped ? sessionScoped.dirPath : null);
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Invalid workstream name: must be alphanumeric, hyphens, and underscores only');
  }

  if (sessionScoped) {
    fs.mkdirSync(sessionScoped.dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, name + '\n', 'utf-8');
}

// ─── Phase utilities ──────────────────────────────────────────────────────────

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePhaseName(phase) {
  const str = String(phase);
  // Strip optional project_code prefix (e.g., 'CK-01' → '01')
  const stripped = str.replace(/^[A-Z]{1,6}-(?=\d)/, '');
  // Standard numeric phases: 1, 01, 12A, 12.1
  const match = stripped.match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (match) {
    const padded = match[1].padStart(2, '0');
    // Preserve original case of letter suffix (#1962).
    // Uppercasing causes directory/roadmap mismatches on case-sensitive filesystems
    // (e.g., "16c" in ROADMAP.md → directory "16C-name" → progress can't match).
    const letter = match[2] || '';
    const decimal = match[3] || '';
    return padded + letter + decimal;
  }
  // Custom phase IDs (e.g. PROJ-42, AUTH-101): return as-is
  return str;
}

function comparePhaseNum(a, b) {
  // Strip optional project_code prefix before comparing (e.g., 'CK-01-name' → '01-name')
  const sa = String(a).replace(/^[A-Z]{1,6}-/, '');
  const sb = String(b).replace(/^[A-Z]{1,6}-/, '');
  const pa = sa.match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  const pb = sb.match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  // If either is non-numeric (custom ID), fall back to string comparison
  if (!pa || !pb) return String(a).localeCompare(String(b));
  const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
  if (intDiff !== 0) return intDiff;
  // No letter sorts before letter: 12 < 12A < 12B
  const la = (pa[2] || '').toUpperCase();
  const lb = (pb[2] || '').toUpperCase();
  if (la !== lb) {
    if (!la) return -1;
    if (!lb) return 1;
    return la < lb ? -1 : 1;
  }
  // Segment-by-segment decimal comparison: 12A < 12A.1 < 12A.1.2 < 12A.2
  const aDecParts = pa[3] ? pa[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const bDecParts = pb[3] ? pb[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const maxLen = Math.max(aDecParts.length, bDecParts.length);
  if (aDecParts.length === 0 && bDecParts.length > 0) return -1;
  if (bDecParts.length === 0 && aDecParts.length > 0) return 1;
  for (let i = 0; i < maxLen; i++) {
    const av = Number.isFinite(aDecParts[i]) ? aDecParts[i] : 0;
    const bv = Number.isFinite(bDecParts[i]) ? bDecParts[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Extract the phase token from a directory name.
 * Supports: '01-name', '1009A-name', '999.6-name', 'CK-01-name', 'PROJ-42-name'.
 * Returns the token portion (e.g. '01', '1009A', '999.6', 'PROJ-42') or the full name if no separator.
 */
function extractPhaseToken(dirName) {
  // Try project-code-prefixed numeric: CK-01-name → CK-01, CK-01A.2-name → CK-01A.2
  const codePrefixed = dirName.match(/^([A-Z]{1,6}-\d+[A-Z]?(?:\.\d+)*)(?:-|$)/i);
  if (codePrefixed) return codePrefixed[1];
  // Try plain numeric: 01-name, 1009A-name, 999.6-name
  const numeric = dirName.match(/^(\d+[A-Z]?(?:\.\d+)*)(?:-|$)/i);
  if (numeric) return numeric[1];
  // Custom IDs: PROJ-42-name → everything before the last segment that looks like a name
  const custom = dirName.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)(?:-[a-z]|$)/i);
  if (custom) return custom[1];
  return dirName;
}

/**
 * Check if a directory name's phase token matches the normalized phase exactly.
 * Case-insensitive comparison for the token portion.
 */
function phaseTokenMatches(dirName, normalized) {
  const token = extractPhaseToken(dirName);
  if (token.toUpperCase() === normalized.toUpperCase()) return true;
  // Strip optional project_code prefix from dir and retry
  const stripped = dirName.replace(/^[A-Z]{1,6}-(?=\d)/i, '');
  if (stripped !== dirName) {
    const strippedToken = extractPhaseToken(stripped);
    if (strippedToken.toUpperCase() === normalized.toUpperCase()) return true;
  }
  return false;
}

function searchPhaseInDir(baseDir, relBase, normalized) {
  try {
    const dirs = readSubdirectories(baseDir, true);
    // Match: exact phase token comparison (not prefix matching)
    const match = dirs.find(d => phaseTokenMatches(d, normalized));
    if (!match) return null;

    // Extract phase number and name — supports numeric (01-name), project-code-prefixed (CK-01-name), and custom (PROJ-42-name)
    const dirMatch = match.match(/^(?:[A-Z]{1,6}-)(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i)
      || match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i)
      || match.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-(.+)/i)
      || [null, match, null];
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir = path.join(baseDir, match);
    const { plans: unsortedPlans, summaries: unsortedSummaries, hasResearch, hasContext, hasVerification, hasReviews } = getPhaseFileStats(phaseDir);
    const plans = unsortedPlans.sort();
    const summaries = unsortedSummaries.sort();

    const completedPlanIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompletePlans = plans.filter(p => {
      const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    return {
      found: true,
      directory: toPosixPath(path.join(relBase, match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      plans,
      summaries,
      incomplete_plans: incompletePlans,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
      has_reviews: hasReviews,
    };
  } catch {
    return null;
  }
}

function findPhaseInternal(cwd, phase) {
  if (!phase) return null;

  const planningRoot = _resolvePlanningRootSoft(cwd);
  const phasesDir = path.join(cwd, planningRoot, 'phases');
  const normalized = normalizePhaseName(phase);

  // Search current phases first
  const current = searchPhaseInDir(phasesDir, planningRoot + '/phases', normalized);
  if (current) return current;

  // Search archived milestone phases (newest first)
  const milestonesDir = path.join(cwd, planningRoot, 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = planningRoot + '/milestones/' + archiveName;
      const result = searchPhaseInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch { /* intentionally empty */ }

  return null;
}

function getArchivedPhaseDirs(cwd) {
  const planningRoot = _resolvePlanningRootSoft(cwd);
  const milestonesDir = path.join(cwd, planningRoot, 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    // Find v*-phases directories, sort newest first
    const phaseDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of phaseDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const dirs = readSubdirectories(archivePath, true);

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join(planningRoot, 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch { /* intentionally empty */ }

  return results;
}

// ─── Roadmap milestone scoping ───────────────────────────────────────────────

/**
 * Strip shipped milestone content wrapped in <details> blocks.
 * Used to isolate current milestone phases when searching ROADMAP.md
 * for phase headings or checkboxes — prevents matching archived milestone
 * phases that share the same numbers as current milestone phases.
 */
function stripShippedMilestones(content) {
  return content.replace(/<details>[\s\S]*?<\/details>/gi, '');
}

/**
 * Extract the current milestone section from ROADMAP.md by positive lookup.
 *
 * Instead of stripping <details> blocks (negative heuristic that breaks if
 * agents wrap the current milestone in <details>), this finds the section
 * matching the current milestone version and returns only that content.
 *
 * Falls back to stripShippedMilestones() if:
 * - cwd is not provided
 * - STATE.md doesn't exist or has no milestone field
 * - Version can't be found in ROADMAP.md
 *
 * @param {string} content - Full ROADMAP.md content
 * @param {string} [cwd] - Working directory for reading STATE.md
 * @returns {string} Content scoped to current milestone
 */
function extractCurrentMilestone(content, cwd) {
  if (!cwd) return stripShippedMilestones(content);

  // 1. Get current milestone version from STATE.md frontmatter
  let version = null;
  try {
    const statePath = path.join(planningDir(cwd), 'STATE.md');
    if (fs.existsSync(statePath)) {
      const stateRaw = fs.readFileSync(statePath, 'utf-8');
      const milestoneMatch = stateRaw.match(/^milestone:\s*(.+)/m);
      if (milestoneMatch) {
        version = milestoneMatch[1].trim();
      }
    }
  } catch {}

  // 2. Fallback: derive version from getMilestoneInfo pattern in ROADMAP.md itself
  if (!version) {
    // Check for 🚧 in-progress marker
    const inProgressMatch = content.match(/🚧\s*\*\*v(\d+\.\d+)\s/);
    if (inProgressMatch) {
      version = 'v' + inProgressMatch[1];
    }
  }

  if (!version) return stripShippedMilestones(content);

  // 3. Find the section matching this version
  // Match headings like: ## Roadmap v3.0: Name, ## v3.0 Name, etc.
  const escapedVersion = escapeRegex(version);
  const sectionPattern = new RegExp(
    `(^#{1,3}\\s+.*${escapedVersion}[^\\n]*)`,
    'mi'
  );
  const sectionMatch = content.match(sectionPattern);

  if (!sectionMatch) return stripShippedMilestones(content);

  const sectionStart = sectionMatch.index;

  // Find the end: next milestone heading at same or higher level, or EOF
  // Milestone headings look like: ## v2.0, ## Roadmap v2.0, ## ✅ v1.0, etc.
  const headingLevel = sectionMatch[1].match(/^(#{1,3})\s/)[1].length;
  const restContent = content.slice(sectionStart + sectionMatch[0].length);
  const nextMilestonePattern = new RegExp(
    `^#{1,${headingLevel}}\\s+(?:.*v\\d+\\.\\d+|✅|📋|🚧)`,
    'mi'
  );
  const nextMatch = restContent.match(nextMilestonePattern);

  let sectionEnd;
  if (nextMatch) {
    sectionEnd = sectionStart + sectionMatch[0].length + nextMatch.index;
  } else {
    sectionEnd = content.length;
  }

  // Return everything before the current milestone section (non-milestone content
  // like title, overview) plus the current milestone section
  const beforeMilestones = content.slice(0, sectionStart);
  const currentSection = content.slice(sectionStart, sectionEnd);

  // Also include any content before the first milestone heading (title, overview, etc.)
  // but strip any <details> blocks in it (these are definitely shipped)
  const preamble = beforeMilestones.replace(/<details>[\s\S]*?<\/details>/gi, '');

  return preamble + currentSection;
}

/**
 * Replace a pattern only in the current milestone section of ROADMAP.md
 * (everything after the last </details> close tag). Used for write operations
 * that must not accidentally modify archived milestone checkboxes/tables.
 */
function replaceInCurrentMilestone(content, pattern, replacement) {
  const lastDetailsClose = content.lastIndexOf('</details>');
  if (lastDetailsClose === -1) {
    return content.replace(pattern, replacement);
  }
  const offset = lastDetailsClose + '</details>'.length;
  const before = content.slice(0, offset);
  const after = content.slice(offset);
  return before + after.replace(pattern, replacement);
}

// ─── Roadmap & model utilities ────────────────────────────────────────────────

function getRoadmapPhaseInternal(cwd, phaseNum) {
  if (!phaseNum) return null;
  const planningRoot = _resolvePlanningRootSoft(cwd);
  const roadmapPath = path.join(cwd, planningRoot, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = extractCurrentMilestone(fs.readFileSync(roadmapPath, 'utf-8'), cwd);
    const escapedPhase = escapeRegex(phaseNum.toString());
    // Match both numeric (Phase 1:) and custom (Phase PROJ-42:) headers
    const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
    const headerMatch = content.match(phasePattern);
    if (!headerMatch) return null;

    const phaseName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+[\w]/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(/\*\*Goal(?:\*\*:|\*?\*?:\*\*)\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    return {
      found: true,
      phase_number: phaseNum.toString(),
      phase_name: phaseName,
      goal,
      section,
    };
  } catch {
    return null;
  }
}

// ─── Agent installation validation (#1371) ───────────────────────────────────

/**
 * Resolve the agents directory from the GSD install location.
 * gsd-tools.cjs lives at <configDir>/get-shit-done/bin/gsd-tools.cjs,
 * so agents/ is at <configDir>/agents/.
 *
 * GSD_AGENTS_DIR env var overrides the default path. Used in tests and for
 * installs where the agents directory is not co-located with gsd-tools.cjs.
 *
 * @returns {string} Absolute path to the agents directory
 */
function getAgentsDir() {
  if (process.env.GSD_AGENTS_DIR) {
    return process.env.GSD_AGENTS_DIR;
  }
  // __dirname is get-shit-done/bin/lib/ → go up 3 levels to configDir
  return path.join(__dirname, '..', '..', '..', 'agents');
}

/**
 * Check which GSD agents are installed on disk.
 * Returns an object with installation status and details.
 *
 * Recognises both standard format (gsd-planner.md) and Copilot format
 * (gsd-planner.agent.md). Copilot renames agent files during install (#1512).
 *
 * @returns {{ agents_installed: boolean, missing_agents: string[], installed_agents: string[], agents_dir: string }}
 */
function checkAgentsInstalled() {
  const agentsDir = getAgentsDir();
  const expectedAgents = Object.keys(MODEL_PROFILES);
  const installed = [];
  const missing = [];

  if (!fs.existsSync(agentsDir)) {
    return {
      agents_installed: false,
      missing_agents: expectedAgents,
      installed_agents: [],
      agents_dir: agentsDir,
    };
  }

  for (const agent of expectedAgents) {
    // Check both .md (standard) and .agent.md (Copilot) file formats.
    const agentFile = path.join(agentsDir, `${agent}.md`);
    const agentFileCopilot = path.join(agentsDir, `${agent}.agent.md`);
    if (fs.existsSync(agentFile) || fs.existsSync(agentFileCopilot)) {
      installed.push(agent);
    } else {
      missing.push(agent);
    }
  }

  return {
    agents_installed: installed.length > 0 && missing.length === 0,
    missing_agents: missing,
    installed_agents: installed,
    agents_dir: agentsDir,
  };
}

// ─── Model alias resolution ───────────────────────────────────────────────────

/**
 * Map short model aliases to full model IDs.
 * Updated each release to match current model versions.
 * Users can override with model_overrides in config.json for custom/latest models.
 */
const MODEL_ALIAS_MAP = {
  'opus': 'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku': 'claude-haiku-4-5',
};

function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);

  // Check per-agent override first — always respected regardless of resolve_model_ids.
  // Users who set fully-qualified model IDs (e.g., "openai/gpt-5.4") get exactly that.
  const override = config.model_overrides?.[agentType];
  if (override) {
    return override;
  }

  // resolve_model_ids: "omit" — return empty string so the runtime uses its configured
  // default model. For non-Claude runtimes (OpenCode, Codex, etc.) that don't recognize
  // Claude aliases (opus/sonnet/haiku/inherit). Set automatically during install. See #1156.
  if (config.resolve_model_ids === 'omit') {
    return '';
  }

  // Fall back to profile lookup
  const profile = String(config.model_profile || 'balanced').toLowerCase();
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) return 'sonnet';
  if (profile === 'inherit') return 'inherit';
  const alias = agentModels[profile] || agentModels['balanced'] || 'sonnet';

  // resolve_model_ids: true — map alias to full Claude model ID
  // Prevents 404s when the Task tool passes aliases directly to the API
  if (config.resolve_model_ids) {
    return MODEL_ALIAS_MAP[alias] || alias;
  }

  return alias;
}

// ─── Summary body helpers ─────────────────────────────────────────────────

/**
 * Extract a one-liner from the summary body when it's not in frontmatter.
 * The summary template defines one-liner as a bold markdown line after the heading:
 *   # Phase X: Name Summary
 *   **[substantive one-liner text]**
 */
function extractOneLinerFromBody(content) {
  if (!content) return null;
  // Strip frontmatter first
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  // Find the first **...** line after a # heading
  const match = body.match(/^#[^\n]*\n+\*\*([^*]+)\*\*/m);
  return match ? match[1].trim() : null;
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

function pathExistsInternal(cwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

function getMilestoneInfo(cwd) {
  try {
    const planningRoot = _resolvePlanningRootSoft(cwd);
    const roadmap = fs.readFileSync(path.join(cwd, planningRoot, 'ROADMAP.md'), 'utf-8');

    // First: check for list-format roadmaps using 🚧 (in-progress) marker
    // e.g. "- 🚧 **v2.1 Belgium** — Phases 24-28 (in progress)"
    // e.g. "- 🚧 **v1.2.1 Tech Debt** — Phases 1-8 (in progress)"
    const inProgressMatch = roadmap.match(/🚧\s*\*\*v(\d+(?:\.\d+)+)\s+([^*]+)\*\*/);
    if (inProgressMatch) {
      return {
        version: 'v' + inProgressMatch[1],
        name: inProgressMatch[2].trim(),
      };
    }

    // Second: heading-format roadmaps — strip shipped milestones in <details> blocks
    const cleaned = stripShippedMilestones(roadmap);
    // Extract version and name from the same ## heading for consistency
    // Supports 2+ segment versions: v1.2, v1.2.1, v2.0.1, etc.
    const headingMatch = cleaned.match(/## .*v(\d+(?:\.\d+)+)[:\s]+([^\n(]+)/);
    if (headingMatch) {
      return {
        version: 'v' + headingMatch[1],
        name: headingMatch[2].trim(),
      };
    }
    // Fallback: try bare version match (greedy — capture longest version string)
    const versionMatch = cleaned.match(/v(\d+(?:\.\d+)+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}

/**
 * Returns a filter function that checks whether a phase directory belongs
 * to the current milestone based on ROADMAP.md phase headings.
 * If no ROADMAP exists or no phases are listed, returns a pass-all filter.
 */
function getMilestonePhaseFilter(cwd) {
  const milestonePhaseNums = new Set();
  try {
    const planningRoot = _resolvePlanningRootSoft(cwd);
    const roadmap = extractCurrentMilestone(fs.readFileSync(path.join(cwd, planningRoot, 'ROADMAP.md'), 'utf-8'), cwd);
    // Match both numeric phases (Phase 1:) and custom IDs (Phase PROJ-42:)
    const phasePattern = /#{2,4}\s*Phase\s+([\w][\w.-]*)\s*:/gi;
    let m;
    while ((m = phasePattern.exec(roadmap)) !== null) {
      milestonePhaseNums.add(m[1]);
    }
  } catch { /* intentionally empty */ }

  if (milestonePhaseNums.size === 0) {
    const passAll = () => true;
    passAll.phaseCount = 0;
    return passAll;
  }

  const normalized = new Set(
    [...milestonePhaseNums].map(n => (n.replace(/^0+/, '') || '0').toLowerCase())
  );

  function isDirInMilestone(dirName) {
    // Try numeric match first
    const m = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
    if (m && normalized.has(m[1].toLowerCase())) return true;
    // Try custom ID match (e.g. PROJ-42-description → PROJ-42)
    const customMatch = dirName.match(/^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)/);
    if (customMatch && normalized.has(customMatch[1].toLowerCase())) return true;
    return false;
  }
  isDirInMilestone.phaseCount = milestonePhaseNums.size;
  return isDirInMilestone;
}

// --- Planning Root Resolution -----------------------------------------------

let _planningRootCache = {};

/**
 * Single chokepoint for all path resolution. Returns the user-qualified
 * planning directory string (e.g., `.planning/users/dan-halem/frontend`).
 */
function getPlanningRoot(cwd) {
  if (_planningRootCache[cwd]) return _planningRootCache[cwd];

  // 1. CI/CD detection (hard error, first check)
  const ciVars = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'];
  if (ciVars.some(v => process.env[v])) {
    error('GSD Error: CI/CD environment detected. GSD is not supported in CI.');
  }

  // 2. Old flat structure detection (actionable migration instructions)
  if (fs.existsSync(path.join(cwd, '.planning', 'PROJECT.md')) &&
      !fs.existsSync(path.join(cwd, '.planning', 'users'))) {
    error('GSD Error: Legacy .planning/ structure detected.\n\nRun: /gsd:migrate to auto-migrate your project to the multi-user structure.\nOr run: gsd-tools.cjs migrate --auto to migrate from the command line.\n\nThis will move your files to .planning/users/<your-user>/<project-name>/ and set up the active project context.');
  }

  // 2b. Flat .planning/ fallback — when .planning/ exists but has no users/
  // directory AND no PROJECT.md (which is caught above), treat .planning/ as
  // the planning root directly.  This supports upstream flat-structure tests
  // and simple single-user repos that haven't migrated to multi-user yet.
  if (fs.existsSync(path.join(cwd, '.planning')) &&
      !fs.existsSync(path.join(cwd, '.planning', 'users'))) {
    const flat = '.planning';
    _planningRootCache[cwd] = flat;
    return flat;
  }

  // 3. Delegate to context.cjs (lazy require)
  // CRITICAL: require('./context.cjs') is LAZY (inside function body).
  // Moving it to module scope causes circular dependency crash.
  // context.cjs requires core.cjs at its top level.
  const { resolveContext } = require('./context.cjs');
  const ctx = resolveContext(cwd);

  // resolveContext may return null project/planning_root when no active project
  if (!ctx.planning_root) {
    error('GSD Error: No active project. Run /gsd:new-project to create one, or /gsd:switch to select one.');
  }

  _planningRootCache[cwd] = ctx.planning_root;
  return ctx.planning_root;
}

/**
 * Safe wrapper for init commands that may run before a project exists.
 * Returns { active_user, active_project, planning_root } with null fields
 * on graceful failure. CI/CD and old-structure errors still propagate as
 * hard errors.
 */
function tryGetPlanningContext(cwd) {
  // CI/CD check (hard error - these are always fatal)
  const ciVars = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'];
  if (ciVars.some(v => process.env[v])) {
    error('GSD Error: CI/CD environment detected. GSD is not supported in CI.');
  }
  // Old structure check — return legacy_detected flag instead of hard error
  if (fs.existsSync(path.join(cwd, '.planning', 'PROJECT.md')) &&
      !fs.existsSync(path.join(cwd, '.planning', 'users'))) {
    return { active_user: null, active_project: null, planning_root: null, legacy_detected: true };
  }

  // Soft resolution -- return nulls instead of hard erroring
  const { resolveIdentity } = require('./identity.cjs');
  const { readActiveContext } = require('./context.cjs');

  const identity = resolveIdentity(cwd);
  if (!identity) {
    return { active_user: null, active_project: null, planning_root: null };
  }

  const user = identity.slug;
  const envProject = process.env.GSD_PROJECT;
  let project = null;
  let planning_root = null;

  if (envProject) {
    const projectDir = path.join(cwd, '.planning', 'users', user, envProject);
    if (fs.existsSync(projectDir)) {
      project = envProject;
    }
  } else {
    const active = readActiveContext(cwd, user);
    if (active && active.project) {
      const projectDir = path.join(cwd, '.planning', 'users', user, active.project);
      if (fs.existsSync(projectDir)) {
        project = active.project;
      }
    }

    // LIFE-05: auto-select when exactly one project exists and no .active resolved
    if (!project) {
      const userDir = path.join(cwd, '.planning', 'users', user);
      try {
        const entries = fs.readdirSync(userDir, { withFileTypes: true });
        const projects = entries
          .filter(e => e.isDirectory() && e.name !== '_archived' && !e.name.startsWith('.'))
          .map(e => e.name);
        if (projects.length === 1) {
          project = projects[0];
        }
      } catch {}
    }
  }

  if (project) {
    planning_root = toPosixPath(path.join('.planning', 'users', user, project));
  }

  return { active_user: user, active_project: project, planning_root };
}

function clearPlanningRootCache() {
  _planningRootCache = {};
}

/**
 * planningPaths — convenience wrapper that delegates to getPlanningRoot.
 * Returns common .planning file paths, multi-user-aware.
 * Upstream code calls this extensively; it now routes through our multi-user resolution.
 */
function planningPaths(cwd) {
  const planningRoot = getPlanningRoot(cwd);
  const base = path.join(cwd, planningRoot);
  const root = path.join(cwd, '.planning');
  return {
    planning: base,
    state: path.join(base, 'STATE.md'),
    roadmap: path.join(base, 'ROADMAP.md'),
    project: path.join(root, 'PROJECT.md'),
    config: path.join(root, 'config.json'),
    phases: path.join(base, 'phases'),
    requirements: path.join(base, 'REQUIREMENTS.md'),
  };
}

// ─── Phase file helpers ──────────────────────────────────────────────────────

/** Filter a file list to just PLAN.md / *-PLAN.md entries. */
function filterPlanFiles(files) {
  return files.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
}

/** Filter a file list to just SUMMARY.md / *-SUMMARY.md entries. */
function filterSummaryFiles(files) {
  return files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
}

/**
 * Read a phase directory and return counts/flags for common file types.
 * Returns an object with plans[], summaries[], and boolean flags for
 * research/context/verification files.
 */
function getPhaseFileStats(phaseDir) {
  const files = fs.readdirSync(phaseDir);
  return {
    plans: filterPlanFiles(files),
    summaries: filterSummaryFiles(files),
    hasResearch: files.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md'),
    hasContext: files.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md'),
    hasVerification: files.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'),
    hasReviews: files.some(f => f.endsWith('-REVIEWS.md') || f === 'REVIEWS.md'),
  };
}

/**
 * Read immediate child directories from a path.
 * Returns [] if the path doesn't exist or can't be read.
 * Pass sort=true to apply comparePhaseNum ordering.
 */
function readSubdirectories(dirPath, sort = false) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    return sort ? dirs.sort((a, b) => comparePhaseNum(a, b)) : dirs;
  } catch {
    return [];
  }
}

// ─── Atomic file writes ───────────────────────────────────────────────────────

/**
 * Write a file atomically using write-to-temp-then-rename.
 *
 * On POSIX systems, `fs.renameSync` is atomic when the source and destination
 * are on the same filesystem. This prevents a process killed mid-write from
 * leaving a truncated file that is unparseable on next read.
 *
 * The temp file is placed alongside the target so it is guaranteed to be on
 * the same filesystem (required for rename atomicity). The PID is embedded in
 * the temp file name so concurrent writers use distinct paths.
 *
 * If `renameSync` fails (e.g. cross-device move), the function falls back to a
 * direct `writeFileSync` so callers always get a best-effort write.
 *
 * @param {string} filePath  Absolute path to write.
 * @param {string|Buffer} content  File content.
 * @param {string} [encoding='utf-8']  Encoding passed to writeFileSync.
 */
function atomicWriteFileSync(filePath, content, encoding = 'utf-8') {
  const tmpPath = filePath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpPath, content, encoding);
    fs.renameSync(tmpPath, filePath);
  } catch (renameErr) {
    // Clean up the temp file if rename failed, then fall back to direct write.
    try { fs.unlinkSync(tmpPath); } catch { /* already gone or never created */ }
    fs.writeFileSync(filePath, content, encoding);
  }
}

/**
 * Format a Date as a fuzzy relative time string (e.g. "5 minutes ago").
 * @param {Date} date
 * @returns {string}
 */
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  if (years === 1) return '1 year ago';
  return `${years} years ago`;
}

module.exports = {
  MODEL_PROFILES,
  ENV_KEY_MAP,
  CONFIG_DEFAULTS,
  output,
  error,
  safeReadFile,
  loadConfig,
  cmdConfigResolve,
  isGitIgnored,
  execGit,
  normalizeMd,
  escapeRegex,
  normalizePhaseName,
  comparePhaseNum,
  searchPhaseInDir,
  extractPhaseToken,
  phaseTokenMatches,
  findPhaseInternal,
  getArchivedPhaseDirs,
  getRoadmapPhaseInternal,
  resolveModelInternal,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  getMilestonePhaseFilter,
  stripShippedMilestones,
  extractCurrentMilestone,
  replaceInCurrentMilestone,
  toPosixPath,
  getPlanningRoot,
  tryGetPlanningContext,
  clearPlanningRootCache,
  planningPaths,
  extractOneLinerFromBody,
  resolveWorktreeRoot,
  withPlanningLock,
  findProjectRoot,
  detectSubRepos,
  reapStaleTempFiles,
  GSD_TEMP_DIR,
  MODEL_ALIAS_MAP,
  planningDir,
  planningRoot,
  getActiveWorkstream,
  setActiveWorkstream,
  filterPlanFiles,
  filterSummaryFiles,
  getPhaseFileStats,
  readSubdirectories,
  getAgentsDir,
  checkAgentsInstalled,
  atomicWriteFileSync,
  timeAgo,
};
