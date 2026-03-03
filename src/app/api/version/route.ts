import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';

/**
 * Version API Endpoint
 *
 * Returns application version and build information.
 * Useful for debugging, monitoring, and deployment verification.
 *
 * GET /api/version
 */
export async function GET() {
  const versionInfo = {
    name: packageJson.name,
    version: packageJson.version,
    environment: process.env.NODE_ENV || 'development',
    gitHash: process.env.NEXT_PUBLIC_GIT_HASH || 'unknown',
    buildDate: process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString(),
    node: process.version,
  };

  return NextResponse.json(versionInfo);
}
