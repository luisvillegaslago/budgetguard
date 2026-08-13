#!/usr/bin/env node
/**
 * Exit code contract for the pre-push hook:
 *   0 → nothing to version, the push can proceed as-is
 *   1 → unpushed feat/fix/perf commits that still need a version bump
 */

const { getUnpushedCommits, hasVersionableCommits, isReleaseCommit } = require('./release-utils');

const unpushed = getUnpushedCommits();
const needsRelease = unpushed && hasVersionableCommits(unpushed) && !isReleaseCommit();

process.exit(needsRelease ? 1 : 0);
