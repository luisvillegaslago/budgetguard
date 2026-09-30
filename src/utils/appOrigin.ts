/**
 * The origin the server calls itself on, from server-side configuration only.
 *
 * Never derive it from an incoming request: Host and X-Forwarded-Host are
 * whatever the caller sent, and a call made to that origin carries CRON_SECRET
 * (and the protection-bypass secret) to whoever it names.
 *
 * On a preview deployment (VERCEL_ENV=preview) it is `https://${VERCEL_URL}`,
 * the deployment's own hostname, which Vercel sets and no request can change.
 * NEXTAUTH_URL and VERCEL_PROJECT_PRODUCTION_URL name production there: a
 * preview round handing off to them would run its next round on production's
 * code, or be refused by a deployment that reads another database.
 *
 * Elsewhere NEXTAUTH_URL first (the production URL in production, localhost in
 * development); VERCEL_PROJECT_PRODUCTION_URL, which Vercel sets to the
 * production hostname without a scheme, as the fallback.
 *
 * Only https counts, and plain http only for this machine: the call carries
 * CRON_SECRET, which must not cross a network in clear. An origin that fails
 * either rule counts as not configured. Null when nothing usable is left.
 */

// The VERCEL_ENV of a preview deployment.
const VERCEL_PREVIEW_ENV = 'preview';

const HTTPS_PROTOCOL = 'https:';
const HTTP_PROTOCOL = 'http:';
// Hosts where a plain http origin never leaves the machine (local development).
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export function trustedAppOrigin(): string | null {
  if (process.env.VERCEL_ENV === VERCEL_PREVIEW_ENV) return originOfHost(process.env.VERCEL_URL);
  return originOf(process.env.NEXTAUTH_URL) ?? originOfHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
}

/** Vercel's hostnames come without a scheme. */
function originOfHost(host: string | undefined): string | null {
  return host ? originOf(`${HTTPS_PROTOCOL}//${host}`) : null;
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === HTTPS_PROTOCOL) return url.origin;
    if (url.protocol === HTTP_PROTOCOL && LOOPBACK_HOSTNAMES.has(url.hostname)) return url.origin;
    return null;
  } catch {
    return null;
  }
}
