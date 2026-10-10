import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { HttpError } from '@/lib/api/requireAuth';
import type { GenerationDocument, SongDocument } from '@/types/firestore';

const STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);

/**
 * Dev stub completions. MusicGPT audio is written only by the webhook.
 * Owner of the parent song, and only when the generation provider is `stub`.
 */
export async function adminUpdateStubGenerationStatus(
  generationId: string,
  userId: string,
  input: {
    status: string;
    output: GenerationDocument['output'] | null;
    error: string | null;
    contentHash?: string | null;
  }
): Promise<void> {
  if (!STATUSES.has(input.status)) {
    throw new HttpError(400, 'Invalid generation status');
  }

  const db = getAdminDb();
  const generationRef = db.collection(COLLECTIONS.generations).doc(generationId);
  const generationSnap = await generationRef.get();
  if (!generationSnap.exists) throw new HttpError(404, 'Generation not found');
  const generation = generationSnap.data() as GenerationDocument;
  if (generation.provider !== 'stub') {
    throw new HttpError(403, 'Only stub generations can be updated this way');
  }

  const songSnap = await db.collection(COLLECTIONS.songs).doc(generation.songId).get();
  if (!songSnap.exists) throw new HttpError(404, 'Parent song not found');
  const song = songSnap.data() as SongDocument;
  if (song.ownerId !== userId) {
    throw new HttpError(403, 'Only the song owner can update this generation');
  }

  const updates: Record<string, unknown> = {
    status: input.status,
    completedAt:
      input.status === 'completed' || input.status === 'failed' ? Timestamp.now() : null,
  };
  if (input.output !== null) {
    updates.output = {
      audioURL: input.output?.audioURL ?? null,
      stems: input.output?.stems ?? null,
      metadata: input.output?.metadata ?? {},
    };
  }
  if (input.error !== null) updates.error = input.error;
  if (input.contentHash !== undefined) updates.contentHash = input.contentHash;

  await generationRef.update(updates);
}
