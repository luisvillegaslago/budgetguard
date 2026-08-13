#!/usr/bin/env node
/**
 * Local git configuration applied on every `npm install` (via the prepare script).
 *
 * push.followTags: the post-commit hook creates release tags locally, and a plain
 * `git push` would leave them behind — that is how v0.43.0 through v0.54.0 once
 * went unpublished. With this set, tags reachable from the pushed commits travel
 * along automatically.
 *
 * Never fails the install: outside a git checkout (a Docker build from a tarball,
 * for instance) there is simply nothing to configure.
 */

const { execFileSync } = require('node:child_process');

try {
  execFileSync('git', ['config', 'push.followTags', 'true'], { stdio: 'ignore' });
} catch {
  // Not a git checkout, or git unavailable — nothing to do
}
