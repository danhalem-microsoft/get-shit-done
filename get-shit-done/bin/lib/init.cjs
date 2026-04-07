/**
 * Init — Compound init commands for workflow bootstrapping
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadConfig, resolveModelInternal, findPhaseInternal, getRoadmapPhaseInternal, pathExistsInternal, generateSlugInternal, getMilestoneInfo, normalizePhaseName, toPosixPath, safeReadFile, output, error, tryGetPlanningContext } = require('./core.cjs');
const { resolveIdentity } = require('./identity.cjs');
const { readActiveContext, writeActiveContext, listProjects } = require('./context.cjs');

function cmdInitExecutePhase(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init execute-phase');
  }

  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const milestone = getMilestoneInfo(cwd);

  const roadmapPhase = getRoadmapPhaseInternal(cwd, phase);
  const reqMatch = roadmapPhase?.section?.match(/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m);
  const reqExtracted = reqMatch
    ? reqMatch[1].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
    : null;
  const phase_req_ids = (reqExtracted && reqExtracted !== 'TBD') ? reqExtracted : null;

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    executor_model: resolveModelInternal(cwd, 'gsd-executor'),
    verifier_model: resolveModelInternal(cwd, 'gsd-verifier'),
    critic_model: resolveModelInternal(cwd, 'gsd-critic-code'),

    // Config flags
    commit_docs: config.commit_docs,
    parallelization: config.parallelization,
    branching_strategy: config.branching_strategy,
    phase_branch_template: config.phase_branch_template,
    milestone_branch_template: config.milestone_branch_template,
    verifier_enabled: config.verifier,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    phase_req_ids,

    // Plan inventory
    plans: phaseInfo?.plans || [],
    summaries: phaseInfo?.summaries || [],
    incomplete_plans: phaseInfo?.incomplete_plans || [],
    plan_count: phaseInfo?.plans?.length || 0,
    incomplete_count: phaseInfo?.incomplete_plans?.length || 0,

    // Branch name (pre-computed)
    branch_name: config.branching_strategy === 'phase' && phaseInfo
      ? config.phase_branch_template
          .replace('{phase}', phaseInfo.phase_number)
          .replace('{slug}', phaseInfo.phase_slug || 'phase')
      : config.branching_strategy === 'milestone'
        ? config.milestone_branch_template
            .replace('{milestone}', milestone.version)
            .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone')
        : null,

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // File existence
    state_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/STATE.md`)
      : false,
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    config_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/config.json`)
      : false,
    // File paths
    state_path: planningRoot ? `${planningRoot}/STATE.md` : null,
    roadmap_path: planningRoot ? `${planningRoot}/ROADMAP.md` : null,
    config_path: planningRoot ? `${planningRoot}/config.json` : null,
  };

  output(result, raw);
}

function cmdInitPlanPhase(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init plan-phase');
  }

  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);

  const roadmapPhase = getRoadmapPhaseInternal(cwd, phase);
  const reqMatch = roadmapPhase?.section?.match(/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m);
  const reqExtracted = reqMatch
    ? reqMatch[1].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
    : null;
  const phase_req_ids = (reqExtracted && reqExtracted !== 'TBD') ? reqExtracted : null;

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    researcher_model: resolveModelInternal(cwd, 'gsd-phase-researcher'),
    planner_model: resolveModelInternal(cwd, 'gsd-planner'),
    checker_model: resolveModelInternal(cwd, 'gsd-plan-checker'),
    critic_model: resolveModelInternal(cwd, 'gsd-critic-plan'),

    // Workflow flags
    research_enabled: config.research,
    plan_checker_enabled: config.plan_checker,
    nyquist_validation_enabled: config.nyquist_validation,
    commit_docs: config.commit_docs,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    padded_phase: phaseInfo?.phase_number?.padStart(2, '0') || null,
    phase_req_ids,

    // Existing artifacts
    has_research: phaseInfo?.has_research || false,
    has_context: phaseInfo?.has_context || false,
    has_plans: (phaseInfo?.plans?.length || 0) > 0,
    plan_count: phaseInfo?.plans?.length || 0,

    // Environment
    planning_exists: pathExistsInternal(cwd, '.planning'),
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,

    // File paths
    state_path: planningRoot ? `${planningRoot}/STATE.md` : null,
    roadmap_path: planningRoot ? `${planningRoot}/ROADMAP.md` : null,
    requirements_path: planningRoot ? `${planningRoot}/REQUIREMENTS.md` : null,
  };

  if (phaseInfo?.directory) {
    // Find *-CONTEXT.md in phase directory
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_path = toPosixPath(path.join(phaseInfo.directory, contextFile));
      }
      const researchFile = files.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) {
        result.research_path = toPosixPath(path.join(phaseInfo.directory, researchFile));
      }
      const verificationFile = files.find(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
      if (verificationFile) {
        result.verification_path = toPosixPath(path.join(phaseInfo.directory, verificationFile));
      }
      const uatFile = files.find(f => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) {
        result.uat_path = toPosixPath(path.join(phaseInfo.directory, uatFile));
      }
    } catch {}
  }

  output(result, raw);
}

function cmdInitNewProject(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.gsd', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Detect existing code
  let hasCode = false;
  let hasPackageFile = false;
  try {
    const files = execSync('find . -maxdepth 3 \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" \\) 2>/dev/null | grep -v node_modules | grep -v .git | head -5', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    hasCode = files.trim().length > 0;
  } catch {}

  hasPackageFile = pathExistsInternal(cwd, 'package.json') ||
                   pathExistsInternal(cwd, 'requirements.txt') ||
                   pathExistsInternal(cwd, 'Cargo.toml') ||
                   pathExistsInternal(cwd, 'go.mod') ||
                   pathExistsInternal(cwd, 'Package.swift');

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    researcher_model: resolveModelInternal(cwd, 'gsd-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'gsd-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'gsd-roadmapper'),

    // Config
    commit_docs: config.commit_docs,

    // Existing state
    project_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/PROJECT.md`)
      : false,
    has_codebase_map: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/codebase`)
      : false,
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Brownfield detection
    has_existing_code: hasCode,
    has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map: planningRoot
      ? (hasCode || hasPackageFile) && !pathExistsInternal(cwd, `${planningRoot}/codebase`)
      : (hasCode || hasPackageFile),

    // Git state
    has_git: pathExistsInternal(cwd, '.git'),

    // Enhanced search
    brave_search_available: hasBraveSearch,

    // File paths
    project_path: planningRoot ? `${planningRoot}/PROJECT.md` : null,
    config_path: planningRoot ? `${planningRoot}/config.json` : null,

    // Project identity (from active context)
    project_name: ctx.active_project || null,
    scope_path: (() => {
      // Read scope_path directly from per-project config (not in loadConfig keyMap)
      if (!planningRoot) return null;
      try {
        const projectConfigPath = path.join(cwd, planningRoot, 'config.json');
        const parsed = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
        return parsed.scope_path || null;
      } catch { return null; }
    })(),
  };

  output(result, raw);
}

function cmdInitNewMilestone(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    researcher_model: resolveModelInternal(cwd, 'gsd-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'gsd-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'gsd-roadmapper'),

    // Config
    commit_docs: config.commit_docs,
    research_enabled: config.research,

    // Current milestone
    current_milestone: milestone.version,
    current_milestone_name: milestone.name,

    // File existence
    project_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/PROJECT.md`)
      : false,
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    state_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/STATE.md`)
      : false,

    // File paths
    project_path: planningRoot ? `${planningRoot}/PROJECT.md` : null,
    roadmap_path: planningRoot ? `${planningRoot}/ROADMAP.md` : null,
    state_path: planningRoot ? `${planningRoot}/STATE.md` : null,
  };

  output(result, raw);
}

function cmdInitQuick(cwd, description, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const now = new Date();
  const slug = description ? generateSlugInternal(description)?.substring(0, 40) : null;

  // Find next quick task number
  const quickDir = planningRoot
    ? path.join(cwd, planningRoot, 'quick')
    : null;
  let nextNum = 1;
  if (quickDir) {
    try {
      const existing = fs.readdirSync(quickDir)
        .filter(f => /^\d+-/.test(f))
        .map(f => parseInt(f.split('-')[0], 10))
        .filter(n => !isNaN(n));
      if (existing.length > 0) {
        nextNum = Math.max(...existing) + 1;
      }
    } catch {}
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    planner_model: resolveModelInternal(cwd, 'gsd-planner'),
    executor_model: resolveModelInternal(cwd, 'gsd-executor'),
    checker_model: resolveModelInternal(cwd, 'gsd-plan-checker'),
    verifier_model: resolveModelInternal(cwd, 'gsd-verifier'),
    critic_model: resolveModelInternal(cwd, 'gsd-critic-code'),

    // Config
    commit_docs: config.commit_docs,

    // Quick task info
    next_num: nextNum,
    slug: slug,
    description: description || null,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Paths
    quick_dir: planningRoot ? `${planningRoot}/quick` : null,
    task_dir: planningRoot && slug ? `${planningRoot}/quick/${nextNum}-${slug}` : null,

    // File existence
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    planning_exists: pathExistsInternal(cwd, '.planning'),

  };

  output(result, raw);
}

function cmdInitResume(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);

  // Check for interrupted agent
  let interruptedAgentId = null;
  if (planningRoot) {
    try {
      interruptedAgentId = fs.readFileSync(path.join(cwd, planningRoot, 'current-agent-id.txt'), 'utf-8').trim();
    } catch {}
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // File existence
    state_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/STATE.md`)
      : false,
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    project_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/PROJECT.md`)
      : false,
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // File paths
    state_path: planningRoot ? `${planningRoot}/STATE.md` : null,
    roadmap_path: planningRoot ? `${planningRoot}/ROADMAP.md` : null,
    project_path: planningRoot ? `${planningRoot}/PROJECT.md` : null,

    // Agent state
    has_interrupted_agent: !!interruptedAgentId,
    interrupted_agent_id: interruptedAgentId,

    // Config
    commit_docs: config.commit_docs,
  };

  output(result, raw);
}

function cmdInitVerifyWork(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init verify-work');
  }

  const ctx = tryGetPlanningContext(cwd);
  const config = loadConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: ctx.planning_root,

    // Models
    planner_model: resolveModelInternal(cwd, 'gsd-planner'),
    checker_model: resolveModelInternal(cwd, 'gsd-plan-checker'),
    critic_model: resolveModelInternal(cwd, 'gsd-critic-plan'),

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Existing artifacts
    has_verification: phaseInfo?.has_verification || false,
  };

  output(result, raw);
}

function cmdInitPhaseOp(cwd, phase, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  let phaseInfo = findPhaseInternal(cwd, phase);

  // Fallback to ROADMAP.md if no directory exists (e.g., Plans: TBD)
  if (!phaseInfo) {
    const roadmapPhase = getRoadmapPhaseInternal(cwd, phase);
    if (roadmapPhase?.found) {
      const phaseName = roadmapPhase.phase_name;
      phaseInfo = {
        found: true,
        directory: null,
        phase_number: roadmapPhase.phase_number,
        phase_name: phaseName,
        phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
        plans: [],
        summaries: [],
        incomplete_plans: [],
        has_research: false,
        has_context: false,
        has_verification: false,
      };
    }
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Config
    commit_docs: config.commit_docs,
    brave_search: config.brave_search,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    padded_phase: phaseInfo?.phase_number?.padStart(2, '0') || null,

    // Existing artifacts
    has_research: phaseInfo?.has_research || false,
    has_context: phaseInfo?.has_context || false,
    has_plans: (phaseInfo?.plans?.length || 0) > 0,
    has_verification: phaseInfo?.has_verification || false,
    plan_count: phaseInfo?.plans?.length || 0,

    // File existence
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // File paths
    state_path: planningRoot ? `${planningRoot}/STATE.md` : null,
    roadmap_path: planningRoot ? `${planningRoot}/ROADMAP.md` : null,
    requirements_path: planningRoot ? `${planningRoot}/REQUIREMENTS.md` : null,
  };

  if (phaseInfo?.directory) {
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_path = toPosixPath(path.join(phaseInfo.directory, contextFile));
      }
      const researchFile = files.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) {
        result.research_path = toPosixPath(path.join(phaseInfo.directory, researchFile));
      }
      const verificationFile = files.find(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
      if (verificationFile) {
        result.verification_path = toPosixPath(path.join(phaseInfo.directory, verificationFile));
      }
      const uatFile = files.find(f => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) {
        result.uat_path = toPosixPath(path.join(phaseInfo.directory, uatFile));
      }
    } catch {}
  }

  output(result, raw);
}

function cmdInitTodos(cwd, area, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const now = new Date();

  // List todos (reuse existing logic)
  const pendingDir = planningRoot
    ? path.join(cwd, planningRoot, 'todos', 'pending')
    : null;
  let count = 0;
  const todos = [];

  if (pendingDir) {
    try {
      const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
          const createdMatch = content.match(/^created:\s*(.+)$/m);
          const titleMatch = content.match(/^title:\s*(.+)$/m);
          const areaMatch = content.match(/^area:\s*(.+)$/m);
          const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

          if (area && todoArea !== area) continue;

          count++;
          todos.push({
            file,
            created: createdMatch ? createdMatch[1].trim() : 'unknown',
            title: titleMatch ? titleMatch[1].trim() : 'Untitled',
            area: todoArea,
            path: `${planningRoot}/todos/pending/${file}`,
          });
        } catch {}
      }
    } catch {}
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Config
    commit_docs: config.commit_docs,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Todo inventory
    todo_count: count,
    todos,
    area_filter: area || null,

    // Paths
    pending_dir: planningRoot ? `${planningRoot}/todos/pending` : null,
    completed_dir: planningRoot ? `${planningRoot}/todos/completed` : null,

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    todos_dir_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/todos`)
      : false,
    pending_dir_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/todos/pending`)
      : false,
  };

  output(result, raw);
}

function cmdInitMilestoneOp(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Count phases
  let phaseCount = 0;
  let completedPhases = 0;
  const phasesDir = planningRoot
    ? path.join(cwd, planningRoot, 'phases')
    : null;
  if (phasesDir) {
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      phaseCount = dirs.length;

      // Count phases with summaries (completed)
      for (const dir of dirs) {
        try {
          const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
          const hasSummary = phaseFiles.some(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
          if (hasSummary) completedPhases++;
        } catch {}
      }
    } catch {}
  }

  // Check archive
  const archiveDir = planningRoot
    ? path.join(cwd, planningRoot, 'archive')
    : null;
  let archivedMilestones = [];
  if (archiveDir) {
    try {
      archivedMilestones = fs.readdirSync(archiveDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {}
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Config
    commit_docs: config.commit_docs,

    // Current milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // Phase counts
    phase_count: phaseCount,
    completed_phases: completedPhases,
    all_phases_complete: phaseCount > 0 && phaseCount === completedPhases,

    // Archive
    archived_milestones: archivedMilestones,
    archive_count: archivedMilestones.length,

    // File existence
    project_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/PROJECT.md`)
      : false,
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    state_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/STATE.md`)
      : false,
    archive_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/archive`)
      : false,
    phases_dir_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/phases`)
      : false,
  };

  output(result, raw);
}

function cmdInitMapCodebase(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);

  // Check for existing codebase maps
  const codebaseDir = planningRoot
    ? path.join(cwd, planningRoot, 'codebase')
    : null;
  let existingMaps = [];
  if (codebaseDir) {
    try {
      existingMaps = fs.readdirSync(codebaseDir).filter(f => f.endsWith('.md'));
    } catch {}
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    mapper_model: resolveModelInternal(cwd, 'gsd-codebase-mapper'),

    // Config
    commit_docs: config.commit_docs,
    search_gitignored: config.search_gitignored,
    parallelization: config.parallelization,

    // Paths
    codebase_dir: planningRoot ? `${planningRoot}/codebase` : null,

    // Existing maps
    existing_maps: existingMaps,
    has_maps: existingMaps.length > 0,

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    codebase_dir_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/codebase`)
      : false,
  };

  output(result, raw);
}

function cmdInitProgress(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);
  const planningRoot = ctx.planning_root;
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Analyze phases
  const phasesDir = planningRoot
    ? path.join(cwd, planningRoot, 'phases')
    : null;
  const phases = [];
  let currentPhase = null;
  let nextPhase = null;

  if (phasesDir) {
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      for (const dir of dirs) {
        const match = dir.match(/^(\d+(?:\.\d+)*)-?(.*)/);
        const phaseNumber = match ? match[1] : dir;
        const phaseName = match && match[2] ? match[2] : null;

        const phasePath = path.join(phasesDir, dir);
        const phaseFiles = fs.readdirSync(phasePath);

        const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
        const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

        const status = summaries.length >= plans.length && plans.length > 0 ? 'complete' :
                       plans.length > 0 ? 'in_progress' :
                       hasResearch ? 'researched' : 'pending';

        const phaseInfo = {
          number: phaseNumber,
          name: phaseName,
          directory: `${planningRoot}/phases/${dir}`,
          status,
          plan_count: plans.length,
          summary_count: summaries.length,
          has_research: hasResearch,
        };

        phases.push(phaseInfo);

        // Find current (first incomplete with plans) and next (first pending)
        if (!currentPhase && (status === 'in_progress' || status === 'researched')) {
          currentPhase = phaseInfo;
        }
        if (!nextPhase && status === 'pending') {
          nextPhase = phaseInfo;
        }
      }
    } catch {}
  }

  // Check for paused work
  let pausedAt = null;
  if (planningRoot) {
    try {
      const state = fs.readFileSync(path.join(cwd, planningRoot, 'STATE.md'), 'utf-8');
      const pauseMatch = state.match(/\*\*Paused At:\*\*\s*(.+)/);
      if (pauseMatch) pausedAt = pauseMatch[1].trim();
    } catch {}
  }

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: planningRoot,

    // Models
    executor_model: resolveModelInternal(cwd, 'gsd-executor'),
    planner_model: resolveModelInternal(cwd, 'gsd-planner'),

    // Config
    commit_docs: config.commit_docs,

    // Milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // Phase overview
    phases,
    phase_count: phases.length,
    completed_count: phases.filter(p => p.status === 'complete').length,
    in_progress_count: phases.filter(p => p.status === 'in_progress').length,

    // Current state
    current_phase: currentPhase,
    next_phase: nextPhase,
    paused_at: pausedAt,
    has_work_in_progress: !!currentPhase,

    // File existence
    project_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/PROJECT.md`)
      : false,
    roadmap_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/ROADMAP.md`)
      : false,
    state_exists: planningRoot
      ? pathExistsInternal(cwd, `${planningRoot}/STATE.md`)
      : false,
    // File paths
    state_path: planningRoot ? `${planningRoot}/STATE.md` : null,
    roadmap_path: planningRoot ? `${planningRoot}/ROADMAP.md` : null,
    project_path: planningRoot ? `${planningRoot}/PROJECT.md` : null,
    config_path: planningRoot ? `${planningRoot}/config.json` : null,
  };

  output(result, raw);
}

// ─── Switch / Archive / Restore / Project Setup ──────────────────────────────

function cmdInitSwitch(cwd, projectArg, raw) {
  // Resolve user identity
  const identity = resolveIdentity(cwd);
  if (!identity) {
    error('GSD Error: Cannot resolve user identity. Set git user.name or GSD_USER environment variable.');
  }
  const user = identity.slug;

  // Get project list
  const projects = listProjects(cwd, user);

  if (projectArg) {
    // Try exact slug match first
    let matched = projects.find(p => p.name === projectArg);

    if (!matched) {
      // Try fuzzy: substring match
      const fuzzy = projects.filter(p => p.name.includes(projectArg));
      if (fuzzy.length === 1) {
        matched = fuzzy[0];
      } else if (fuzzy.length === 0) {
        error('GSD Error: Project "' + projectArg + '" not found. Available: ' + projects.map(p => p.name).join(', '));
      } else {
        error('GSD Error: Ambiguous match for "' + projectArg + '". Matches: ' + fuzzy.map(p => p.name).join(', '));
      }
    }

    // Set active context
    writeActiveContext(cwd, user, matched.name);

    const planning_root = toPosixPath(path.join('.planning', 'users', user, matched.name));
    output({
      active_user: user,
      active_project: matched.name,
      planning_root,
      switched: true,
      project: matched.name,
    }, raw);
  } else {
    // Listing mode
    output({
      active_user: user,
      active_project: null,
      planning_root: null,
      switched: false,
      projects,
      user,
    }, raw);
  }
}

function cmdInitProjectSetup(cwd, raw) {
  // Resolve identity directly — no project needed
  const identity = resolveIdentity(cwd);
  if (!identity) {
    error('GSD Error: Cannot resolve user identity. Set git user.name or GSD_USER environment variable.');
  }
  const user = identity.slug;

  // Ensure user directory exists
  const userDir = path.join(cwd, '.planning', 'users', user);
  fs.mkdirSync(userDir, { recursive: true });

  // Scan for existing projects
  const projects = listProjects(cwd, user);

  // Read global config
  const globalConfigPath = path.join(cwd, '.planning', 'config.json');
  const globalConfigRaw = safeReadFile(globalConfigPath);
  let global_config = {};
  if (globalConfigRaw) {
    try { global_config = JSON.parse(globalConfigRaw); } catch { /* ignore parse errors */ }
  }

  const planning_exists = fs.existsSync(path.join(cwd, '.planning'));

  output({
    user,
    projects,
    global_config,
    planning_exists,
  }, raw);
}

