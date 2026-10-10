import { NextRequest } from 'next/server';
import { postMusicGptGeneration } from '@/lib/server/musicgptGeneration';

/**
 * Server-side API route for initiating MusicGPT generation.
 * This ensures API keys are never exposed to the client.
 *
 * After MusicGPT returns a task id, a server-only musicgptTasks/{taskId}
 * binding is written before the id is returned to the client.
 */
export async function POST(request: NextRequest) {
  return postMusicGptGeneration(request);
}
