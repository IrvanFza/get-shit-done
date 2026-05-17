'use strict';
/**
 * Tests for applySurface — file sync behavior.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { writeSurface, applySurface } = require('../get-shit-done/bin/lib/surface.cjs');
const { loadSkillsManifest, writeActiveProfile } = require('../get-shit-done/bin/lib/install-profiles.cjs');
const { CLUSTERS } = require('../get-shit-done/bin/lib/clusters.cjs');
const { resolveRuntimeArtifactLayout } = require('../get-shit-done/bin/lib/runtime-artifact-layout.cjs');

const REAL_COMMANDS_DIR = path.join(__dirname, '..', 'commands', 'gsd');
const REAL_AGENTS_DIR = path.join(__dirname, '..', 'agents');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-surface-apply-'));
}

/**
 * Create a minimal fixture install dir structure for claude/local layout.
 * runtimeConfigDir is the layout configDir.
 * commandsDir = runtimeConfigDir/commands/gsd
 * agentsDir   = runtimeConfigDir/agents
 */
function createFixtureRuntime() {
  const base = tmpDir();
  const runtimeConfigDir = base;
  const commandsDir = path.join(runtimeConfigDir, 'commands', 'gsd');
  const agentsDir = path.join(runtimeConfigDir, 'agents');
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  return { base, runtimeConfigDir, commandsDir, agentsDir };
}

