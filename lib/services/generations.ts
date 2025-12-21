/**
 * Generation Service
 * 
 * Handles song generation requests and tracks generation status.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getGenerationPath,
} from '@/lib/firebase/collections';
import type { GenerationDocument } from '@/types/firestore';
import { aiService } from '@/lib/ai/providers';
import { hashGeneration } from '@/lib/utils/hash';

/**
 * Create a generation request.
 *
 * For providers like MusicGPT that complete asynchronously via webhook,
 * this function only records the pending generation and returns immediately.
 *
 * For the "stub" provider used in development, we still perform a
 * synchronous generation via the AI service for convenience.
 */
export async function createGeneration(
  songId: string,
  artistVersionId: string,
  data: {
    prompt: {
      structured: Record<string, unknown>;
      freeText: string;
    };
    parameters: {
      duration?: number;
      quality?: 'low' | 'medium' | 'high';
      [key: string]: unknown;
    };
    provider: string;
    artistContext?: {
      styleDNA: {
        genres: string[];
        moods: string[];
        tempoRange: { min: number; max: number };
        influences: string[];
      };
      lore: string;
    };
    lyrics?: string;
  } & {
    /**
     * Optional provider task/job identifier for async providers.
     */
    providerTaskId?: string;
  }
): Promise<GenerationDocument> {
  // For async providers like MusicGPT, we need to get the task ID first
  // before creating the generation document. This ensures we don't create
  // orphaned records if the API call fails.
  let providerTaskId: string | null = null;

  if (data.provider === 'musicgpt') {
    try {
      // Call server-side API route to initiate MusicGPT generation
      // This ensures API keys are never exposed to the client
      const apiResponse = await fetch('/api/generations/musicgpt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: data.prompt.freeText,
          music_style: (data.artistContext?.styleDNA.genres ?? [])[0],
          isInstrumental: data.artistContext?.lore
            ? data.artistContext.lore.toLowerCase().includes('instrumental')
            : false,
          ...(data.lyrics && { lyrics: data.lyrics }),
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({}));
        throw new Error(
          errorData.error || `MusicGPT API returned ${apiResponse.status}`
        );
      }

      const result = await apiResponse.json();
      providerTaskId = result.taskId || null;

      if (!providerTaskId) {
        throw new Error('MusicGPT API did not return a task ID');
      }

      // Store conversion IDs and full response in metadata for later use
      const conversionIds = result.conversionIds || [];
      const metadata = {
        ...result.raw,
        conversionIds,
      };

      // Store these for generation creation
      (data as { providerConversionIds?: string[]; providerMetadata?: Record<string, unknown> }).providerConversionIds = conversionIds;
      (data as { providerMetadata?: Record<string, unknown> }).providerMetadata = metadata;
    } catch (error) {
      // Don't create generation document if API call fails
      // The song still exists, but user can retry generation
      console.error('[createGeneration] MusicGPT request failed', error);
      throw new Error(
        `Failed to initiate MusicGPT generation: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // Only create generation document after successful API call (or for stub provider)
  const generationRef = doc(collection(db, COLLECTIONS.generations));
  const generationId = generationRef.id;

  // Extract MusicGPT-specific data if present
  const providerConversionIds = (data as { providerConversionIds?: string[] }).providerConversionIds || null;
  const providerMetadata = (data as { providerMetadata?: Record<string, unknown> }).providerMetadata || {};

  const generation: GenerationDocument = {
    id: generationId,
    songId,
    artistVersionId,
    songVersionId: null,
    prompt: data.prompt,
    parameters: data.parameters,
    provider: data.provider,
    status: data.provider === 'stub' ? 'pending' : 'pending',
    providerTaskId: providerTaskId || data.providerTaskId || null,
    providerConversionIds: providerConversionIds,
    providerProcessedConversions: [],
    output: {
      audioURL: null,
      stems: null,
      metadata: providerMetadata,
    },
    error: null,
    createdAt: Timestamp.now(),
    completedAt: null,
    contentHash: null,
  };

  await setDoc(generationRef, generation);

  // Provider-specific behavior:
  //
  // - "stub": perform a fake synchronous generation so the UI behaves as if
  //   audio were generated immediately.
  // - "musicgpt": generation document is already created with task ID above;
  //   final audio will arrive via webhook and be written by the webhook handler.
  if (data.provider === 'stub') {
    processGeneration(generationId, data).catch(error => {
      console.error('Generation failed:', error);
      updateGenerationStatus(generationId, 'failed', null, error.message);
    });
  }
  // For musicgpt, we've already created the generation with the task ID
  // and it will be completed via webhook

  return generation;
}

/**
 * Process a generation (internal)
 */
async function processGeneration(
  generationId: string,
  data: {
    prompt: {
      structured: Record<string, unknown>;
      freeText: string;
    };
    parameters: {
      duration?: number;
      quality?: 'low' | 'medium' | 'high';
      [key: string]: unknown;
    };
    provider: string;
    artistContext?: {
      styleDNA: {
        genres: string[];
        moods: string[];
        tempoRange: { min: number; max: number };
        influences: string[];
      };
      lore: string;
    };
  }
): Promise<void> {
  // Update status to processing
  await updateGenerationStatus(generationId, 'processing', null, null);

  try {
    // Get AI provider and generate
    const response = await aiService.generateSong(data.provider, {
      prompt: data.prompt,
      parameters: data.parameters,
      artistContext: data.artistContext,
    });

    // Upload audio to Firebase Storage if needed
    let audioURL = response.audioURL;
    if (!audioURL.startsWith('http') && !audioURL.startsWith('gs://')) {
      // If it's a local file or blob, upload it
      // For now, we'll assume the provider returns a URL
      // In production, you'd handle file uploads here
    }

    // Upload stems if provided
    let stems: string[] | null = null;
    if (response.stems && response.stems.length > 0) {
      stems = response.stems; // In production, upload each stem
    }

    // Calculate content hash
    const contentHash = await hashGeneration(data.prompt, {
      audioURL,
      stems,
    });

    // Update generation with results
    await updateGenerationStatus(
      generationId,
      'completed',
      {
        audioURL,
        stems,
        metadata: response.metadata,
      },
      null,
      contentHash
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await updateGenerationStatus(generationId, 'failed', null, errorMessage);
    throw error;
  }
}

/**
 * Update generation status
 */
async function updateGenerationStatus(
  generationId: string,
  status: GenerationDocument['status'],
  output: GenerationDocument['output'] | null,
  error: string | null,
  contentHash?: string | null
): Promise<void> {
  const generationRef = doc(db, getGenerationPath(generationId));
  const updates: Partial<GenerationDocument> = {
    status,
    completedAt: status === 'completed' || status === 'failed' 
      ? Timestamp.now() 
      : null,
  };

  if (output !== null) {
    updates.output = output;
  }

  if (error !== null) {
    updates.error = error;
  }

  if (contentHash !== undefined) {
    updates.contentHash = contentHash;
  }

  await updateDoc(generationRef, updates);
}

/**
 * Get a generation by ID
 */
export async function getGeneration(
  generationId: string
): Promise<GenerationDocument | null> {
  const generationRef = doc(db, getGenerationPath(generationId));
  const snapshot = await getDoc(generationRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as GenerationDocument;
}

/**
 * Get generations for a song version
 */
export async function getSongVersionGenerations(
  songVersionId: string
): Promise<GenerationDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.generations),
    where('songVersionId', '==', songVersionId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as GenerationDocument);
}

/**
 * Get generations for a song (across all versions).
 */
export async function getSongGenerations(
  songId: string
): Promise<GenerationDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.generations),
    where('songId', '==', songId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as GenerationDocument);
}


