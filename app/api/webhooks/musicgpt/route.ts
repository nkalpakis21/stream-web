import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  Timestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getSong, getSongVersions, setPrimarySongVersion } from '@/lib/services/songs';
import type { SongVersionDocument, GenerationDocument } from '@/types/firestore';
import { createSongReadyNotification } from '@/lib/services/notifications';

/**
 * MusicGPT webhook payload structure as documented.
 * See: https://musicgpt.com/docs/webhooks
 */
interface MusicGPTWebhookPayload {
  task_id: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  status_msg: string;
  conversion_type: string;
  audio_url: string;
  title?: string;
  conversion_cost?: number;
  createdAt: string;
  updatedAt: string;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.MUSICGPT_WEBHOOK_SECRET;

  // If no secret is configured we skip verification to avoid locking out
  // development environments, but this should always be set in production.
  if (!secret) {
    console.warn('[MusicGPT Webhook] MUSICGPT_WEBHOOK_SECRET is not set; skipping signature verification');
    return true;
  }

  if (!signature) {
    return false;
  }

  // Assumes MusicGPT signs payloads using an HMAC-SHA256 of the raw request
  // body, delivered in the `x-musicgpt-signature` header as a hex string.
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const signature = request.headers.get('x-musicgpt-signature');
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as MusicGPTWebhookPayload;

    // Validate payload structure
    if (!body.task_id || !body.status || !body.audio_url) {
      console.error('[MusicGPT Webhook] Invalid payload structure:', body);
      return NextResponse.json(
        { error: 'Invalid payload: missing required fields' },
        { status: 400 }
      );
    }

    // Find generation by providerTaskId (which should match task_id)
    const generationsQuery = query(
      collection(db, COLLECTIONS.generations),
      where('providerTaskId', '==', body.task_id),
      where('status', '==', 'pending')
    );
    const generationsSnapshot = await getDocs(generationsQuery);

    if (generationsSnapshot.empty) {
      // Unknown task – acknowledge to avoid retries but do nothing.
      console.warn(`[MusicGPT Webhook] No pending generation found for task_id: ${body.task_id}`);
      return NextResponse.json({ ok: true });
    }

    // Get the first matching generation (should only be one)
    const generationDoc = generationsSnapshot.docs[0];
    const generation = generationDoc.data() as GenerationDocument;

    // Handle different statuses
    if (body.status === 'FAILED') {
      // Mark generation as failed
      await setDoc(
        doc(db, COLLECTIONS.generations, generation.id),
        {
          status: 'failed',
          error: body.status_msg || 'MusicGPT generation failed',
          completedAt: Timestamp.now(),
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.status !== 'COMPLETED') {
      // Still processing - acknowledge but don't update
      return NextResponse.json({ ok: true });
    }

    // Idempotency: if generation is already completed, do nothing.
    if (generation.status === 'completed') {
      return NextResponse.json({ ok: true });
    }

    const song = await getSong(generation.songId);
    if (!song) {
      return NextResponse.json(
        { error: 'Parent song not found' },
        { status: 400 }
      );
    }

    // Fetch existing versions to determine version numbers and detect duplicates.
    const existingVersions = await getSongVersions(song.id);
    const existingProviderOutputIds = new Set(
      existingVersions
        .map(v => v.providerOutputId)
        .filter((id): id is string => !!id)
    );

    // Use task_id as providerOutputId for idempotency
    const providerOutputId = body.task_id;

    // Skip if we've already processed this output
    if (existingProviderOutputIds.has(providerOutputId)) {
      console.log(`[MusicGPT Webhook] Output ${providerOutputId} already processed. Skipping.`);
      return NextResponse.json({ ok: true });
    }

    const maxVersionNumber =
      existingVersions.reduce(
        (max, v) => (v.versionNumber > max ? v.versionNumber : max),
        0
      ) || 0;

    const now = Timestamp.now();
    const versionRef = doc(collection(db, COLLECTIONS.songVersions));
    const versionId = versionRef.id;

    const version: SongVersionDocument = {
      id: versionId,
      songId: song.id,
      versionNumber: maxVersionNumber + 1,
      title: body.title || song.title,
      createdBy: song.ownerId,
      createdAt: now,
      parentVersionId: song.currentVersionId,
      audioURL: body.audio_url,
      providerOutputId: providerOutputId,
      isPrimary: existingVersions.length === 0, // First version is primary
    };

    await setDoc(versionRef, version);

    // If this is the first version, mark it as primary
    if (existingVersions.length === 0) {
      await setPrimarySongVersion(song.id, versionId);
    }

    // Mark generation as completed
    await setDoc(
      doc(db, COLLECTIONS.generations, generation.id),
      {
        status: 'completed',
        providerTaskId: body.task_id,
        completedAt: now,
        output: {
          audioURL: body.audio_url,
          stems: null,
          metadata: {
            title: body.title,
            conversion_cost: body.conversion_cost,
            conversion_type: body.conversion_type,
          },
        },
      },
      { merge: true }
    );

    // Create a notification for the song owner.
    await createSongReadyNotification({
      userId: song.ownerId,
      songId: song.id,
      generationId: generation.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[MusicGPT Webhook] Error', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}


