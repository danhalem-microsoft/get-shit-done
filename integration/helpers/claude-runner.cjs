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
 * Create a self-contained GSD sandbox with the repo's tooling installed locally.
 * No dependency on ~/.claude/ for skills/agents/commands — everything is in the sandbox.
 *
 * Structure:
 *   {sandbox}/.claude/get-shit-done/  ← repo's get-shit-done/
 *   {sandbox}/.claude/agents/         ← repo's agents/
 *   {sandbox}/.claude/commands/       ← repo's commands/
 *   {sandbox}/.claude/hooks/          ← repo's hooks/
 *   {sandbox}/.claude/settings.json   ← from ~/.claude/ (known limitation)
 *   {sandbox}/.planning/users/{user}/ ← multi-user structure
 *   {sandbox}/src/index.js            ← dummy source
 *   {sandbox}/package.json
 *   {sandbox}/CLAUDE.md
 *
 * @param {string} name - sandbox directory name
 * @param {object} [opts] - { userSlug: 'test-user' }
 * @returns {string} absolute path to sandbox
 */
function createSandbox(name, opts = {}) {
  const repoRoot = getRepoRoot();
  const userSlug = opts.userSlug || 'test-user';
  const base = process.env.TEST_TMPDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-sandbox-'));
  const dir = path.join(base, name);
  // Clean up any stale sandbox from a previous run (Bazel reuses TEST_TMPDIR)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });

  // 1. Git init
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'pipe' });

  // 2. Copy GSD tooling into .claude/
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const copyDirs = [
    ['get-shit-done', 'get-shit-done'],
    ['agents', 'agents'],
    ['commands', 'commands'],
    ['hooks', 'hooks'],
  ];
  for (const [src, dst] of copyDirs) {
    const srcPath = path.join(repoRoot, src);
    const dstPath = path.join(claudeDir, dst);
    if (fs.existsSync(srcPath)) {
      execFileSync('cp', ['-r', srcPath, dstPath], { stdio: 'pipe' });
    }
  }

  // 3. Copy settings.json from ~/.claude/ (known limitation — inherits host config)
  const hostSettings = path.join(process.env.HOME, '.claude', 'settings.json');
  if (fs.existsSync(hostSettings)) {
    fs.copyFileSync(hostSettings, path.join(claudeDir, 'settings.json'));
  } else {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
  }

  // 4. Multi-user structure (no active project yet — /gsd-new-project will set it)
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'users', userSlug), { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'user-map.json'),
    JSON.stringify({ _schema: 1, 'test@test.com': userSlug })
  );

  // 5. Dummy project files
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test-sandbox', version: '1.0.0' }));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), "'use strict';\nmodule.exports = {};\n");
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Test Sandbox\n\nThis is a test project for GSD integration testing.\n');

  // 6. Initial commit
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'init: test sandbox'], { cwd: dir, stdio: 'pipe' });

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
  if (opts.addDirs) {
    for (const d of opts.addDirs) {
      args.push('--add-dir', d);
    }
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

module.exports = { runClaude, runClaudeWithTools, runGsdTools, createTestProject, createSandbox, getRepoRoot, CLAUDE_BIN, DEFAULT_TIMEOUT };
