/**
 * Authenticated fetch wrapper
 * Intercepts 401 responses and redirects to login page
 */

const HTTP_STATUS = {
  UNAUTHORIZED: 401,
} as const;

export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status === HTTP_STATUS.UNAUTHORIZED && typeof window !== 'undefined') {
    window.location.href = '/login';
    // Return a never-resolving promise to prevent further processing
    return new Promise(() => {});
  }

  return response;
}
