'use strict';

/**
 * Regression tests for #3347 — opt-in auto-update of the knowledge graph
 * after main HEAD advances.
 *
 * This file covers the config-key surface: the new `graphify.auto_update`
 * key must be a valid config key, default to false, persist via config-set,
 * and round-trip via config-get. The runtime hook behavior is covered in
 * tests/feat-3347-graphify-auto-update-hook.test.cjs.
 *
 * Default-off discipline (issue #3347 acceptance criteria):
 *   - `graphify.auto_update` defaults to `false` so existing users see no
 *     behavior change after upgrade.
 *   - Opt-in via /gsd:settings or `gsd-tools config-set graphify.auto_update true`.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempProject, cleanup, runGsdTools } = require('./helpers.cjs');

const {
  VALID_CONFIG_KEYS,
  isValidConfigKey,
} = require('../get-shit-done/bin/lib/config-schema.cjs');

const {
  CONFIG_DEFAULTS: CANONICAL_CONFIG_DEFAULTS,
} = require('../get-shit-done/bin/lib/configuration.generated.cjs');

describe('#3347 — graphify.auto_update is a registered config key', () => {
  test('VALID_CONFIG_KEYS contains graphify.auto_update', () => {
    assert.ok(
      VALID_CONFIG_KEYS.has('graphify.auto_update'),
      'graphify.auto_update must be in VALID_CONFIG_KEYS so config-set accepts it',
    );
  });

  test('isValidConfigKey accepts graphify.auto_update', () => {
    assert.ok(
      isValidConfigKey('graphify.auto_update'),
      'isValidConfigKey must return true for graphify.auto_update',
    );
  });

  test('isValidConfigKey still accepts the pre-existing graphify.enabled key', () => {
    assert.ok(
      isValidConfigKey('graphify.enabled'),
      'regression guard: graphify.enabled must remain a valid key',
    );
  });
});

describe('#3347 — graphify.auto_update defaults to false', () => {
  test('CANONICAL_CONFIG_DEFAULTS.graphify.auto_update is false', () => {
    assert.ok(
      CANONICAL_CONFIG_DEFAULTS.graphify !== undefined,
      'CANONICAL_CONFIG_DEFAULTS must expose a graphify section',
    );
    assert.strictEqual(
      CANONICAL_CONFIG_DEFAULTS.graphify.auto_update,
      false,
      'graphify.auto_update default must be false (opt-in per issue #3347 AC)',
    );
  });
});

describe('#3347 — config-set graphify.auto_update round-trips', () => {
  test('config-set graphify.auto_update true succeeds', (t) => {
    const tmpDir = createTempProject();
    t.after(() => cleanup(tmpDir));

    const result = runGsdTools(
      ['config-set', 'graphify.auto_update', 'true'],
      tmpDir,
    );
    assert.ok(
      result.success,
      [
        'config-set graphify.auto_update true should succeed,',
        'got:',
        'stdout: ' + result.output,
        'stderr: ' + result.error,
      ].join('\n'),
    );
  });

  test('config-set graphify.auto_update true writes to config.json', (t) => {
    const tmpDir = createTempProject();
    t.after(() => cleanup(tmpDir));

    runGsdTools(['config-set', 'graphify.auto_update', 'true'], tmpDir);

    const configPath = path.join(tmpDir, '.planning', 'config.json');
    assert.ok(
      fs.existsSync(configPath),
      '.planning/config.json must exist after config-set',
    );

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(
      config.graphify?.auto_update,
      true,
      [
        'Expected graphify.auto_update: true in config.json,',
        'got: ' + JSON.stringify(config.graphify),
      ].join('\n'),
    );
  });

  test('config-set graphify.auto_update false persists too', (t) => {
    const tmpDir = createTempProject();
    t.after(() => cleanup(tmpDir));

    runGsdTools(['config-set', 'graphify.auto_update', 'true'], tmpDir);
    runGsdTools(['config-set', 'graphify.auto_update', 'false'], tmpDir);

    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(
      config.graphify?.auto_update,
      false,
      'config-set must round-trip true → false',
    );
  });

  test('config-set graphify.auto_update does not perturb sibling graphify.enabled', (t) => {
    const tmpDir = createTempProject();
    t.after(() => cleanup(tmpDir));

    runGsdTools(['config-set', 'graphify.enabled', 'true'], tmpDir);
    runGsdTools(['config-set', 'graphify.auto_update', 'true'], tmpDir);

    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(
      config.graphify?.enabled,
      true,
      'graphify.enabled must be preserved when setting graphify.auto_update',
    );
    assert.strictEqual(
      config.graphify?.auto_update,
      true,
      'graphify.auto_update must coexist with graphify.enabled',
    );
  });
});
