#!/usr/bin/env node
/**
 * Answers "do these commits deserve a new version?" for two different callers.
 *
 * Scope:
 *   (default)     commits not yet on origin/main  — what a local push would publish
 *   --since-tag   commits after the last tag      — what CI sees, where everything
 *                                                   is already pushed
 * Output:
 *   (default)     exit 0 = nothing to version, exit 1 = needs a bump
 *   --print       writes "true" / "false" to stdout and always exits 0
 */

const {
  getCommitsSinceLastTag,
  getUnpushedCommits,
  hasVersionableCommits,
  isReleaseCommit,
} = require('./release-utils');

const args = process.argv.slice(2);
const commits = args.includes('--since-tag') ? getCommitsSinceLastTag() : getUnpushedCommits();
const needsRelease = Boolean(commits) && hasVersionableCommits(commits) && !isReleaseCommit();

if (args.includes('--print')) {
  console.log(needsRelease ? 'true' : 'false');
  process.exit(0);
}

process.exit(needsRelease ? 1 : 0);
