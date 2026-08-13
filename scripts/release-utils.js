#!/usr/bin/env node
/**
 * Release Utilities
 * Single source of truth for "which commits trigger a version bump", shared by
 * smart-release.js (what to bump), ship.js (whether to release) and the pre-push
 * hook (whether to block a direct push).
 *
 * Uses execFileSync with argument arrays: no shell is involved, so a crafted tag
 * or branch name can never be interpreted as a command.
 */

const { execFileSync } = require('node:child_process');

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return fallback;
  }
}

/** Commit subjects (one per line) added since the last tag. */
function getCommitsSinceLastTag() {
  const lastTag = git(['describe', '--tags', '--abbrev=0']);
  return git(['log', ...(lastTag ? [`${lastTag}..HEAD`] : []), '--oneline']);
}

/** Commit subjects (one per line) present locally but not on origin/main. */
function getUnpushedCommits() {
  return git(['log', 'origin/main..HEAD', '--oneline']);
}

/** Just the commit at HEAD, in the same `<sha> <subject>` shape as the others. */
function getHeadCommit() {
  return git(['log', '-1', '--oneline']);
}

/**
 * Conventional Commits → semver bump. Reads the subject line only, which is where
 * this project puts the type and any `!` breaking marker.
 */
function determineReleaseType(commits) {
  const lines = commits.split('\n').filter(Boolean);

  let hasBreaking = false;
  let hasFeat = false;

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('breaking change') || lowerLine.includes('!:')) {
      hasBreaking = true;
    }
    if (/\bfeat[:(]/.test(lowerLine)) {
      hasFeat = true;
    }
  });

  if (hasBreaking) return 'major';
  if (hasFeat) return 'minor';
  return 'patch';
}

/** Only feat/fix/perf (or a breaking change) produce a new version. */
function hasVersionableCommits(commits) {
  return commits
    .split('\n')
    .filter(Boolean)
    .some((line) => /^[a-f0-9]+ (feat|fix|perf)(\([^)]+\))?!?:/i.test(line) || line.includes('BREAKING CHANGE'));
}

/** True when HEAD is already the release commit, so nothing needs bumping. */
function isReleaseCommit() {
  return git(['log', '-1', '--pretty=%s']).startsWith('chore(release):');
}

module.exports = {
  git,
  getCommitsSinceLastTag,
  getHeadCommit,
  getUnpushedCommits,
  determineReleaseType,
  hasVersionableCommits,
  isReleaseCommit,
};