function cmdArchiveProject(cwd, projectArg, raw) {
  if (!projectArg) {
    error('GSD Error: Project name required for archive-project.');
  }

  // Resolve user identity
  const identity = resolveIdentity(cwd);
  if (!identity) {
    error('GSD Error: Cannot resolve user identity. Set git user.name or GSD_USER environment variable.');
  }
  const user = identity.slug;
  const userDir = path.join(cwd, '.planning', 'users', user);
  const projectDir = path.join(userDir, projectArg);
  const archivedDir = path.join(userDir, '_archived');
  const archivedProjectDir = path.join(archivedDir, projectArg);

  // Verify project exists
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    error('GSD Error: Project "' + projectArg + '" not found.');
  }

  // Check if already archived
  if (fs.existsSync(archivedProjectDir)) {
    error('GSD Error: Project "' + projectArg + '" is already archived.');
  }

  // Create _archived/ if needed
  fs.mkdirSync(archivedDir, { recursive: true });

  // Move project to _archived/
  fs.renameSync(projectDir, archivedProjectDir);

  // Check if the archived project was the active one
  const active = readActiveContext(cwd, user);
  if (active && active.project === projectArg) {
    // Clear .active
    const activePath = path.join(userDir, '.active');
    try { fs.unlinkSync(activePath); } catch { /* ignore if doesn't exist */ }

    // Auto-select if exactly one project remains
    const { scanProjects } = (() => {
      // Re-scan projects (import scanProjects indirectly via listProjects)
      try {
        const entries = fs.readdirSync(userDir, { withFileTypes: true });
        const remaining = entries
          .filter(e => e.isDirectory() && e.name !== '_archived' && !e.name.startsWith('.'))
          .map(e => e.name);
        return { scanProjects: () => remaining };
      } catch { return { scanProjects: () => [] }; }
    })();

    const remaining = scanProjects();
    if (remaining.length === 1) {
      writeActiveContext(cwd, user, remaining[0]);
    }
  }

  output({
    active_user: user,
    archived: true,
    project: projectArg,
  }, raw);
}

