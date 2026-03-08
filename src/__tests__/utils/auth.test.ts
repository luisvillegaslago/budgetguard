/**
 * Unit Tests: Auth utilities
 * Tests getUserIdOrThrow() and AuthError class
 */

import { AuthError } from '@/libs/auth';

// Mock getServerSession from next-auth
const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

// Mock next-auth/providers/google
jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}));

// Mock database connection
jest.mock('@/services/database/connection', () => ({
  query: jest.fn(),
}));

// Import after mocks
import { getUserIdOrThrow } from '@/libs/auth';

// ── AuthError ──

describe('AuthError', () => {
  it('should create error with default message', () => {
    const error = new AuthError();
    expect(error.message).toBe('Authentication required');
    expect(error.name).toBe('AuthError');
  });

  it('should create error with custom message', () => {
    const error = new AuthError('Custom auth error');
    expect(error.message).toBe('Custom auth error');
    expect(error.name).toBe('AuthError');
  });

  it('should be instanceof Error', () => {
    const error = new AuthError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthError);
  });
});

// ── getUserIdOrThrow ──

describe('getUserIdOrThrow', () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
  });

  it('should return userId when session is valid', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { userId: 42, name: 'Test User', email: 'test@example.com' },
      expires: '2026-01-01',
    });

    const userId = await getUserIdOrThrow();
    expect(userId).toBe(42);
  });

  it('should throw AuthError when session is null', async () => {
    mockGetServerSession.mockResolvedValue(null);

    await expect(getUserIdOrThrow()).rejects.toThrow(AuthError);
  });

  it('should throw AuthError when session has no user', async () => {
    mockGetServerSession.mockResolvedValue({ expires: '2026-01-01' });

    await expect(getUserIdOrThrow()).rejects.toThrow(AuthError);
  });

  it('should throw AuthError when user has no userId', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com' },
      expires: '2026-01-01',
    });

    await expect(getUserIdOrThrow()).rejects.toThrow(AuthError);
  });

  it('should throw AuthError when userId is 0', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { userId: 0, name: 'Test', email: 'test@example.com' },
      expires: '2026-01-01',
    });

    await expect(getUserIdOrThrow()).rejects.toThrow(AuthError);
  });
});
