/**
 * Bug: descriptions starting with '[' (e.g. "[DEPRECATED] ...") produced
 * unquoted YAML output that runtime parsers reject as a malformed flow
 * sequence. Copilot CLI emitted "Failed to load 6 skills" after install
 * because all 6 deprecated stub skills (gsd-code-review, gsd-code-review-fix,
 * gsd-critique, gsd-plan-review-convergence, gsd-secure-phase,
 * gsd-validate-phase) had descriptions starting with '['.
 *
 * Root cause: 4 converter functions emitted `description: ${description}`
 * without quoting, while every other converter used `yamlQuote(description)`.
 *
 * Fix: route all 4 sites through yamlQuote (which is JSON.stringify, so the
 * output is a double-quoted YAML scalar — safe regardless of leading char).
 */

process.env.GSD_TEST_MODE = '1';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const install = require('../bin/install.js');

function extractDescriptionLine(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error('no frontmatter');
  const line = m[1].split(/\r?\n/).find(l => l.startsWith('description:'));
  if (!line) throw new Error('no description line');
  return line;
}

// A description value containing leading '[' or any special YAML character
// must be emitted as a quoted scalar (double-quoted via yamlQuote/JSON.stringify
// or single-quoted) — never as a bare scalar. A bare '[...]' is interpreted
// by YAML parsers as a flow sequence and rejected.
function assertQuotedDescription(content, expectedValue, label) {
  const line = extractDescriptionLine(content);
  // Strip "description: " prefix
  const value = line.slice('description:'.length).trimStart();
  assert.ok(
    value.startsWith('"') || value.startsWith("'"),
    `${label}: description must be a quoted YAML scalar, got bare value: ${value}`,
  );
  // For double-quoted (our chosen form), the value must JSON-parse back to the original.
  if (value.startsWith('"')) {
    let parsed;
    assert.doesNotThrow(
      () => { parsed = JSON.parse(value); },
      `${label}: double-quoted description must JSON-parse`,
    );
    assert.equal(parsed, expectedValue, `${label}: description round-trip`);
  }
}

describe('descriptions starting with bracket are YAML-safe after conversion (#deprecated-stub)', () => {
  const claudeCommand = [
    '---',
    'name: gsd:code-review',
    'description: "[DEPRECATED] Use /gsd-review --code instead. This stub will be removed in a future milestone."',
    'argument-hint: "<phase> [other flags]"',
    'allowed-tools:',
    '  - Read',
    '  - Write',
    '  - Bash',
    '---',
    '',
    'Body content here.',
  ].join('\n');

  const claudeAgent = [
    '---',
    'name: gsd-test-agent',
    'description: "[DEPRECATED] Use the new agent instead. Removed in next milestone."',
    'tools: Read, Write, Bash',
    'color: yellow',
    '---',
    '',
    'Agent body.',
  ].join('\n');

  const expectedSkillDesc =
    '[DEPRECATED] Use /gsd-review --code instead. This stub will be removed in a future milestone.';
  const expectedAgentDesc =
    '[DEPRECATED] Use the new agent instead. Removed in next milestone.';

  test('Copilot skill: bracket description is quoted', () => {
    const out = install.convertClaudeCommandToCopilotSkill(claudeCommand, 'gsd-code-review', true);
    assertQuotedDescription(out, expectedSkillDesc, 'convertClaudeCommandToCopilotSkill');
  });

  test('Copilot agent: bracket description is quoted', () => {
    const out = install.convertClaudeAgentToCopilotAgent(claudeAgent, true);
    assertQuotedDescription(out, expectedAgentDesc, 'convertClaudeAgentToCopilotAgent');
  });

  test('Antigravity skill: bracket description is quoted', () => {
    const fn = install.convertClaudeCommandToAntigravitySkill;
    if (typeof fn !== 'function') return; // export gated; skip if not in build
    const out = fn(claudeCommand, 'gsd-code-review', true);
    assertQuotedDescription(out, expectedSkillDesc, 'convertClaudeCommandToAntigravitySkill');
  });

  test('Antigravity agent: bracket description is quoted', () => {
    const fn = install.convertClaudeAgentToAntigravityAgent;
    if (typeof fn !== 'function') return;
    const out = fn(claudeAgent, true);
    assertQuotedDescription(out, expectedAgentDesc, 'convertClaudeAgentToAntigravityAgent');
  });
});

