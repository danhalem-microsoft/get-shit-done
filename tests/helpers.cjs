/**
 * GSD Tools Test Helpers
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_PATH = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');
const TEST_ENV_BASE = {
  GSD_SESSION_KEY: '',
  CODEX_THREAD_ID: '',
  CLAUDE_SESSION_ID: '',
  CLAUDE_CODE_SSE_PORT: '',
  OPENCODE_SESSION_ID: '',
  GEMINI_SESSION_ID: '',
  CURSOR_SESSION_ID: '',
  WINDSURF_SESSION_ID: '',
  TERM_SESSION_ID: '',
  WT_SESSION: '',
  TMUX_PANE: '',
  ZELLIJ_SESSION_NAME: '',
  TTY: '',
  SSH_TTY: '',
};

/**
 * Run gsd-tools command.
 *
 * @param {string|string[]} args - Command string (shell-interpreted) or array
 *   of arguments (shell-bypassed via execFileSync, safe for JSON and dollar signs).
 * @param {string} cwd - Working directory.
 * @param {object} [env] - Optional env overrides merged on top of process.env.
 *   Pass { HOME: cwd } to sandbox ~/.gsd/ lookups in tests that assert concrete
 *   config values that could be overridden by a developer's defaults.json.
 */
function runGsdTools(args, cwd = process.cwd(), env = {}) {
  try {
    let result;
    const childEnv = { ...process.env, ...TEST_ENV_BASE, ...env };
    if (Array.isArray(args)) {
      result = execFileSync(process.execPath, [TOOLS_PATH, ...args], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });
    } else {
      // Split shell-style string into argv, stripping surrounding quotes, so we
      // can invoke execFileSync with process.execPath instead of relying on
      // `node` being on PATH (it isn't in Claude Code shell sessions).
      // Apply shell-style quote removal: strip surrounding quotes from quoted
      // sequences anywhere in a token (handles both "foo bar" and --"foo bar").
      const argv = (args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [])
        .map(t => t.replace(/"([^"]*)"/g, '$1').replace(/'([^']*)'/g, '$1'));
      result = execFileSync(process.execPath, [TOOLS_PATH, ...argv], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });
    }
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

// Create a bare temp directory (no .planning/ structure)
function createTempDir(prefix = 'gsd-test-') {
  return fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
}

/**
 * Create temp directory with flat .planning/ layout.
 *
 * Creates a flat .planning/ structure (no users/ directory) suitable for
 * upstream tests that write directly to .planning/phases/, .planning/ROADMAP.md,
 * etc.  getPlanningRoot() will detect the absence of .planning/users/ and
 * fall back to returning '.planning' as the planning root.
 */
function createTempProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

/**
 * Create temp directory with initialized git repo and flat .planning/ layout.
 *
 * Creates a flat .planning/ structure (no users/ directory) suitable for
 * upstream tests that write directly to .planning/phases/, .planning/ROADMAP.md,
 * etc.  getPlanningRoot() will detect the absence of .planning/users/ and
 * fall back to returning '.planning' as the planning root.
 */
function createTempGitProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });

  // Seed user-map.json so identity resolution (lockIdentity) doesn't create
  // it as a side-effect during commit attribution — that would make "nothing
  // to commit" tests fail by introducing an untracked file.
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'user-map.json'),
    JSON.stringify({ _schema: 1, 'Test User': 'test-user' }, null, 2) + '\n'
  );

  // Create initial commit
  fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}

/**
 * Create temp directory with full multi-user structure, git repo, and user-map.json.
 * Returns { tmpDir, userSlug, projectName } so callers can compute planningRoot as
 * `.planning/users/${userSlug}/${projectName}`.
 */
function createTempMultiUserProject(opts = {}) {
  const {
    userName = 'Test User',
    userEmail = 'test@test.com',
    userSlug = 'test-user',
    projectName = 'test-project',
    withActive = true,
  } = opts;

  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

  // Create multi-user directory structure
  fs.mkdirSync(
    path.join(tmpDir, '.planning', 'users', userSlug, projectName, 'phases'),
    { recursive: true }
  );

  // Initialize git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync(`git config user.email "${userEmail}"`, { cwd: tmpDir, stdio: 'pipe' });
  execSync(`git config user.name "${userName}"`, { cwd: tmpDir, stdio: 'pipe' });

  // Create user-map.json
  const userMap = { _schema: 1, [userName]: userSlug };
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'user-map.json'),
    JSON.stringify(userMap, null, 2) + '\n',
    'utf-8'
  );

  // Create .active file if requested
  if (withActive) {
    const activeData = {
      project: projectName,
      resolved_path: `.planning/users/${userSlug}/${projectName}`,
    };
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'users', userSlug, '.active'),
      JSON.stringify(activeData, null, 2) + '\n',
      'utf-8'
    );
  }

  // Create .gitignore for .active files
  fs.writeFileSync(
    path.join(tmpDir, '.gitignore'),
    '**/.active\n',
    'utf-8'
  );

  // Create initial commit
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return { tmpDir, userSlug, projectName };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

module.exports = { runGsdTools, createTempDir, createTempProject, createTempGitProject, createTempMultiUserProject, cleanup, TOOLS_PATH };
