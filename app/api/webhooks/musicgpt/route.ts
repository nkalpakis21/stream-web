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
import { getGeneration } from '@/lib/services/generations';
import { getSong, getSongVersions, setPrimarySongVersion } from '@/lib/services/songs';
import type { SongVersionDocument } from '@/types/firestore';
import { createSongReadyNotification } from '@/lib/services/notifications';

interface MusicGPTVariationPayload {
  audioUrl: string;
  providerOutputId: string;
  label?: string;
}

interface MusicGPTWebhookPayload {
  /**
   * Our internal generation identifier. In practice this may be passed
   * through MusicGPT as metadata or looked up via their task ID.
   */
  generationId: string;
  providerTaskId?: string;
  variations: MusicGPTVariationPayload[];
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

    if (!body.generationId || !Array.isArray(body.variations) || body.variations.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const generation = await getGeneration(body.generationId);
    if (!generation) {
      // Unknown generation – acknowledge to avoid retries but do nothing.
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

    let maxVersionNumber =
      existingVersions.reduce(
        (max, v) => (v.versionNumber > max ? v.versionNumber : max),
        0
      ) || 0;

    const now = Timestamp.now();
    const newVersions: SongVersionDocument[] = [];

    for (const variation of body.variations) {
      if (!variation.audioUrl || !variation.providerOutputId) {
        // Skip invalid variations but continue processing others.
        continue;
      }

      // Idempotency per variation: skip if we've already seen this output ID.
      if (existingProviderOutputIds.has(variation.providerOutputId)) {
        continue;
      }

      maxVersionNumber += 1;

      const versionRef = doc(collection(db, COLLECTIONS.songVersions));
      const versionId = versionRef.id;

      const version: SongVersionDocument = {
        id: versionId,
        songId: song.id,
        versionNumber: maxVersionNumber,
        title: song.title,
        createdBy: song.ownerId,
        createdAt: now,
        parentVersionId: song.currentVersionId,
        audioURL: variation.audioUrl,
        providerOutputId: variation.providerOutputId,
        isPrimary: false,
      };

      await setDoc(versionRef, version);
      newVersions.push(version);
      existingProviderOutputIds.add(variation.providerOutputId);
    }

    // If we created at least one new version, optionally mark the first as primary.
    if (newVersions.length > 0) {
      const primaryVersion = newVersions[0];
      await setPrimarySongVersion(song.id, primaryVersion.id);
    }

    // Mark generation as completed. We do not attempt to populate the legacy
    // single-output fields beyond a basic representation.
    const generationRef = doc(
      db,
      COLLECTIONS.generations,
      generation.id
    );
    await setDoc(
      generationRef,
      {
        status: 'completed',
        providerTaskId: body.providerTaskId ?? generation.providerTaskId,
        completedAt: now,
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


