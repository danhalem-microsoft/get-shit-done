/**
 * Identity -- User identity resolution and slug management
 */

const fs = require('fs');
const path = require('path');
const { execGit, generateSlugInternal, safeReadFile } = require('./core.cjs');

// ─── Identity Resolution ────────────────────────────────────────────────────

function sanitizeSlug(raw) {
  const base = generateSlugInternal(raw);
  if (!base) return null;
  // Enforce 30-character max, trim trailing hyphens after truncation
  return base.substring(0, 30).replace(/-+$/, '');
}

function resolveIdentity(cwd) {
  // 1. GSD_USER env var — direct slug, no sanitization, no user-map.json
  const envUser = process.env.GSD_USER;
  if (envUser) {
    return { slug: envUser, source: 'GSD_USER', raw: envUser };
  }

  // 2. git config user.name
  const nameResult = execGit(cwd, ['config', 'user.name']);
  if (nameResult.exitCode === 0 && nameResult.stdout.trim()) {
    const raw = nameResult.stdout.trim();
    const slug = sanitizeSlug(raw);
    if (slug) {
      const finalSlug = lockIdentity(cwd, raw, slug, 'git user.name');
      return { slug: finalSlug, source: 'git-user-name', raw };
    }
  }

  // 3. git config user.email local-part
  const emailResult = execGit(cwd, ['config', 'user.email']);
  if (emailResult.exitCode === 0 && emailResult.stdout.trim()) {
    const localPart = emailResult.stdout.trim().split('@')[0];
    if (localPart) {
      const raw = localPart;
      const slug = sanitizeSlug(raw);
      if (slug) {
        const finalSlug = lockIdentity(cwd, raw, slug, 'git user.email');
        return { slug: finalSlug, source: 'git-user-email', raw };
      }
    }
  }

  // 4. OS username
  try {
    const username = require('os').userInfo().username;
    if (username) {
      const raw = username;
      const slug = sanitizeSlug(raw);
      if (slug) {
        const finalSlug = lockIdentity(cwd, raw, slug, 'os-username');
        return { slug: finalSlug, source: 'os-username', raw };
      }
    }
  } catch {
    // os.userInfo() can throw SystemError in Docker containers without /etc/passwd
  }

  // 5. All failed
  return null;
}

// ─── User Map Management ────────────────────────────────────────────────────

function loadUserMap(cwd) {
  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  const content = safeReadFile(mapPath);
  if (content === null) return {};
  try {
    return JSON.parse(content);
  } catch {
    process.stderr.write('Warning: user-map.json corrupted, re-registering identity.\n');
    return {};
  }
}

function lockIdentity(cwd, raw, slug, source) {
  const map = loadUserMap(cwd);

  // First registration wins — if raw already mapped, return existing slug
  if (map[raw] !== undefined) return map[raw];

  // Collect all existing slug values (filter out metadata keys like _schema)
  const existingSlugs = new Set(
    Object.entries(map)
      .filter(([k, v]) => typeof v === 'string' && !k.startsWith('_'))
      .map(([, v]) => v)
  );

  // Resolve slug collision with numeric suffix
  let finalSlug = slug;
  if (existingSlugs.has(finalSlug)) {
    let counter = 2;
    while (existingSlugs.has(`${slug}-${counter}`)) {
      counter++;
    }
    finalSlug = `${slug}-${counter}`;
  }

  // Ensure _schema is present
  if (!('_schema' in map)) {
    map._schema = 1;
  }

  map[raw] = finalSlug;

  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');

  process.stderr.write('GSD: Registered user ' + finalSlug + ' (from ' + source + ')\n');

  return finalSlug;
}

module.exports = {
  sanitizeSlug,
  resolveIdentity,
  loadUserMap,
  lockIdentity,
};
