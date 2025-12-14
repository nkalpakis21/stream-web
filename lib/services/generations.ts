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
 * Create a generation request
 */
export async function createGeneration(
  songVersionId: string,
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
): Promise<GenerationDocument> {
  const generationRef = doc(collection(db, COLLECTIONS.generations));
  const generationId = generationRef.id;

  const generation: GenerationDocument = {
    id: generationId,
    songVersionId,
    prompt: data.prompt,
    parameters: data.parameters,
    provider: data.provider,
    status: 'pending',
    output: {
      audioURL: null,
      stems: null,
      metadata: {},
    },
    error: null,
    createdAt: Timestamp.now(),
    completedAt: null,
    contentHash: null,
  };

  await setDoc(generationRef, generation);

  // Start generation asynchronously
  processGeneration(generationId, data).catch(error => {
    console.error('Generation failed:', error);
    updateGenerationStatus(generationId, 'failed', null, error.message);
  });

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

