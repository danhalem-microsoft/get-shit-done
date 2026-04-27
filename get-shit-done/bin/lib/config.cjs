/**
 * Config — Planning config CRUD operations
 */

const fs = require('fs');
const path = require('path');
const { output, error, getPlanningRoot } = require('./core.cjs');
const { isValidConfigKey } = require('./config-schema.cjs');
const { VALID_PROFILES, getAgentToModelMapForProfile } = require('./model-profiles.cjs');

/**
 * Known misspellings / aliases → canonical key for helpful error messages.
 */
const KNOWN_ALIASES = {
  'workflow.nyquist_validation_enabled': 'workflow.nyquist_validation',
  'hooks.research_questions': 'workflow.research_before_questions',
  'workflow.nyquist': 'workflow.nyquist_validation',
  'workflow.plan_checker': 'workflow.plan_check',
};

/**
 * Context values accepted by config-set context.
 */
const VALID_CONTEXTS = ['dev', 'research', 'review'];

function cmdConfigEnsureSection(cwd, raw) {
  const planningRoot = getPlanningRoot(cwd);
  const configPath = path.join(cwd, planningRoot, 'config.json');
  const planningDir = path.join(cwd, planningRoot);

  // Ensure planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
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
    },
    hooks: {
      context_warnings: true,
    },
    parallelization: true,
    brave_search: hasBraveSearch,
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
    const result = { created: true, path: planningRoot + '/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

function cmdConfigSet(cwd, keyPath, value, raw) {
  const configPath = path.join(cwd, getPlanningRoot(cwd), 'config.json');

  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  // Validate key
  if (!isValidConfigKey(keyPath)) {
    const suggestion = KNOWN_ALIASES[keyPath];
    let msg = `Unknown config key: ${keyPath}`;
    if (suggestion) {
      msg += `\nDid you mean: ${suggestion}`;
    }
    error(msg);
  }

  // Validate context values
  if (keyPath === 'context') {
    if (!VALID_CONTEXTS.includes(value)) {
      error(`Invalid context value: "${value}". Valid values: ${VALID_CONTEXTS.join(', ')}`);
    }
  }

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  // Load existing config or start with empty object
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    error('Failed to read config.json: ' + err.message);
  }

  // Set nested value using dot notation (e.g., "workflow.research")
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = parsedValue;

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { updated: true, key: keyPath, value: parsedValue };
    output(result, raw, `${keyPath}=${parsedValue}`);
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

function cmdConfigGet(cwd, keyPath, raw, defaultValue) {
  const planningRoot = getPlanningRoot(cwd);
  const configPath = path.join(cwd, planningRoot, 'config.json');

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
  const planningRoot = getPlanningRoot(cwd);
  const configPath = path.join(cwd, planningRoot, 'config.json');
  const planningDir = path.join(cwd, planningRoot);

  // Ensure planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
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
    },
    hooks: {
      context_warnings: true,
    },
  };

  // Merge choices over defaults (shallow for top-level, deep for sections)
  const config = { ...defaults, ...choices };
  config.git = { ...defaults.git, ...(choices.git || {}) };
  config.workflow = { ...defaults.workflow, ...(choices.workflow || {}) };
  config.hooks = { ...defaults.hooks, ...(choices.hooks || {}) };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { created: true, path: planningRoot + '/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

function cmdConfigSetModelProfile(cwd, profile, raw) {
  if (!profile) {
    error('Usage: config-set-model-profile <profile>');
  }

  const normalizedProfile = profile.toLowerCase().trim();
  if (!VALID_PROFILES.includes(normalizedProfile)) {
    error(`Invalid profile: "${profile}". Valid profiles: ${VALID_PROFILES.join(', ')}`);
  }

  const planningRoot = getPlanningRoot(cwd);
  const configPath = path.join(cwd, planningRoot, 'config.json');
  const planningDir = path.join(cwd, planningRoot);

  // Ensure config exists, creating with defaults if needed
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      config = {};
    }
  } else {
    // Create planning dir if needed
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  }

  const previousProfile = config.model_profile || 'balanced';
  config.model_profile = normalizedProfile;

  const agentToModelMap = getAgentToModelMapForProfile(normalizedProfile);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = {
      updated: true,
      profile: normalizedProfile,
      previousProfile,
      agentToModelMap,
    };
    output(result, raw, `model_profile=${normalizedProfile}`);
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

function cmdConfigPath(cwd, raw) {
  const planningRoot = getPlanningRoot(cwd);
  const wsName = process.env.GSD_WORKSTREAM;
  let configPath;
  if (wsName) {
    configPath = path.join(cwd, planningRoot, 'workstreams', wsName, 'config.json');
  } else {
    configPath = path.join(cwd, planningRoot, 'config.json');
  }
  // Output raw path string (not JSON-wrapped) so callers can use it directly as a file path
  output(configPath, true, configPath);
}

module.exports = {
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
  cmdConfigNewProject,
  cmdConfigSetModelProfile,
  cmdConfigPath,
};
