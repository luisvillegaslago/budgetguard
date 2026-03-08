/**
 * Manual mock for next-auth/providers/google
 */
module.exports = {
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
};
