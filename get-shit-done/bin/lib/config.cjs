/**
 * Config — Planning config CRUD operations
 */

const fs = require('fs');
const path = require('path');
const { output, error, planningDir, withPlanningLock, CONFIG_DEFAULTS, atomicWriteFileSync } = require('./core.cjs');
const { isValidConfigKey, VALID_CONFIG_KEYS, DYNAMIC_KEY_PATTERNS } = require('./config-schema.cjs');
const { VALID_PROFILES, getAgentToModelMapForProfile, formatAgentToModelMapAsTable } = require('./model-profiles.cjs');

// Also export getPlanningRoot for backward compat within fork
const getPlanningRoot = (cwd) => '.planning';

/**
 * Known misspellings / aliases → canonical key for helpful error messages.
 */
const CONFIG_KEY_SUGGESTIONS = {
  'workflow.nyquist_validation_enabled': 'workflow.nyquist_validation',
  'agents.nyquist_validation_enabled': 'workflow.nyquist_validation',
  'nyquist.validation_enabled': 'workflow.nyquist_validation',
  'hooks.research_questions': 'workflow.research_before_questions',
  'workflow.research_questions': 'workflow.research_before_questions',
  'workflow.codereview': 'workflow.code_review',
  'workflow.review_command': 'workflow.code_review_command',
  'workflow.review': 'workflow.code_review',
  'workflow.code_review_level': 'workflow.code_review_depth',
  'workflow.review_depth': 'workflow.code_review_depth',
  'review.model': 'review.models.<cli-name>',
  'workflow.nyquist': 'workflow.nyquist_validation',
  'workflow.plan_checker': 'workflow.plan_check',
};

function validateKnownConfigKeyPath(keyPath) {
  const suggested = CONFIG_KEY_SUGGESTIONS[keyPath];
  if (suggested) {
    error(`Unknown config key: ${keyPath}. Did you mean ${suggested}?`);
  }
}

/**
 * Context values accepted by config-set context.
 */
const VALID_CONTEXTS = ['dev', 'research', 'review'];

