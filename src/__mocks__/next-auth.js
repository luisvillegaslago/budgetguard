/**
 * Manual mock for next-auth
 * Prevents Jest from resolving ESM dependencies (jose, @panva/hkdf, openid-client)
 */
module.exports = {
  getServerSession: jest.fn(),
};
