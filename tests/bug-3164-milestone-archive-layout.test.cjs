'use strict';

/**
 * #3164 — gsd-tools doesn't support .planning/milestones/v*-phases/ layout.
 *
 * Validators hardcode `phasesDir = .planning/phases/`. On projects that have
 * graduated to milestone-archive layout (.planning/milestones/v*-phases/),
 * the old path doesn't exist and diskPhases stays empty, triggering W006
 * "Phase N in ROADMAP.md but no directory on disk" for every active phase.
 *
 * Fix: resolve phasesDir to the active milestone's archive dir when
 * .planning/phases/ does not exist.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempProject, cleanup, runGsdTools } = require('./helpers.cjs');

function setupMilestoneArchiveProject(tmpDir, options = {}) {
  const {
    milestone = 'v1.7',
    phases = ['64-secondary-grader-fix'],
    roadmapPhases = ['64'],
  } = options;

  // Remove the default .planning/phases/ dir (milestone-archive layout has no flat phases/)
  fs.rmSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true, force: true });

  // Create milestone-archive phase directories
  const archiveDir = path.join(tmpDir, '.planning', 'milestones', `${milestone}-phases`);
  for (const phase of phases) {
    const phaseDir = path.join(archiveDir, phase);
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), `# Plan\nPhase ${phase}\n`);
  }

  // Write STATE.md with current milestone
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'STATE.md'),
    `milestone: ${milestone}\n# Session State\n\nPhase: ${roadmapPhases[0]}\n`
  );

  // Write PROJECT.md
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'PROJECT.md'),
    '# Project\n\n## What This Is\nTest.\n## Core Value\nTest.\n## Requirements\nTest.\n'
  );

  // Write ROADMAP.md with phases in the milestone section
  const phaseLines = roadmapPhases.map(n => `### Phase ${n}: Description\n\nGoal: implement it.\n`).join('\n');
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'ROADMAP.md'),
    `# Roadmap\n\n## Roadmap ${milestone}: Current\n\n${phaseLines}\n`
  );

  // Write config.json
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify({ model_profile: 'balanced', commit_docs: true }, null, 2)
  );
}

describe('#3164 — validate consistency: milestone-archive layout', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('no W006 warnings for phases that exist in .planning/milestones/v*-phases/', () => {
    setupMilestoneArchiveProject(tmpDir, {
      milestone: 'v1.7',
      phases: ['64-secondary-grader-fix'],
      roadmapPhases: ['64'],
    });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `validate consistency should succeed: ${result.error}`);

    const out = JSON.parse(result.output);
    const w006 = (out.warnings || []).filter(w => w.includes('Phase 64') && w.includes('no directory'));
    assert.deepStrictEqual(
      w006, [],
      `Got spurious W006 for phase 64 in milestone-archive layout:\n  ${w006.join('\n  ')}`
    );
  });

  test('no W006 when multiple phases exist in milestone-archive layout', () => {
    setupMilestoneArchiveProject(tmpDir, {
      milestone: 'v1.7',
      phases: ['48-feature-a', '51-feature-b', '64-feature-c'],
      roadmapPhases: ['48', '51', '64'],
    });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `validate consistency should succeed: ${result.error}`);

    const out = JSON.parse(result.output);
    const w006 = (out.warnings || []).filter(w => w.includes('no directory'));
    assert.deepStrictEqual(
      w006, [],
      `Got spurious W006 warnings in milestone-archive layout:\n  ${w006.join('\n  ')}`
    );
  });
});

describe('#3164 — validate health: milestone-archive layout', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('no W006 warnings for phases that exist in .planning/milestones/v*-phases/', () => {
    setupMilestoneArchiveProject(tmpDir, {
      milestone: 'v1.7',
      phases: ['64-secondary-grader-fix'],
      roadmapPhases: ['64'],
    });

    const result = runGsdTools('validate health', tmpDir);
    assert.ok(result.success, `validate health should succeed: ${result.error}`);

    const out = JSON.parse(result.output);
    const w006 = (out.warnings || []).filter(w => {
      const msg = typeof w === 'string' ? w : w.message;
      return msg && msg.includes('Phase 64') && msg.includes('no directory');
    });
    assert.deepStrictEqual(
      w006, [],
      `Got spurious W006 for phase 64 in milestone-archive validate health:\n  ${w006.map(w => typeof w === 'string' ? w : w.message).join('\n  ')}`
    );
  });
});

describe('#3164 — find-phase: milestone-archive layout', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('find-phase 64 returns found:true for phase in .planning/milestones/v*-phases/', () => {
    setupMilestoneArchiveProject(tmpDir, {
      milestone: 'v1.7',
      phases: ['64-secondary-grader-fix'],
      roadmapPhases: ['64'],
    });

    const result = runGsdTools('find-phase 64', tmpDir);
    assert.ok(result.success, `find-phase should succeed: ${result.error}`);

    const out = JSON.parse(result.output);
    assert.strictEqual(out.found, true, `find-phase 64 should return found:true, got: ${JSON.stringify(out)}`);
  });
});
