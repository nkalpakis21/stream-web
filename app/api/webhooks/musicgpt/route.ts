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
import type { SongDocument, SongVersionDocument, GenerationDocument } from '@/types/firestore';
import { createSongReadyNotification } from '@/lib/services/notifications';
import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';

/**
 * MusicGPT webhook payload structure as documented.
 * See: https://musicgpt.com/docs/webhooks
 * 
 * IMPORTANT: This interface must match the webhook payload structure used in
 * components/songs/DeveloperSection.tsx for webhook simulation.
 * If you update this interface, update the simulator as well.
 */
interface MusicGPTWebhookPayload {
  success: boolean;
  conversion_type: string;
  task_id: string;
  conversion_id: string;
  conversion_path?: string; // Optional - not present in lyrics update webhooks
  conversion_path_wav?: string;
  conversion_duration?: number;
  is_flagged: boolean;
  reason?: string;
  lyrics?: string;
  lyrics_timestamped?: unknown;
  title?: string;
  subtype?: string; // For lyrics_timestamped and other subtype webhooks
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
    
  console.log('[MusicGPT Webhook] Received request');
  try {
    const rawBody = await request.text();

    const signature = request.headers.get('x-musicgpt-signature');
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as MusicGPTWebhookPayload;

    // Validate payload structure - task_id and conversion_id are always required
    if (!body.task_id || !body.conversion_id) {
      console.error('[MusicGPT Webhook] Invalid payload structure:', body);
      return NextResponse.json(
        { error: 'Invalid payload: missing required fields (task_id, conversion_id)' },
        { status: 400 }
      );
    }

    // Handle lyrics update webhooks separately (they don't have conversion_path)
    if (body.subtype === 'lyrics_timestamped' || body.subtype === 'lyrics') {
      console.log(`[MusicGPT Webhook] Received lyrics update webhook for conversion ${body.conversion_id}`);
      
      // Find generation by conversion_id
      const generationsQuery = query(
        collection(db, COLLECTIONS.generations),
        where('providerConversionIds', 'array-contains', body.conversion_id)
      );
      const generationsSnapshot = await getDocs(generationsQuery);
      
      if (generationsSnapshot.empty) {
        // Try finding by task_id as fallback
        const taskQuery = query(
          collection(db, COLLECTIONS.generations),
          where('providerTaskId', '==', body.task_id)
        );
        const taskSnapshot = await getDocs(taskQuery);
        
        if (taskSnapshot.empty) {
          console.warn(`[MusicGPT Webhook] No generation found for lyrics update: task_id=${body.task_id}, conversion_id=${body.conversion_id}`);
          return NextResponse.json({ ok: true }); // Acknowledge to avoid retries
        }
        
        // Use the generation found by task_id
        const generationDoc = taskSnapshot.docs[0];
        const generation = generationDoc.data() as GenerationDocument;
        
        // Update generation metadata with lyrics_timestamped data
        await setDoc(
          doc(db, COLLECTIONS.generations, generation.id),
          {
            output: {
              ...(generation.output || { audioURL: null, stems: null, metadata: {} }),
              metadata: {
                ...(generation.output?.metadata || {}),
                [`conversion_${body.conversion_id}_lyrics`]: {
                  lyrics_timestamped: body.lyrics_timestamped,
                  lyrics: body.lyrics,
                  subtype: body.subtype,
                  updatedAt: Timestamp.now(),
                },
              },
            },
          },
          { merge: true }
        );
        console.log(`[MusicGPT Webhook] Updated lyrics for generation ${generation.id}`);
        return NextResponse.json({ ok: true });
      }
      
      // Found by conversion_id
      const generationDoc = generationsSnapshot.docs[0];
      const generation = generationDoc.data() as GenerationDocument;
      
      // Update generation metadata with lyrics_timestamped data
      await setDoc(
        doc(db, COLLECTIONS.generations, generation.id),
        {
          output: {
            ...(generation.output || { audioURL: null, stems: null, metadata: {} }),
            metadata: {
              ...(generation.output?.metadata || {}),
              [`conversion_${body.conversion_id}_lyrics`]: {
                lyrics_timestamped: body.lyrics_timestamped,
                lyrics: body.lyrics,
                subtype: body.subtype,
                updatedAt: Timestamp.now(),
              },
            },
          },
        },
        { merge: true }
      );
      console.log(`[MusicGPT Webhook] Updated lyrics for generation ${generation.id}`);
      return NextResponse.json({ ok: true });
    }

    // For main conversion completion webhooks, conversion_path is required
    if (!body.conversion_path) {
      console.error('[MusicGPT Webhook] Invalid payload structure: conversion_path required for conversion completion webhook:', body);
      return NextResponse.json(
        { error: 'Invalid payload: conversion_path is required for conversion completion webhooks' },
        { status: 400 }
      );
    }

    // Find generation by providerTaskId (task_id) OR by conversion_id in providerConversionIds
    // Try task_id first (most common case)
    let generationsQuery = query(
      collection(db, COLLECTIONS.generations),
      where('providerTaskId', '==', body.task_id)
    );
    let generationsSnapshot = await getDocs(generationsQuery);

    // If not found by task_id, try to find by conversion_id
    if (generationsSnapshot.empty) {
      // Note: Firestore doesn't support array-contains queries on nested fields easily,
      // so we'll fetch pending/processing generations and filter in memory
      // Try pending first
      const pendingQuery = query(
        collection(db, COLLECTIONS.generations),
        where('status', '==', 'pending')
      );
      let allPendingSnapshot = await getDocs(pendingQuery);
      
      // Also check processing status
      const processingQuery = query(
        collection(db, COLLECTIONS.generations),
        where('status', '==', 'processing')
      );
      const processingSnapshot = await getDocs(processingQuery);
      
      // Combine results
      const allDocs = [...allPendingSnapshot.docs, ...processingSnapshot.docs];
      
      const matchingDoc = allDocs.find(doc => {
        const gen = doc.data() as GenerationDocument;
        return gen.providerConversionIds?.includes(body.conversion_id);
      });

      if (matchingDoc) {
        generationsSnapshot = {
          empty: false,
          docs: [matchingDoc],
        } as typeof generationsSnapshot;
      }
    }

    if (generationsSnapshot.empty) {
      // Unknown task/conversion – acknowledge to avoid retries but do nothing.
      console.warn(
        `[MusicGPT Webhook] No generation found for task_id: ${body.task_id} or conversion_id: ${body.conversion_id}`
      );
      return NextResponse.json({ ok: true });
    }

    // Get the first matching generation (should only be one)
    const generationDoc = generationsSnapshot.docs[0];
    const generation = generationDoc.data() as GenerationDocument;

    // Check if this conversion_id has already been processed
    if (generation.providerProcessedConversions?.includes(body.conversion_id)) {
      console.log(
        `[MusicGPT Webhook] Conversion ${body.conversion_id} already processed for generation ${generation.id}. Skipping.`
      );
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

    // Use conversion_id as providerOutputId (not task_id)
    const providerOutputId = body.conversion_id;

    // Skip if we've already processed this conversion_id as a song version
    if (existingProviderOutputIds.has(providerOutputId)) {
      console.log(`[MusicGPT Webhook] Conversion ${providerOutputId} already exists as song version. Skipping.`);
      // Still mark it as processed in the generation
      await setDoc(
        doc(db, COLLECTIONS.generations, generation.id),
        {
          providerProcessedConversions: [...(generation.providerProcessedConversions || []), body.conversion_id],
        },
        { merge: true }
      );
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
      audioURL: body.conversion_path, // Use conversion_path from webhook
      providerOutputId: providerOutputId, // Use conversion_id
      isPrimary: existingVersions.length === 0, // First version is primary
    };

    await setDoc(versionRef, version);

    // If this is the first version, mark it as primary
    if (existingVersions.length === 0) {
      await setPrimarySongVersion(song.id, versionId);
    }

    // Mark this conversion_id as processed
    const updatedProcessedConversions = [
      ...(generation.providerProcessedConversions || []),
      body.conversion_id,
    ];

    // Check if all expected conversions have been processed
    const allConversionIds = generation.providerConversionIds || [];
    const allProcessed = allConversionIds.length > 0 && 
      allConversionIds.every(id => updatedProcessedConversions.includes(id));

    // Mark generation as completed only if all conversions are processed
    // OR if we don't have conversion IDs tracked (legacy/fallback)
    const shouldMarkCompleted = allProcessed || allConversionIds.length === 0;

    // Fetch additional conversion details from MusicGPT API
    // This provides more complete metadata than what's in the webhook payload
    const conversionDetailsResponse = await getConversionDataByConversionID(body.conversion_id);

    if (conversionDetailsResponse && conversionDetailsResponse.success) {
      console.log(
        `[MusicGPT Webhook] Fetched additional details for conversion ${body.conversion_id}`
      );
    }

    // Build conversion metadata object, only including fields that have values
    // Firestore doesn't accept undefined values
    const conversionMetadata: Record<string, unknown> = {
      conversion_path: body.conversion_path,
    };
    
    if (body.title) conversionMetadata.title = body.title;
    if (body.conversion_path_wav) conversionMetadata.conversion_path_wav = body.conversion_path_wav;
    if (body.conversion_duration !== undefined) conversionMetadata.conversion_duration = body.conversion_duration;
    if (body.lyrics) conversionMetadata.lyrics = body.lyrics;
    if (body.lyrics_timestamped) conversionMetadata.lyrics_timestamped = body.lyrics_timestamped;

    // Include full conversion details if fetched from API
    // This provides additional metadata that might not be in the webhook payload
    if (conversionDetailsResponse && conversionDetailsResponse.success) {
      const conversion = conversionDetailsResponse.conversion;
      conversionMetadata.fullDetails = conversion;
      // Extract specific useful fields if they exist in the API response
      if (conversion.status) conversionMetadata.status = conversion.status;
      if (conversion.createdAt) conversionMetadata.created_at = conversion.createdAt;
      if (conversion.updatedAt) conversionMetadata.updated_at = conversion.updatedAt;
      
      // Extract album cover URLs and store on song document (shared across all conversions)
      // Only update if not already set (idempotent) - all conversions share the same album cover
      const albumCoverPath = conversion.album_cover_path as string | undefined;
      const albumCoverThumbnail = conversion.album_cover_thumbnail as string | undefined;
      
      if (albumCoverPath || albumCoverThumbnail) {
        const songUpdates: Partial<SongDocument> = {};
        if (albumCoverPath && !song.albumCoverPath) {
          songUpdates.albumCoverPath = albumCoverPath;
        }
        if (albumCoverThumbnail && !song.albumCoverThumbnail) {
          songUpdates.albumCoverThumbnail = albumCoverThumbnail;
        }
        
        // Only update song if we have new album cover data
        if (Object.keys(songUpdates).length > 0) {
          await setDoc(
            doc(db, COLLECTIONS.songs, song.id),
            {
              ...songUpdates,
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );
          console.log(`[MusicGPT Webhook] Updated album cover for song ${song.id}`);
        }
      }
    }

    await setDoc(
      doc(db, COLLECTIONS.generations, generation.id),
      {
        providerProcessedConversions: updatedProcessedConversions,
        status: shouldMarkCompleted ? 'completed' : generation.status,
        completedAt: shouldMarkCompleted ? now : generation.completedAt,
        output: {
          audioURL: shouldMarkCompleted ? body.conversion_path : (generation.output?.audioURL || null),
          stems: body.conversion_path_wav ? [body.conversion_path_wav] : null,
          metadata: {
            ...(generation.output?.metadata || {}),
            [`conversion_${body.conversion_id}`]: conversionMetadata,
          },
        },
      },
      { merge: true }
    );

    // Create a notification for the song owner only when generation is fully completed
    // (all conversions have been processed)
    if (shouldMarkCompleted) {
      await createSongReadyNotification({
        userId: song.ownerId,
        songId: song.id,
        generationId: generation.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[MusicGPT Webhook] Error', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}


