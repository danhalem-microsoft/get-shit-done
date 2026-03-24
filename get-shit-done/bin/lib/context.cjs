/**
 * Context -- Active project context management and resolution
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, toPosixPath, error } = require('./core.cjs');
const { resolveIdentity } = require('./identity.cjs');

// --- Active Context I/O ----------------------------------------------------

function readActiveContext(cwd, user) {
  const activePath = path.join(cwd, '.planning', 'users', user, '.active');
  const content = safeReadFile(activePath);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed.project) return null;
    return { project: parsed.project, resolved_path: parsed.resolved_path };
  } catch {
    return null;
  }
}

function writeActiveContext(cwd, user, project) {
  const userDir = path.join(cwd, '.planning', 'users', user);
  fs.mkdirSync(userDir, { recursive: true });
  const resolved_path = toPosixPath(path.join('.planning', 'users', user, project));
  const activePath = path.join(userDir, '.active');
  fs.writeFileSync(activePath, JSON.stringify({ project, resolved_path }, null, 2) + '\n', 'utf-8');
  ensureActiveGitignored(cwd);
}

function ensureActiveGitignored(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');
  const content = safeReadFile(gitignorePath);
  if (content !== null && content.includes('**/.active')) {
    return;
  }
  const entry = '\n# GSD active project context (per-user, machine-specific)\n**/.active\n';
  if (content === null) {
    fs.writeFileSync(gitignorePath, entry.trimStart(), 'utf-8');
  } else {
    fs.appendFileSync(gitignorePath, entry, 'utf-8');
  }
}

// --- Context Resolution ----------------------------------------------------

function resolveContext(cwd) {
  // 1. Resolve user identity
  const identity = resolveIdentity(cwd);
  if (!identity) {
    error('GSD Error: Cannot resolve user identity. Set git user.name or GSD_USER environment variable.');
  }
  const user = identity.slug;

  // 2. Ensure user directory exists (bootstraps on first use)
  const userDir = path.join(cwd, '.planning', 'users', user);
  fs.mkdirSync(userDir, { recursive: true });

  // 3. Resolve project (env var override first)
  const envProject = process.env.GSD_PROJECT;
  if (envProject) {
    const projectDir = path.join(cwd, '.planning', 'users', user, envProject);
    if (!fs.existsSync(projectDir)) {
      error('GSD Error: Project "' + envProject + '" not found for user ' + user + '. Available projects: ' + listProjects(cwd, user));
    }
    const planning_root = toPosixPath(path.join('.planning', 'users', user, envProject));
    return { user, project: envProject, planning_root };
  }

  // 4. Read .active file
  const active = readActiveContext(cwd, user);
  if (!active) {
    error('GSD Error: No active project. Run /gsd:new-project to create one, or /gsd:switch to select one.');
  }
  const projectDir = path.join(cwd, '.planning', 'users', user, active.project);
  if (!fs.existsSync(projectDir)) {
    error('GSD Error: Active project "' + active.project + '" not found. Run /gsd:switch to select a valid project.');
  }

  // 5. Build and return result
  const planning_root = toPosixPath(path.join('.planning', 'users', user, active.project));
  return { user, project: active.project, planning_root };
}

function listProjects(cwd, user) {
  const userDir = path.join(cwd, '.planning', 'users', user);
  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory() && e.name !== '_archived')
      .map(e => e.name);
    return projects.length > 0 ? projects.join(', ') : '(none)';
  } catch {
    return '(none)';
  }
}

module.exports = {
  readActiveContext,
  writeActiveContext,
  resolveContext,
};
