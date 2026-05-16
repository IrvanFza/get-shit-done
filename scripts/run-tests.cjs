#!/usr/bin/env node
// Cross-platform test runner — resolves test file globs via Node
// instead of relying on shell expansion (which fails on Windows PowerShell/cmd).
// Propagates NODE_V8_COVERAGE so c8 collects coverage from the child process.
//
// Suite filtering (issue #3597):
//   node scripts/run-tests.cjs                 # default — runs ALL tests (backcompat)
//   node scripts/run-tests.cjs --suite all     # explicit "everything"
//   node scripts/run-tests.cjs --suite unit    # only files with no other suite marker
//   node scripts/run-tests.cjs --suite security    # *.security.test.cjs
//   node scripts/run-tests.cjs --suite integration # *.integration.test.cjs
//   node scripts/run-tests.cjs --suite install     # *.install.test.cjs
//   node scripts/run-tests.cjs --suite slow        # *.slow.test.cjs
//
// Suite grouping convention: filename suffix marker before `.test.cjs`.
// A file named `foo.security.test.cjs` belongs to the `security` suite.
// A file named `foo.test.cjs` (no marker) belongs to the `unit` suite.
// See docs/TESTING-SUITES.md for full grouping policy.
'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const SUITES = ['all', 'unit', 'integration', 'install', 'security', 'slow'];
const MARKED_SUITES = ['integration', 'install', 'security', 'slow'];

function parseArgs(argv) {
  let suite = null;
  let seen = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--suite') {
      if (seen) {
        return { error: 'duplicate --suite flag' };
      }
      seen = true;
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        return { error: '--suite requires a value' };
      }
      suite = v;
      i++;
    } else if (a.startsWith('--suite=')) {
      if (seen) {
        return { error: 'duplicate --suite flag' };
      }
      seen = true;
      suite = a.slice('--suite='.length);
      if (!suite) {
        return { error: '--suite requires a value' };
      }
    } else {
      return { error: `unknown argument: ${a}` };
    }
  }
  return { suite };
}

// Return the marked suite name embedded in a filename, or null if it's unmarked.
// foo.security.test.cjs -> "security"
// foo.test.cjs          -> null (unit)
function suiteOf(filename) {
  if (!filename.endsWith('.test.cjs')) return null;
  const base = filename.slice(0, -'.test.cjs'.length);
  const lastDot = base.lastIndexOf('.');
  if (lastDot === -1) return null;
  const marker = base.slice(lastDot + 1);
  return MARKED_SUITES.includes(marker) ? marker : null;
}

function selectFiles(allFiles, suite) {
  if (suite === null || suite === 'all') {
    return allFiles;
  }
  if (suite === 'unit') {
    return allFiles.filter(f => suiteOf(f) === null);
  }
  return allFiles.filter(f => suiteOf(f) === suite);
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);
  if (parsed.error) {
    console.error(`run-tests: ${parsed.error}`);
    console.error(`Valid suites: ${SUITES.join(', ')}`);
    process.exit(2);
  }
  const suite = parsed.suite;
  if (suite !== null && !SUITES.includes(suite)) {
    console.error(`run-tests: unknown suite "${suite}"`);
    console.error(`Valid suites: ${SUITES.join(', ')}`);
    process.exit(2);
  }

  const testDir = process.env.GSD_TEST_DIR
    ? process.env.GSD_TEST_DIR
    : join(__dirname, '..', 'tests');

  const allFiles = readdirSync(testDir)
    .filter(f => f.endsWith('.test.cjs'))
    .sort();

  if (allFiles.length === 0) {
    console.error('No test files found in tests/');
    process.exit(1);
  }

  const selected = selectFiles(allFiles, suite).map(f => join(testDir, f));

  if (selected.length === 0) {
    // Empty suite: report and exit 0 so empty lanes (e.g. `security` before
    // adversarial tests land) don't gate CI. CI consumers wanting strictness
    // can grep stderr for "no tests in suite".
    console.error(`run-tests: no tests in suite "${suite || 'all'}"`);
    process.exit(0);
  }

  // Log selected files to stderr for CI / harness-test visibility.
  // node:test default reporter doesn't echo filenames, so this gives
  // operators a single stable line they can grep.
  console.error(
    `run-tests: suite="${suite || 'all'}" files=${selected.length}: ${selected
      .map(f => f.split(/[\\/]/).pop())
      .join(' ')}`,
  );

  const concurrency = process.env.TEST_CONCURRENCY
    ? `--test-concurrency=${process.env.TEST_CONCURRENCY}`
    : '--test-concurrency=4';

  try {
    execFileSync(process.execPath, ['--test', concurrency, ...selected], {
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

main();