function cmdConfigEnsureSection(cwd, raw) {
  const planningBase = planningDir(cwd);
  const configPath = path.join(planningBase, 'config.json');

  // Ensure planning directory exists
  try {
    if (!fs.existsSync(planningBase)) {
      fs.mkdirSync(planningBase, { recursive: true });
    }
  } catch (err) {
    error('Failed to create planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.gsd', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Load user-level defaults from ~/.gsd/defaults.json if available
  const globalDefaultsPath = path.join(homedir, '.gsd', 'defaults.json');
  let userDefaults = {};
  try {
    if (fs.existsSync(globalDefaultsPath)) {
      userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, 'utf-8'));
      // Migrate deprecated "depth" key to "granularity"
      if ('depth' in userDefaults && !('granularity' in userDefaults)) {
        const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
        userDefaults.granularity = depthToGranularity[userDefaults.depth] || userDefaults.depth;
        delete userDefaults.depth;
        try { fs.writeFileSync(globalDefaultsPath, JSON.stringify(userDefaults, null, 2), 'utf-8'); } catch {}
      }
    }
  } catch (err) {
    // Ignore malformed global defaults, fall back to hardcoded
  }

  // Create default config (user-level defaults override hardcoded defaults)
  const hardcoded = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    git: {
      branching_strategy: 'none',
      phase_branch_template: 'gsd/phase-{phase}-{slug}',
      milestone_branch_template: 'gsd/{milestone}-{slug}',
    },
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
      nyquist_validation: true,
      auto_advance: false,
      node_repair: true,
      node_repair_budget: 2,
      ui_phase: true,
      ui_safety_gate: true,
      skip_discuss: false,
      research_before_questions: false,
      discuss_mode: 'discuss',
      ai_integration_phase: true,
      tdd_mode: false,
      code_review_command: null,
      pattern_mapper: true,
      security_enforcement: true,
      security_asvs_level: 1,
      security_block_on: 'high',
      cross_ai_execution: false,
      cross_ai_command: null,
      cross_ai_timeout: 120,
      subagent_timeout: 300000,
    },
    hooks: {
      context_warnings: true,
    },
    parallelization: true,
    brave_search: hasBraveSearch,
    agent_skills: {},
    claude_md_path: './CLAUDE.md',
  };
  const defaults = {
    ...hardcoded,
    ...userDefaults,
    git: { ...hardcoded.git, ...(userDefaults.git || {}) },
    workflow: { ...hardcoded.workflow, ...(userDefaults.workflow || {}) },
    hooks: { ...hardcoded.hooks, ...(userDefaults.hooks || {}) },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

/**
 * Sets a value in the config file, allowing nested values via dot notation.
 * Uses withPlanningLock to prevent concurrent write data loss (#1927).
 */
function setConfigValue(cwd, keyPath, parsedValue) {
  const configPath = path.join(planningDir(cwd), 'config.json');

  return withPlanningLock(cwd, () => {
    let config = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (err) {
      error('Failed to read config.json: ' + err.message);
    }

    const keys = keyPath.split('.');
    let current = config;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] === undefined || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    const previousValue = current[keys[keys.length - 1]];
    current[keys[keys.length - 1]] = parsedValue;

    try {
      const writeFunc = typeof atomicWriteFileSync === 'function' ? atomicWriteFileSync : fs.writeFileSync;
      writeFunc(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return { updated: true, key: keyPath, value: parsedValue, previousValue };
    } catch (err) {
      error('Failed to write config.json: ' + err.message);
    }
  });
}

function cmdConfigSet(cwd, keyPath, value, raw) {
  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  validateKnownConfigKeyPath(keyPath);

  if (!isValidConfigKey(keyPath)) {
    error(`Unknown config key: "${keyPath}". Valid keys: ${[...VALID_CONFIG_KEYS].sort().join(', ')}, agent_skills.<agent-type>, features.<feature_name>`);
  }

  // Parse value (handle booleans, numbers, and JSON arrays/objects)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);
  else if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
    try { parsedValue = JSON.parse(value); } catch { /* keep as string */ }
  }

  const VALID_CONTEXT_VALUES = ['dev', 'research', 'review'];
  if (keyPath === 'context' && !VALID_CONTEXT_VALUES.includes(String(parsedValue))) {
    error(`Invalid context value '${value}'. Valid values: ${VALID_CONTEXT_VALUES.join(', ')}`);
  }

  const setConfigValueResult = setConfigValue(cwd, keyPath, parsedValue);
  output(setConfigValueResult, raw, `${keyPath}=${parsedValue}`);
}

function cmdConfigGet(cwd, keyPath, raw, defaultValue) {
  const configPath = path.join(planningDir(cwd), 'config.json');

  if (!keyPath) {
    error('Usage: config-get <key.path>');
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      if (defaultValue !== undefined) {
        output(defaultValue, raw, String(defaultValue));
        return;
      }
      error('No config.json found at ' + configPath);
    }
  } catch (err) {
    if (err.message.startsWith('No config.json')) throw err;
    error('Failed to read config.json: ' + err.message);
  }

  // Traverse dot-notation path (e.g., "workflow.auto_advance")
  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      if (defaultValue !== undefined) {
        output(defaultValue, raw, String(defaultValue));
        return;
      }
      error(`Key not found: ${keyPath}`);
    }
    current = current[key];
  }

  if (current === undefined) {
    if (defaultValue !== undefined) {
      output(defaultValue, raw, String(defaultValue));
      return;
    }
    error(`Key not found: ${keyPath}`);
  }

  output(current, raw, String(current));
}

