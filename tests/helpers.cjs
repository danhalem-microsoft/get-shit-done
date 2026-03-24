/**
 * GSD Tools Test Helpers
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_PATH = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');

/**
 * Run gsd-tools command.
 *
 * @param {string|string[]} args - Command string (shell-interpreted) or array
 *   of arguments (shell-bypassed via execFileSync, safe for JSON and dollar signs).
 * @param {string} cwd - Working directory.
 */
function runGsdTools(args, cwd = process.cwd()) {
  try {
    let result;
    if (Array.isArray(args)) {
      result = execFileSync(process.execPath, [TOOLS_PATH, ...args], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      result = execSync(`node "${TOOLS_PATH}" ${args}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
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

// Create temp directory structure
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'users'), { recursive: true });
  return tmpDir;
}

// Create temp directory with initialized git repo and at least one commit
function createTempGitProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'PROJECT.md'),
    '# Project\n\nTest project.\n'
  );

  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}

// Create temp directory with full multi-user structure, git repo, and user-map.json
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

module.exports = { runGsdTools, createTempProject, createTempGitProject, createTempMultiUserProject, cleanup, TOOLS_PATH };
