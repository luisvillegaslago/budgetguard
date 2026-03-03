/**
 * Tests for Version API Endpoint
 * Uses mocked NextResponse since Jest doesn't have native Request/Response
 */

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown) => ({
      status: 200,
      json: async () => data,
    }),
  },
}));

// Import after mocking
import { GET } from '@/app/api/version/route';

describe('/api/version', () => {
  it('should return version information', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('environment');
    expect(data).toHaveProperty('node');
  });

  it('should return correct app name', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.name).toBe('budgetguard');
  });

  it('should return a valid version format', async () => {
    const response = await GET();
    const data = await response.json();

    // Version should match semver pattern
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should return node version starting with v', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.node).toMatch(/^v\d+/);
  });

  it('should return environment as test or development', async () => {
    const response = await GET();
    const data = await response.json();

    expect(['test', 'development', 'production']).toContain(data.environment);
  });

  it('should include buildDate in ISO format', async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.buildDate).toBeDefined();
    // Should be a valid date string
    expect(() => new Date(data.buildDate)).not.toThrow();
  });
});
