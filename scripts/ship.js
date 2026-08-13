#!/usr/bin/env node
/**
 * Ship Script — the one command that releases and publishes.
 *
 * Why this exists instead of doing it all from the pre-push hook: git freezes the
 * list of refs to send BEFORE running pre-push, so a release commit created inside
 * the hook is never part of that push. It stays local and needs a second push,
 * which is how 19 tags once went unpublished. Here the order is explicit:
 * validate → bump → push, with the push happening after the commit exists.
 */

const { execFileSync } = require('node:child_process');
const {
  git,
  getUnpushedCommits,
  hasVersionableCommits,
  isReleaseCommit,
} = require('./release-utils');

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

function fail(message, hint) {
  console.error(`\n  ERROR: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

function step(message) {
  console.log(`\n  → ${message}`);
}

function main() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') {
    fail(`Not on main (currently on "${branch}").`, 'Releases are cut from main only.');
  }

  if (git(['status', '--porcelain'])) {
    fail('Working tree is not clean.', 'Commit or stash your changes first.');
  }

  step('Fetching origin/main');
  run('git', ['fetch', 'origin', 'main', '--quiet']);

  if (git(['rev-list', '--count', 'HEAD..origin/main']) !== '0') {
    fail('origin/main has commits you do not have.', 'Run "git pull --rebase" first.');
  }

  const unpushed = getUnpushedCommits();
  if (!unpushed) {
    console.log('\n  Nothing to push. main is already in sync with origin/main.\n');
    return;
  }

  console.log('\n  Commits to publish:');
  unpushed
    .split('\n')
    .filter(Boolean)
    .forEach((line) => {
      console.log(`    ${line}`);
    });

  step('Type checking');
  run('npm', ['run', 'check-types']);

  step('Linting');
  run('npm', ['run', 'lint']);

  step('Running tests');
  run('npm', ['test']);

  const released = hasVersionableCommits(unpushed) && !isReleaseCommit();

  if (released) {
    step('Releasing');
    run('npm', ['run', 'release']);
  } else {
    step('No versionable commits (feat/fix/perf). Skipping the version bump');
  }

  // --no-verify: everything the pre-push hook checks has already run above, and
  // skipping it keeps this push from recursing back into the release logic.
  step('Pushing');
  run('git', ['push', '--follow-tags', '--no-verify', 'origin', 'main']);

  // Required after the bump so the version read is the one just written
  const { version } = require('../package.json');
  const outcome = released ? `v${version} published` : 'Pushed without a version bump';
  console.log(`\n  Done. ${outcome}, main is in sync with origin/main.\n`);
}

main();
