'use strict';

/**
 * Runtime artifact layout module — resolves the artifact directory shapes
 * (commands, agents, skills) for each supported runtime.
 *
 * grok is intentionally absent: it is in runtime-homes.cjs but not wired
 * here. The TypeError on unknown runtime is the loud-fail signal that a
 * runtime was added to the homes list without a layout entry.
 */

const path = require('path');
const fs = require('fs');

const {
  stageSkillsForProfile,
  stageAgentsForProfile,
  stageSkillsForRuntimeAsSkills,
} = require('./install-profiles.cjs');

// Load converters from bin/install.js in test-safe way (GSD_TEST_MODE skips main logic)
process.env.GSD_TEST_MODE = process.env.GSD_TEST_MODE || '1';
const {
  convertClaudeCommandToClaudeSkill,
  convertClaudeCommandToCursorSkill,
  convertClaudeCommandToCodexSkill,
  convertClaudeCommandToCopilotSkill,
  convertClaudeCommandToAntigravitySkill,
  convertClaudeCommandToWindsurfSkill,
  convertClaudeCommandToAugmentSkill,
  convertClaudeCommandToTraeSkill,
  convertClaudeCommandToCodebuddySkill,
} = require('../../../bin/install.js');

/**
 * @typedef {'commands'|'agents'|'skills'} ArtifactKindName
 * @typedef {Object} ArtifactKind
 * @property {ArtifactKindName} kind
 * @property {string} destSubpath
 * @property {string} prefix
 * @property {(resolvedProfile: Object) => string} stage
 * @typedef {Object} Layout
 * @property {string} runtime
 * @property {string} configDir
 * @property {ArtifactKind[]} kinds
 */

// ---------------------------------------------------------------------------
// Source root finders
// ---------------------------------------------------------------------------

/**
 * Walk up from __dirname to find commands/gsd. Walk-up-only for Phase 1;
 * the .gsd-source marker check (which requires runtimeConfigDir) is deferred.
 *
 * @param {string} [overrideRoot] optional override for testability
 * @returns {string}
 */
function findInstallSourceRoot(overrideRoot) {
  if (overrideRoot) return overrideRoot;
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'commands', 'gsd');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(__dirname, '..', '..', '..', 'commands', 'gsd');
}

/**
 * Walk up from __dirname to find agents/. Walk-up-only for Phase 1.
 *
 * @param {string} [overrideRoot] optional override for testability
 * @returns {string|null}
 */
function findAgentsSourceRoot(overrideRoot) {
  if (overrideRoot) return overrideRoot;
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'agents');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Allowlisted runtimes
// ---------------------------------------------------------------------------

const ALLOWED_RUNTIMES = new Set([
  'claude', 'cursor', 'gemini', 'codex', 'copilot', 'antigravity',
  'windsurf', 'augment', 'trae', 'qwen', 'hermes', 'codebuddy',
  'cline', 'opencode', 'kilo',
]);

// ---------------------------------------------------------------------------
// Layout table builders
// ---------------------------------------------------------------------------

function commandsKind(destSubpath, prefix, srcOverride) {
  return {
    kind: 'commands',
    destSubpath,
    prefix,
    stage: (resolved) => stageSkillsForProfile(findInstallSourceRoot(srcOverride), resolved),
  };
}

function agentsKind(destSubpath, prefix, srcOverride) {
  return {
    kind: 'agents',
    destSubpath,
    prefix,
    stage: (resolved) => stageAgentsForProfile(findAgentsSourceRoot(srcOverride), resolved),
  };
}

function skillsKind(destSubpath, prefix, converter, srcOverride) {
  return {
    kind: 'skills',
    destSubpath,
    prefix,
    stage: (resolved) => stageSkillsForRuntimeAsSkills(findInstallSourceRoot(srcOverride), resolved, converter, prefix),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the artifact layout for a given runtime and config directory.
 *
 * @param {string} runtime
 * @param {string} configDir
 * @param {'local'|'global'} [scope]
 * @returns {Layout}
 */
function resolveRuntimeArtifactLayout(runtime, configDir, scope = 'global') {
  if (typeof configDir !== 'string' || configDir === '') {
    throw new TypeError('configDir must be a non-empty string');
  }
  if (scope !== 'local' && scope !== 'global') {
    throw new TypeError('scope must be "local" or "global"');
  }
  if (!ALLOWED_RUNTIMES.has(runtime)) {
    throw new TypeError(`Unknown runtime: '${runtime}' — add to runtime-artifact-layout.cjs table`);
  }

  let kinds;
  switch (runtime) {
    case 'claude':
      if (scope === 'local') {
        kinds = [
          commandsKind('commands/gsd', 'gsd-'),
          agentsKind('agents', 'gsd-'),
        ];
      } else {
        kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToClaudeSkill)];
      }
      break;

    case 'cursor':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToCursorSkill)];
      break;

    case 'gemini':
      kinds = [commandsKind('commands/gsd', 'gsd-')];
      break;

    case 'codex':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToCodexSkill)];
      break;

    case 'copilot':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToCopilotSkill)];
      break;

    case 'antigravity':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToAntigravitySkill)];
      break;

    case 'windsurf':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToWindsurfSkill)];
      break;

    case 'augment':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToAugmentSkill)];
      break;

    case 'trae':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToTraeSkill)];
      break;

    case 'qwen':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToClaudeSkill)];
      break;

    case 'hermes':
      kinds = [skillsKind('skills/gsd', '', convertClaudeCommandToClaudeSkill)];
      break;

    case 'codebuddy':
      kinds = [skillsKind('skills', 'gsd-', convertClaudeCommandToCodebuddySkill)];
      break;

    case 'cline':
      kinds = [];
      break;

    case 'opencode':
      kinds = [commandsKind('command', 'gsd-')];
      break;

    case 'kilo':
      kinds = [commandsKind('command', 'gsd-')];
      break;

    default:
      throw new TypeError(`Unknown runtime: '${runtime}' — add to runtime-artifact-layout.cjs table`);
  }

  return { runtime, configDir, kinds };
}

module.exports = { resolveRuntimeArtifactLayout, findInstallSourceRoot };
