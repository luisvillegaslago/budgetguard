/**
 * Unit Tests: Proxy Configuration
 * Verifies that protected routes are correctly configured in proxy.ts
 */

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: jest.fn(),
    next: jest.fn(),
  },
}));

import { config } from '@/proxy';

describe('Proxy Config', () => {
  it('should export a matcher config', () => {
    expect(config).toBeDefined();
    expect(config.matcher).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
  });

  it('should protect dashboard routes', () => {
    expect(config.matcher).toContain('/dashboard/:path*');
  });

  it('should protect categories routes', () => {
    expect(config.matcher).toContain('/categories/:path*');
  });

  it('should protect recurring-expenses routes', () => {
    expect(config.matcher).toContain('/recurring-expenses/:path*');
  });

  it('should protect trips routes', () => {
    expect(config.matcher).toContain('/trips/:path*');
  });

  it('should protect fiscal routes', () => {
    expect(config.matcher).toContain('/fiscal/:path*');
  });

  it('should NOT protect login route', () => {
    const matchesLogin = config.matcher.some((pattern: string) => pattern.includes('login'));
    expect(matchesLogin).toBe(false);
  });

  it('should NOT protect API routes (handled by AuthError)', () => {
    const matchesApi = config.matcher.some((pattern: string) => pattern.includes('/api/'));
    expect(matchesApi).toBe(false);
  });

  it('should NOT protect the root path', () => {
    const matchesRoot = config.matcher.some((pattern: string) => pattern === '/' || pattern === '/:path*');
    expect(matchesRoot).toBe(false);
  });
});
