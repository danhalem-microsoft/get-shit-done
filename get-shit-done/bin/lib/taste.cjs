/**
 * Taste — User preference and taste entry management
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, output, error } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// --- Taste Loading ---------------------------------------------------------------

/**
 * Load active taste entries from .planning/taste/ directory
 *
 * @param {string} tastesDir - Path to taste directory (default: '.planning/taste/')
 * @returns {Array} Array of active taste entry objects, or [] if directory doesn't exist
 */
function loadActiveTasteEntries(tastesDir = '.planning/taste/') {
  // Early return if directory doesn't exist -- no errors, no warnings
  if (!fs.existsSync(tastesDir)) {
    return [];
  }

  try {
    // Get all .md files from the directory
    const files = fs.readdirSync(tastesDir).filter(f => f.endsWith('.md'));

    // If directory is empty or contains no .md files, return empty array
    if (files.length === 0) {
      return [];
    }

    const activeTastes = [];

    for (const file of files) {
      const filePath = path.join(tastesDir, file);
      const content = safeReadFile(filePath);

      if (!content) {
        // Skip files that can't be read
        continue;
      }

      // Parse YAML frontmatter
      const frontmatter = extractFrontmatter(content);

      // Filter for active status only
      if (frontmatter.status !== 'active') {
        continue;
      }

      // Extract required fields and add to active tastes
      activeTastes.push({
        id: frontmatter.id || '',
        domain: frontmatter.domain || '',
        title: frontmatter.title || '',
        confidence: frontmatter.confidence || '',
        pattern: frontmatter.pattern || '',
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        times_applied: parseInt(frontmatter.times_applied, 10) || 0,
        times_overridden: parseInt(frontmatter.times_overridden, 10) || 0,
      });
    }

    return activeTastes;
  } catch (err) {
    // Silent failure -- return empty array on any error
    return [];
  }
}

// --- Counter Updates -------------------------------------------------------------

/**
 * Batch-update taste entry counters (times_applied, times_overridden)
 *
 * @param {Object} counterUpdates - { applied: [{ tasteId, increment }], overridden: [{ tasteId, increment }] }
 * @param {string} tastesDir - Path to taste directory (default: '.planning/taste/')
 * @returns {Object} - { success: true/false, updated: number, errors: string[] }
 */
function updateTasteCounters(counterUpdates, tastesDir = '.planning/taste/') {
  const { reconstructFrontmatter } = require('./frontmatter.cjs');

  // Early return if no updates queued
  if (!counterUpdates ||
      (!counterUpdates.applied || counterUpdates.applied.length === 0) &&
      (!counterUpdates.overridden || counterUpdates.overridden.length === 0)) {
    return { success: true, updated: 0, errors: [] };
  }

  // Early return if taste directory doesn't exist
  if (!fs.existsSync(tastesDir)) {
    return {
      success: false,
      updated: 0,
      errors: ['Taste directory does not exist']
    };
  }

  // Group updates by taste ID (sum multiple increments to same taste)
  const aggregated = {};

  // Process applied updates
  if (counterUpdates.applied) {
    for (const update of counterUpdates.applied) {
      if (!update.tasteId) continue;
      if (!aggregated[update.tasteId]) {
        aggregated[update.tasteId] = { applied: 0, overridden: 0 };
      }
      aggregated[update.tasteId].applied += (update.increment || 1);
    }
  }

  // Process overridden updates
  if (counterUpdates.overridden) {
    for (const update of counterUpdates.overridden) {
      if (!update.tasteId) continue;
      if (!aggregated[update.tasteId]) {
        aggregated[update.tasteId] = { applied: 0, overridden: 0 };
      }
      aggregated[update.tasteId].overridden += (update.increment || 1);
    }
  }

  let updatedCount = 0;
  const errors = [];

  // Update each taste file
  for (const [tasteId, increments] of Object.entries(aggregated)) {
    try {
      // Find the taste file by ID
      const files = fs.readdirSync(tastesDir).filter(f => f.endsWith('.md'));
      let tasteFile = null;

      for (const file of files) {
        const filePath = path.join(tastesDir, file);
        const content = safeReadFile(filePath);
        if (!content) continue;

        const frontmatter = extractFrontmatter(content);
        if (frontmatter.id === tasteId) {
          tasteFile = filePath;
          break;
        }
      }

      if (!tasteFile) {
        errors.push(`Taste file not found for ID: ${tasteId}`);
        continue;
      }

      // Read the full file content
      const content = safeReadFile(tasteFile);
      if (!content) {
        errors.push(`Could not read taste file: ${tasteFile}`);
        continue;
      }

      // Parse frontmatter and body
      const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        errors.push(`Invalid frontmatter in file: ${tasteFile}`);
        continue;
      }

      const frontmatter = extractFrontmatter(content);
      const body = frontmatterMatch[2];

      // Initialize missing counter fields to 0 before incrementing
      if (!frontmatter.times_applied) frontmatter.times_applied = 0;
      if (!frontmatter.times_overridden) frontmatter.times_overridden = 0;

      // Increment counters
      frontmatter.times_applied = parseInt(frontmatter.times_applied, 10) + increments.applied;
      frontmatter.times_overridden = parseInt(frontmatter.times_overridden, 10) + increments.overridden;

      // Reconstruct YAML frontmatter
      const yamlLines = reconstructFrontmatter(frontmatter);
      const updatedContent = `---\n${yamlLines}\n---\n${body}`;

      // Write back to file
      fs.writeFileSync(tasteFile, updatedContent, 'utf8');
      updatedCount++;

    } catch (err) {
      errors.push(`Error updating taste ${tasteId}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    updated: updatedCount,
    errors: errors,
  };
}

// --- Exports ---------------------------------------------------------------------

module.exports = {
  loadActiveTasteEntries,
  updateTasteCounters,
};
