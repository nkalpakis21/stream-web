import { NextResponse } from 'next/server';

/** Shared caches must not store a response that depends on the viewer. */
export const VIEWER_CACHE_CONTROL = 'private, no-store';

export function applyNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', VIEWER_CACHE_CONTROL);
  return response;
}

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return applyNoStore(NextResponse.json(body, { status }));
}
