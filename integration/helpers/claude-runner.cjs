'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const DEFAULT_TIMEOUT = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

// Transient error patterns worth retrying
const TRANSIENT_PATTERNS = [
  /overloaded/i,
  /rate.?limit/i,
  /529/,
  /5\d{2}/,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /socket hang up/i,
];

function isTransientError(err) {
  const msg = (err.stderr?.toString() || '') + (err.message || '');
  return TRANSIENT_PATTERNS.some(p => p.test(msg));
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait — no async in execFileSync context */ }
}

// Pre-flight: verify claude binary is available (run once at module load)
let _claudeVerified = false;
function ensureClaudeBinary() {
  if (_claudeVerified) return;
  try {
    execFileSync(CLAUDE_BIN, ['--version'], { stdio: 'pipe', timeout: 10_000 });
    _claudeVerified = true;
  } catch {
    throw new Error(`Claude binary not found at: ${CLAUDE_BIN}. Install with: npm install -g @anthropic-ai/claude-code`);
  }
}

/**
 * Run claude CLI with given arguments.
 * Returns { success, output, error }.
 * Retries up to MAX_RETRIES times on transient errors (5xx, timeouts, rate limits).
 */
function runClaude(args, opts = {}) {
  ensureClaudeBinary();
  const cwd = opts.cwd || process.env.TEST_TMPDIR || process.cwd();
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  const maxRetries = opts.retries ?? MAX_RETRIES;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = execFileSync(CLAUDE_BIN, args, {
        cwd,
        timeout,
        encoding: 'utf-8',
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, output: result.trim(), error: '' };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientError(err)) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        sleep(delay);
        continue;
      }
      return {
        success: false,
        output: err.stdout?.toString().trim() || '',
        error: err.stderr?.toString().trim() || err.message,
      };
    }
  }
  // Should not reach here, but safety net
  return {
    success: false,
    output: lastErr?.stdout?.toString().trim() || '',
    error: lastErr?.stderr?.toString().trim() || lastErr?.message || 'Unknown error after retries',
  };
}

/**
 * Create a temp project directory with git init and .planning/users structure.
 * Returns the directory path.
 */
function createTestProject(name, opts = {}) {
  const base = process.env.TEST_TMPDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-int-'));
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'pipe' });
  if (opts.multiUser) {
    const userSlug = opts.userSlug || 'test-user';
    const projectName = opts.projectName || 'test-project';
    fs.mkdirSync(path.join(dir, '.planning', 'users', userSlug, projectName, 'phases'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'users', userSlug, '.active'),
      JSON.stringify({ project: projectName })
    );
    fs.writeFileSync(
      path.join(dir, '.planning', 'user-map.json'),
      JSON.stringify({ _schema: 1, 'test@test.com': userSlug })
    );
    fs.writeFileSync(
      path.join(dir, '.planning', 'PROJECT.md'),
      `# Project\n\nMulti-user monorepo.\n`
    );
  }
  return dir;
}

/**
 * Get the repo root directory. Under Bazel with tags=["local"], tests run
 * in the execroot which symlinks to the source tree, so process.cwd() or
 * BUILD_WORKSPACE_DIRECTORY gives access to repo sources.
 * Outside Bazel, process.cwd() is the repo root.
 */
function getRepoRoot() {
  if (process.env.BUILD_WORKSPACE_DIRECTORY) {
    return process.env.BUILD_WORKSPACE_DIRECTORY;
  }
  // Under Bazel js_test, cwd is the runfiles tree. Resolve the real repo root
  // by walking up from this file's location to find the git root.
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path.resolve(__dirname, '..', '..'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (root) return root;
  } catch { /* fall through */ }
  return process.cwd();
}

/**
 * Run gsd-tools.cjs with given arguments.
 * Returns { success, output, error, json } — json is parsed JSON if output is valid JSON, null otherwise.
 */
function runGsdTools(args, opts = {}) {
  const repoRoot = getRepoRoot();
  const toolsPath = path.join(repoRoot, 'get-shit-done', 'bin', 'gsd-tools.cjs');
  const cwd = opts.cwd || process.cwd();
  const timeout = opts.timeout || 30_000;
  try {
    const result = execFileSync('node', [toolsPath, ...args], {
      cwd,
      timeout,
      encoding: 'utf-8',
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = result.trim();
    let json = null;
    try { json = JSON.parse(trimmed); } catch {}
    return { success: true, output: trimmed, error: '', json };
  } catch (err) {
    const stdout = err.stdout?.toString().trim() || '';
    let json = null;
    try { json = JSON.parse(stdout); } catch {}
    return {
      success: false,
      output: stdout,
      error: err.stderr?.toString().trim() || err.message,
      json,
    };
  }
}

/**
 * Run claude CLI with tool use enabled (non-interactive).
 * Uses --dangerously-skip-permissions so Claude can execute tools (Bash, Read, etc.)
 * without interactive prompts. Returns structured JSON output.
 *
 * Returns { success, result, turns, cost, duration_ms, raw }
 *   - result: Claude's final text output
 *   - turns: number of tool-use turns (shows Claude actually used tools)
 *   - cost: total API cost in USD
 *   - raw: full parsed JSON response
 */
function runClaudeWithTools(prompt, opts = {}) {
  ensureClaudeBinary();
  const cwd = opts.cwd || process.cwd();
  const timeout = opts.timeout || 300_000; // 5 min default — skills take time
  const maxBudget = opts.maxBudget || 5;
  const args = [
    '--print',
    '--dangerously-skip-permissions',
    '--output-format', 'json',
    '--max-budget-usd', String(maxBudget),
  ];
  if (opts.allowedTools) {
    args.push('--allowedTools', ...opts.allowedTools);
  }
  try {
    const result = execFileSync(CLAUDE_BIN, args, {
      cwd,
      timeout,
      encoding: 'utf-8',
      input: prompt,
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = result.trim();
    let parsed = null;
    try { parsed = JSON.parse(trimmed); } catch {}
    if (parsed) {
      return {
        success: parsed.subtype === 'success',
        result: parsed.result || '',
        turns: parsed.num_turns || 0,
        cost: parsed.total_cost_usd || 0,
        duration_ms: parsed.duration_ms || 0,
        raw: parsed,
      };
    }
    return { success: true, result: trimmed, turns: 0, cost: 0, duration_ms: 0, raw: null };
  } catch (err) {
    const stdout = err.stdout?.toString().trim() || '';
    let parsed = null;
    try { parsed = JSON.parse(stdout); } catch {}
    return {
      success: false,
      result: parsed?.result || stdout,
      turns: parsed?.num_turns || 0,
      cost: parsed?.total_cost_usd || 0,
      duration_ms: parsed?.duration_ms || 0,
      raw: parsed,
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

module.exports = { runClaude, runClaudeWithTools, runGsdTools, createTestProject, getRepoRoot, CLAUDE_BIN, DEFAULT_TIMEOUT };
