#!/usr/bin/env node
/**
 * Smart Release Script
 * Determines correct version bump based on commit types since last tag
 * Uses commit-and-tag-version (drop-in replacement for deprecated standard-version)
 *
 * Bumps and tags only — it never pushes. Use `npm run ship` to release and publish
 * in one go (see scripts/ship.js for why the push cannot live in the pre-push hook).
 */

const { execFileSync } = require('node:child_process');
const { getCommitsSinceLastTag, determineReleaseType } = require('./release-utils');

function run() {
  const isDryRun = process.argv.slice(2).includes('--dry-run');

  console.log('Analyzing commits since last tag...\n');

  const commits = getCommitsSinceLastTag();

  if (!commits.trim()) {
    console.log('No commits found. Use "npm run release:first" for initial release.\n');
    process.exit(0);
  }

  const releaseType = determineReleaseType(commits);

  console.log(`Detected release type: ${releaseType.toUpperCase()}\n`);

  // Static arguments only, passed as an array so no shell parsing takes place
  const args = ['commit-and-tag-version', '--release-as', releaseType, ...(isDryRun ? ['--dry-run'] : [])];

  console.log(`Running: npx ${args.join(' ')}\n`);

  try {
    execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  } catch {
    process.exit(1);
  }
}

run();