function cmdConfigNewProject(cwd, choicesJson, raw) {
  const planBase = planningDir(cwd);
  const configPath = path.join(planBase, 'config.json');

  // Ensure planning directory exists
  try {
    if (!fs.existsSync(planBase)) {
      fs.mkdirSync(planBase, { recursive: true });
    }
  } catch (err) {
    error('Failed to create planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Parse user choices
  let choices = {};
  if (choicesJson) {
    try {
      choices = JSON.parse(choicesJson);
    } catch (err) {
      error('Invalid JSON choices: ' + err.message);
    }
  }

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.gsd', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Build config from defaults + choices
  const defaults = {
    mode: 'interactive',
    granularity: 'standard',
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    parallelization: true,
    brave_search: hasBraveSearch,
    git: {
      branching_strategy: 'none',
      phase_branch_template: 'gsd/phase-{phase}-{slug}',
      milestone_branch_template: 'gsd/{milestone}-{slug}',
    },
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
      nyquist_validation: true,
      auto_advance: false,
      node_repair: true,
      node_repair_budget: 2,
      ui_phase: true,
      ui_safety_gate: true,
      skip_discuss: false,
      research_before_questions: false,
      discuss_mode: 'discuss',
      ai_integration_phase: true,
      tdd_mode: false,
      code_review_command: null,
      pattern_mapper: true,
      security_enforcement: true,
      security_asvs_level: 1,
      security_block_on: 'high',
      cross_ai_execution: false,
      cross_ai_command: null,
      cross_ai_timeout: 120,
      subagent_timeout: 300000,
    },
    hooks: {
      context_warnings: true,
    },
    agent_skills: {},
    claude_md_path: './CLAUDE.md',
  };

  // Merge choices over defaults (shallow for top-level, deep for sections)
  const config = { ...defaults, ...choices };
  config.git = { ...defaults.git, ...(choices.git || {}) };
  config.workflow = { ...defaults.workflow, ...(choices.workflow || {}) };
  config.hooks = { ...defaults.hooks, ...(choices.hooks || {}) };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

function cmdConfigSetModelProfile(cwd, profile, raw) {
  if (!profile) {
    error(`Usage: config-set-model-profile <${VALID_PROFILES.join('|')}>`);
  }

  const normalizedProfile = profile.toLowerCase().trim();
  if (!VALID_PROFILES.includes(normalizedProfile)) {
    error(`Invalid profile '${profile}'. Valid profiles: ${VALID_PROFILES.join(', ')}`);
  }

  // Ensure config exists
  const planBase = planningDir(cwd);
  const configPath = path.join(planBase, 'config.json');
  if (!fs.existsSync(planBase)) {
    fs.mkdirSync(planBase, { recursive: true });
  }

  // Set the model profile
  const { previousValue } = setConfigValue(cwd, 'model_profile', normalizedProfile);
  const previousProfile = previousValue || 'balanced';

  const agentToModelMap = getAgentToModelMapForProfile(normalizedProfile);
  const result = {
    updated: true,
    profile: normalizedProfile,
    previousProfile,
    agentToModelMap,
  };

  const agentToModelTable = typeof formatAgentToModelMapAsTable === 'function'
    ? formatAgentToModelMapAsTable(agentToModelMap)
    : JSON.stringify(agentToModelMap);
  const didChange = previousProfile !== normalizedProfile;
  const rawValue = didChange
    ? `✓ Model profile set to: ${normalizedProfile} (was: ${previousProfile})\n\nAgents will now use:\n\n${agentToModelTable}\n\nNext spawned agents will use the new profile.`
    : `✓ Model profile is already set to: ${normalizedProfile}\n\nAgents are using:\n\n${agentToModelTable}`;
  output(result, raw, rawValue);
}

function cmdConfigPath(cwd, raw) {
  const configPath = path.join(planningDir(cwd), 'config.json');
  output(configPath, true, configPath);
}

module.exports = {
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
  cmdConfigNewProject,
  cmdConfigSetModelProfile,
  cmdConfigPath,
  VALID_CONFIG_KEYS,
  DYNAMIC_KEY_PATTERNS,
};
