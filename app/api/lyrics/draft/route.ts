import { NextRequest } from 'next/server';
import { postLyricsDraft } from '@/lib/server/lyricsDraft';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * Write a lyrics draft with MusicGPT's Lyrics Generator.
 * Requires a Firebase ID token. Three drafts per session, 30 per user per day.
 */
export async function POST(request: NextRequest) {
  return postLyricsDraft(request);
}
