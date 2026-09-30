/**
 * trustedAppOrigin: where a sync round sends the call that starts the next one.
 *
 * The call carries CRON_SECRET, so the origin comes from server configuration
 * only. On a preview deployment NEXTAUTH_URL and VERCEL_PROJECT_PRODUCTION_URL
 * name production, and a preview's round handing off there would run its next
 * round on production's code, or be refused by a deployment that reads another
 * database; a preview calls itself through VERCEL_URL, which Vercel sets. And
 * the secret never travels over plain http, except to this machine.
 */

import { trustedAppOrigin } from '@/utils/appOrigin';

const savedEnv = { ...process.env };

function configure(env: Partial<Record<string, string>>): void {
  ['VERCEL_ENV', 'VERCEL_URL', 'NEXTAUTH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'].forEach((name) => {
    delete process.env[name];
  });
  Object.assign(process.env, env);
}

afterAll(() => {
  process.env = savedEnv;
});

describe('trustedAppOrigin', () => {
  it('on a preview deployment, is the deployment itself and never production', () => {
    configure({
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'budgetguard-git-rounds-luis.vercel.app',
      NEXTAUTH_URL: 'https://budgetguard.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'budgetguard-tau.vercel.app',
    });

    expect(trustedAppOrigin()).toBe('https://budgetguard-git-rounds-luis.vercel.app');
  });

  it('on a preview deployment without VERCEL_URL, is not configured rather than production', () => {
    configure({ VERCEL_ENV: 'preview', NEXTAUTH_URL: 'https://budgetguard.app' });

    expect(trustedAppOrigin()).toBeNull();
  });

  it('in production, is NEXTAUTH_URL, with the production hostname as the fallback', () => {
    configure({
      VERCEL_ENV: 'production',
      VERCEL_URL: 'budgetguard-abc123.vercel.app',
      NEXTAUTH_URL: 'https://budgetguard.app/some/path',
      VERCEL_PROJECT_PRODUCTION_URL: 'budgetguard-tau.vercel.app',
    });
    expect(trustedAppOrigin()).toBe('https://budgetguard.app');

    delete process.env.NEXTAUTH_URL;
    expect(trustedAppOrigin()).toBe('https://budgetguard-tau.vercel.app');
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:3000'])('accepts plain http for this machine: %s', (origin) => {
    configure({ NEXTAUTH_URL: origin });

    expect(trustedAppOrigin()).toBe(origin);
  });

  it('treats any other plain http origin as not configured', () => {
    configure({ NEXTAUTH_URL: 'http://budgetguard.app' });
    expect(trustedAppOrigin()).toBeNull();

    // With a usable fallback, that one is used instead.
    configure({ NEXTAUTH_URL: 'http://budgetguard.app', VERCEL_PROJECT_PRODUCTION_URL: 'budgetguard-tau.vercel.app' });
    expect(trustedAppOrigin()).toBe('https://budgetguard-tau.vercel.app');
  });
});