function cmdRestoreProject(cwd, projectArg, raw) {
  if (!projectArg) {
    error('GSD Error: Project name required for restore-project.');
  }

  // Resolve user identity
  const identity = resolveIdentity(cwd);
  if (!identity) {
    error('GSD Error: Cannot resolve user identity. Set git user.name or GSD_USER environment variable.');
  }
  const user = identity.slug;
  const userDir = path.join(cwd, '.planning', 'users', user);
  const archivedProjectDir = path.join(userDir, '_archived', projectArg);
  const targetDir = path.join(userDir, projectArg);

  // Verify project exists in _archived/
  if (!fs.existsSync(archivedProjectDir) || !fs.statSync(archivedProjectDir).isDirectory()) {
    error('GSD Error: Project "' + projectArg + '" not found in _archived/.');
  }

  // Check for duplicate name in active directory
  if (fs.existsSync(targetDir)) {
    error('GSD Error: Project "' + projectArg + '" already exists. Cannot restore.');
  }

  // Move from _archived/ back to active
  fs.renameSync(archivedProjectDir, targetDir);

  // Set restored project as active
  writeActiveContext(cwd, user, projectArg);

  const planning_root = toPosixPath(path.join('.planning', 'users', user, projectArg));
  output({
    active_user: user,
    active_project: projectArg,
    planning_root,
    restored: true,
    project: projectArg,
  }, raw);
}

module.exports = {
  cmdInitExecutePhase,
  cmdInitPlanPhase,
  cmdInitNewProject,
  cmdInitNewMilestone,
  cmdInitQuick,
  cmdInitResume,
  cmdInitVerifyWork,
  cmdInitPhaseOp,
  cmdInitTodos,
  cmdInitMilestoneOp,
  cmdInitMapCodebase,
  cmdInitProgress,
  cmdInitSwitch,
  cmdInitProjectSetup,
  cmdArchiveProject,
  cmdRestoreProject,
};
