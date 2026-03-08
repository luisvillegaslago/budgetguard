const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^next-auth$': '<rootDir>/src/__mocks__/next-auth.js',
    '^next-auth/providers/google$': '<rootDir>/src/__mocks__/next-auth-providers-google.js',
    '^next-auth/react$': '<rootDir>/src/__mocks__/next-auth-react.js',
  },
};

module.exports = createJestConfig(customJestConfig);
