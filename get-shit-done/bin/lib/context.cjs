/**
 * Context -- Active project context management and resolution
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, toPosixPath, error } = require('./core.cjs');
const { resolveIdentity } = require('./identity.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

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

/**
 * Scan a user directory for non-archived, non-dotfile project directories.
 * Returns an array of directory names (not metadata).
 */
function scanProjects(userDir) {
  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && e.name !== '_archived' && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

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

  // 3. Resolve project (env var override first — highest priority)
  const envProject = process.env.GSD_PROJECT;
  if (envProject) {
    const projectDir = path.join(cwd, '.planning', 'users', user, envProject);
    if (!fs.existsSync(projectDir)) {
      error('GSD Error: Project "' + envProject + '" not found for user ' + user + '.');
    }
    const planning_root = toPosixPath(path.join('.planning', 'users', user, envProject));
    return { user, project: envProject, planning_root };
  }

  // 4. Auto-select: scan for projects
  const projects = scanProjects(userDir);

  if (projects.length === 1) {
    // LIFE-05: auto-select single project
    const planning_root = toPosixPath(path.join('.planning', 'users', user, projects[0]));
    return { user, project: projects[0], planning_root };
  }

  // 5. Read .active file (for multiple-project case)
  if (projects.length > 1) {
    const active = readActiveContext(cwd, user);
    if (active) {
      const projectDir = path.join(cwd, '.planning', 'users', user, active.project);
      if (fs.existsSync(projectDir)) {
        const planning_root = toPosixPath(path.join('.planning', 'users', user, active.project));
        return { user, project: active.project, planning_root };
      }
    }
  }

  // 6. Zero or multiple projects with no .active → return null (NOT hard-error)
  return { user, project: null, planning_root: null };
}

function listProjects(cwd, user) {
  const userDir = path.join(cwd, '.planning', 'users', user);
  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && e.name !== '_archived' && !e.name.startsWith('.'))
      .map(e => {
        const projectDir = path.join(userDir, e.name);

        // Read STATE.md for phase/progress metadata
        const stateMd = safeReadFile(path.join(projectDir, 'STATE.md'));
        const stateFm = stateMd ? extractFrontmatter(stateMd) : {};

        // Read PROJECT.md for Core Value description
        const projectMd = safeReadFile(path.join(projectDir, 'PROJECT.md'));
        const description = projectMd ? extractCoreValue(projectMd) : null;

        // Get last activity from STATE.md mtime (fallback to null)
        let last_activity = null;
        try {
          const stat = fs.statSync(path.join(projectDir, 'STATE.md'));
          last_activity = stat.mtime.toISOString();
        } catch { /* no STATE.md */ }

        // Extract progress
        const completedPhases = stateFm.progress && stateFm.progress.completed_phases
          ? parseInt(stateFm.progress.completed_phases, 10) || 0
          : 0;
        const totalPhases = stateFm.progress && stateFm.progress.total_phases
          ? parseInt(stateFm.progress.total_phases, 10) || 0
          : 0;

        // Extract current phase from frontmatter or body
        let current_phase = null;
        if (stateFm.current_phase) {
          current_phase = stateFm.current_phase;
        } else if (stateMd) {
          const phaseMatch = stateMd.match(/\*\*Phase\s+\d+[^*]*\*\*/);
          if (phaseMatch) {
            current_phase = phaseMatch[0].replace(/\*\*/g, '').trim();
          }
        }

        return {
          name: e.name,
          current_phase,
          progress: `${completedPhases}/${totalPhases}`,
          last_activity,
          description,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Extract the Core Value line from PROJECT.md content.
 * Looks for "**Core Value:**" followed by the value text on the same line.
 */
function extractCoreValue(content) {
  const match = content.match(/\*\*Core Value:\*\*\s*(.+)/);
  return match ? match[1].trim() : null;
}

// --- Cross-User Scanning (team-status) ------------------------------------

/**
 * Scan all user directories under .planning/users/ and return structured
 * status data for each user's active project.  READ-ONLY — never writes.
 *
 * @param {string} cwd — repository root
 * @returns {Array<{user, project, status, milestone, progress, last_active}>}
 */
function scanAllUsers(cwd) {
  const usersDir = path.join(cwd, '.planning', 'users');

  try {
    const entries = fs.readdirSync(usersDir, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === '_archived') continue;

      const userSlug = entry.name;
      const userDir = path.join(usersDir, userSlug);

      // Read .active file for active project
      let activeProject = null;
      try {
        const activeContent = fs.readFileSync(path.join(userDir, '.active'), 'utf-8');
        const parsed = JSON.parse(activeContent);
        activeProject = parsed.project || null;
      } catch { /* no active project */ }

      // Read STATE.md frontmatter from active project (if any)
      let stateFm = {};
      if (activeProject) {
        const statePath = path.join(userDir, activeProject, 'STATE.md');
        const stateContent = safeReadFile(statePath);
        if (stateContent) {
          stateFm = extractFrontmatter(stateContent);
        }
      }

      // Extract fields with safe defaults
      const status = stateFm.status || 'unknown';
      const milestone = stateFm.milestone || null;
      const lastActive = stateFm.last_updated || null;
      const totalPhases = (stateFm.progress && stateFm.progress.total_phases)
        ? parseInt(stateFm.progress.total_phases, 10) || 0
        : 0;
      const completedPhases = (stateFm.progress && stateFm.progress.completed_phases)
        ? parseInt(stateFm.progress.completed_phases, 10) || 0
        : 0;
      const totalPlans = (stateFm.progress && stateFm.progress.total_plans)
        ? parseInt(stateFm.progress.total_plans, 10) || 0
        : 0;
      const completedPlans = (stateFm.progress && stateFm.progress.completed_plans)
        ? parseInt(stateFm.progress.completed_plans, 10) || 0
        : 0;

      results.push({
        user: userSlug,
        project: activeProject,
        status,
        milestone,
        progress: {
          total_phases: totalPhases,
          completed_phases: completedPhases,
          total_plans: totalPlans,
          completed_plans: completedPlans,
        },
        last_active: lastActive,
      });
    }

    return results;
  } catch {
    // .planning/users/ doesn't exist or can't be read
    return [];
  }
}

module.exports = {
  readActiveContext,
  writeActiveContext,
  resolveContext,
  listProjects,
  scanAllUsers,
};
