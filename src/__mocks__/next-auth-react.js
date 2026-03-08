/**
 * Manual mock for next-auth/react
 */
module.exports = {
  SessionProvider: ({ children }) => children,
  useSession: jest.fn(() => ({ data: null, status: 'unauthenticated' })),
  signIn: jest.fn(),
  signOut: jest.fn(),
};