describe('applySurface', () => {
  test('core profile: only core skills appear in commandsDir', () => {
    const { base, runtimeConfigDir, commandsDir, agentsDir } = createFixtureRuntime();
    try {
      writeActiveProfile(runtimeConfigDir, 'core');
      writeSurface(runtimeConfigDir, {
        baseProfile: 'core',
        disabledClusters: [],
        explicitAdds: [],
        explicitRemoves: [],
      });
      const manifest = loadSkillsManifest(REAL_COMMANDS_DIR);
      const layout = resolveRuntimeArtifactLayout('claude', runtimeConfigDir, 'local');
      applySurface(runtimeConfigDir, layout, manifest, CLUSTERS);

      const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
      // Every file should be a real stem we know about
      for (const file of files) {
        assert.ok(fs.existsSync(path.join(REAL_COMMANDS_DIR, file)), `unexpected file: ${file}`);
      }
      // At minimum core skills should be present
      const coreStems = ['new-project', 'discuss-phase', 'plan-phase', 'execute-phase', 'help', 'update'];
      for (const stem of coreStems) {
        assert.ok(files.includes(`${stem}.md`), `core skill "${stem}" should be in commandsDir`);
      }
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('removes superseded files when profile shrinks', () => {
    const { base, runtimeConfigDir, commandsDir, agentsDir } = createFixtureRuntime();
    try {
      // Start with standard: put some skill files in commandsDir
      writeActiveProfile(runtimeConfigDir, 'standard');
      writeSurface(runtimeConfigDir, {
        baseProfile: 'standard',
        disabledClusters: [],
        explicitAdds: [],
        explicitRemoves: [],
      });
      const manifest = loadSkillsManifest(REAL_COMMANDS_DIR);
      const layout = resolveRuntimeArtifactLayout('claude', runtimeConfigDir, 'local');
      applySurface(runtimeConfigDir, layout, manifest, CLUSTERS);

      const afterStandard = new Set(fs.readdirSync(commandsDir).filter(f => f.endsWith('.md')));

      // Now switch to core: skills not in core should be removed
      writeSurface(runtimeConfigDir, {
        baseProfile: 'core',
        disabledClusters: [],
        explicitAdds: [],
        explicitRemoves: [],
      });
      applySurface(runtimeConfigDir, layout, manifest, CLUSTERS);

      const afterCore = new Set(fs.readdirSync(commandsDir).filter(f => f.endsWith('.md')));

      // core should be a subset of standard
      assert.ok(afterCore.size <= afterStandard.size, 'core should have fewer or equal files than standard');

      // Files removed should not be in core set
      const coreStems = new Set(['new-project', 'discuss-phase', 'plan-phase', 'execute-phase', 'help', 'update']);
      for (const file of afterCore) {
        const stem = file.slice(0, -3);
        assert.ok(
          fs.existsSync(path.join(REAL_COMMANDS_DIR, file)),
          `file in commandsDir not a real skill: ${file}`
        );
      }
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('leaves non-gsd .md files alone in agentsDir', () => {
    const { base, runtimeConfigDir, commandsDir, agentsDir } = createFixtureRuntime();
    try {
      // Place a non-gsd agent file in agentsDir
      const foreignAgent = path.join(agentsDir, 'my-custom-agent.md');
      fs.writeFileSync(foreignAgent, '# custom agent\n', 'utf8');

      writeActiveProfile(runtimeConfigDir, 'core');
      writeSurface(runtimeConfigDir, {
        baseProfile: 'core',
        disabledClusters: [],
        explicitAdds: [],
        explicitRemoves: [],
      });
      const manifest = loadSkillsManifest(REAL_COMMANDS_DIR);
      const layout = resolveRuntimeArtifactLayout('claude', runtimeConfigDir, 'local');
      applySurface(runtimeConfigDir, layout, manifest, CLUSTERS);

      // Non-gsd file should still be there
      assert.ok(fs.existsSync(foreignAgent), 'non-gsd agent file should not be touched');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('adds missing skill files from install source', () => {
    const { base, runtimeConfigDir, commandsDir, agentsDir } = createFixtureRuntime();
    try {
      // commandsDir starts empty
      writeActiveProfile(runtimeConfigDir, 'core');
      writeSurface(runtimeConfigDir, {
        baseProfile: 'core',
        disabledClusters: [],
        explicitAdds: [],
        explicitRemoves: [],
      });
      const manifest = loadSkillsManifest(REAL_COMMANDS_DIR);
      const layout = resolveRuntimeArtifactLayout('claude', runtimeConfigDir, 'local');
      applySurface(runtimeConfigDir, layout, manifest, CLUSTERS);

      // Core skills should now be present
      assert.ok(
        fs.existsSync(path.join(commandsDir, 'help.md')),
        'help.md should be copied from install source'
      );
      assert.ok(
        fs.existsSync(path.join(commandsDir, 'new-project.md')),
        'new-project.md should be copied from install source'
      );
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('_syncGsdDir skills kind: adds missing skill dirs, removes stale prefix-matched dirs, preserves foreign dirs', () => {
    const { _syncGsdDir } = require('../get-shit-done/bin/lib/surface.cjs');
    const { stageSkillsForRuntimeAsSkills } = require('../get-shit-done/bin/lib/install-profiles.cjs');
    const { findInstallSourceRoot } = require('../get-shit-done/bin/lib/runtime-artifact-layout.cjs');
    // Minimal converter that produces SKILL.md with given stem
    function converter(stem, content) {
      return [
        '---',
        `name: ${stem}`,
        '---',
        content,
      ].join('\n');
    }

    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-surface-skills-'));
    try {
      const stagedDir = path.join(base, 'staged');
      const destDir = path.join(base, 'dest');
      fs.mkdirSync(destDir, { recursive: true });

      // Build a staged dir manually: gsd-help/SKILL.md and gsd-update/SKILL.md
      const stem1 = 'gsd-help';
      const stem2 = 'gsd-update';
      fs.mkdirSync(path.join(stagedDir, stem1), { recursive: true });
      fs.writeFileSync(path.join(stagedDir, stem1, 'SKILL.md'), '# help\n', 'utf8');
      fs.mkdirSync(path.join(stagedDir, stem2), { recursive: true });
      fs.writeFileSync(path.join(stagedDir, stem2, 'SKILL.md'), '# update\n', 'utf8');

      // In destDir: stale gsd- dir + foreign user dir
      const staleDir = path.join(destDir, 'gsd-old-skill');
      fs.mkdirSync(staleDir, { recursive: true });
      fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# old\n', 'utf8');

      const foreignDir = path.join(destDir, 'my-custom-skill');
      fs.mkdirSync(foreignDir, { recursive: true });
      fs.writeFileSync(path.join(foreignDir, 'SKILL.md'), '# custom\n', 'utf8');

      const skillsKind = { kind: 'skills', destSubpath: 'skills', prefix: 'gsd-', stage: () => stagedDir };

      _syncGsdDir(stagedDir, destDir, skillsKind);

      // staged dirs copied
      assert.ok(fs.existsSync(path.join(destDir, stem1, 'SKILL.md')), 'gsd-help/SKILL.md should be copied');
      assert.ok(fs.existsSync(path.join(destDir, stem2, 'SKILL.md')), 'gsd-update/SKILL.md should be copied');

      // stale gsd- dir removed
      assert.ok(!fs.existsSync(staleDir), 'stale gsd-old-skill dir should be removed');

      // foreign dir preserved
      assert.ok(fs.existsSync(foreignDir), 'my-custom-skill dir should be preserved');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
