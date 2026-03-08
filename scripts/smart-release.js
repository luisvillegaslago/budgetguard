#!/usr/bin/env node
/**
 * Smart Release Script
 * Determines correct version bump based on commit types since last tag
 * Uses commit-and-tag-version (drop-in replacement for deprecated standard-version)
 *
 * Note: This script uses execSync with hardcoded commands only (no user input).
 * This is safe as all command strings are static and controlled by the script.
 */

const { execSync } = require('node:child_process');

function getCommitsSinceLastTag() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
    return execSync(`git log ${lastTag}..HEAD --oneline`, {
      encoding: 'utf8',
    });
  } catch {
    try {
      return execSync('git log --oneline', { encoding: 'utf8' });
    } catch {
      // No commits yet
      return '';
    }
  }
}

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

function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  console.log('Analyzing commits since last tag...\n');

  const commits = getCommitsSinceLastTag();

  if (!commits.trim()) {
    console.log('No commits found. Use "npm run release:first" for initial release.\n');
    process.exit(0);
  }

  const releaseType = determineReleaseType(commits);

  console.log(`Detected release type: ${releaseType.toUpperCase()}\n`);

  // Build command with safe, controlled arguments
  const dryRunFlag = isDryRun ? ' --dry-run' : '';
  const command = `npx commit-and-tag-version --release-as ${releaseType}${dryRunFlag}`;

  console.log(`Running: ${command}\n`);

  try {
    execSync(command, { stdio: 'inherit' });
  } catch (_error) {
    process.exit(1);
  }
}

run();
