/**
 * Lyrics Service
 * 
 * Server-side service for fetching lyrics from song generations.
 */

import type { GenerationDocument } from '@/types/firestore';
import { parseLyricsFromMetadata, type LyricsData } from '@/lib/utils/lyrics';

/**
 * Get lyrics for a song from its generations
 * 
 * Returns lyrics from the most recent completed generation,
 * or from a specific conversion if conversionId is provided.
 */
export function getLyricsForSong(
  generations: GenerationDocument[],
  conversionId?: string
): LyricsData | null {
  // Find completed generations, sorted by completion time (most recent first)
  const completedGenerations = generations
    .filter(g => g.status === 'completed' && g.output?.metadata)
    .sort((a, b) => {
      const aTime = a.completedAt?.toMillis() || 0;
      const bTime = b.completedAt?.toMillis() || 0;
      return bTime - aTime;
    });

  // Try to find lyrics in each generation
  for (const generation of completedGenerations) {
    const lyrics = parseLyricsFromMetadata(
      generation.output.metadata,
      conversionId
    );

    if (lyrics) {
      return lyrics;
    }
  }

  return null;
}

/**
 * Get all lyrics versions for a song
 * Useful for displaying multiple lyric sets (e.g., different conversions)
 */
export function getAllLyricsForSong(
  generations: GenerationDocument[]
): Array<LyricsData & { generationId: string; conversionId?: string }> {
  const allLyrics: Array<LyricsData & { generationId: string; conversionId?: string }> = [];

  const completedGenerations = generations.filter(
    g => g.status === 'completed' && g.output?.metadata
  );

  for (const generation of completedGenerations) {
    const metadata = generation.output.metadata;

    // Extract all conversion IDs from metadata keys
    const conversionIds = new Set<string>();
    for (const key of Object.keys(metadata)) {
      const match = key.match(/^conversion_([^_]+)_lyrics$/);
      if (match) {
        conversionIds.add(match[1]);
      }
    }

    // If specific conversion requested, only get that one
    if (conversionIds.size === 0) {
      // Try to parse without conversion ID (fallback)
      const lyrics = parseLyricsFromMetadata(metadata);
      if (lyrics) {
        allLyrics.push({
          ...lyrics,
          generationId: generation.id,
        });
      }
    } else {
      // Get lyrics for each conversion
      for (const convId of conversionIds) {
        const lyrics = parseLyricsFromMetadata(metadata, convId);
        if (lyrics) {
          allLyrics.push({
            ...lyrics,
            generationId: generation.id,
            conversionId: convId,
          });
        }
      }
    }
  }

  return allLyrics;
}

