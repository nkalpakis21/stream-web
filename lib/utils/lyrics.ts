/**
 * Lyrics Utilities
 * 
 * Parsing and transformation utilities for lyrics data from MusicGPT webhooks.
 */

export interface TimestampedLine {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface LyricsData {
  raw: string;
  timestamped?: TimestampedLine[];
  version?: string; // conversion_id or version identifier
}

/**
 * Parse lyrics from generation metadata
 * 
 * Lyrics can be stored in two ways:
 * 1. Lyrics-only webhooks: conversion_{id}_lyrics: { lyrics, lyrics_timestamped, subtype }
 * 2. Main conversion webhooks: conversion_{id}: { lyrics, lyrics_timestamped, ... }
 */
export function parseLyricsFromMetadata(
  metadata: Record<string, unknown>,
  conversionId?: string
): LyricsData | null {
  if (!metadata) return null;

  // Try to find lyrics for specific conversion
  if (conversionId) {
    // First, try lyrics-only webhook format: conversion_{id}_lyrics
    const lyricsKey = `conversion_${conversionId}_lyrics`;
    const lyricsData = metadata[lyricsKey] as Record<string, unknown> | undefined;
    
    if (lyricsData) {
      return parseLyricsData(lyricsData, conversionId);
    }

    // Second, try main conversion webhook format: conversion_{id}.lyrics
    const conversionKey = `conversion_${conversionId}`;
    const conversionData = metadata[conversionKey] as Record<string, unknown> | undefined;
    
    if (conversionData) {
      // Check if this conversion object has lyrics
      if (conversionData.lyrics || conversionData.lyrics_timestamped) {
        return parseLyricsData(conversionData, conversionId);
      }
    }
  }

  // Fallback: search for any conversion_*_lyrics key (lyrics-only webhooks)
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith('conversion_') && key.endsWith('_lyrics')) {
      const lyricsData = value as Record<string, unknown>;
      const parsed = parseLyricsData(lyricsData, key);
      if (parsed) return parsed;
    }
  }

  // Fallback: search for lyrics in main conversion objects
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith('conversion_') && !key.endsWith('_lyrics')) {
      const conversionData = value as Record<string, unknown>;
      if (conversionData && (conversionData.lyrics || conversionData.lyrics_timestamped)) {
        const conversionIdMatch = key.match(/^conversion_(.+)$/);
        const parsed = parseLyricsData(conversionData, conversionIdMatch?.[1]);
        if (parsed) return parsed;
      }
    }
  }

  return null;
}

/**
 * Parse a single lyrics data object
 */
function parseLyricsData(
  data: Record<string, unknown>,
  version?: string
): LyricsData | null {
  const raw = data.lyrics as string | undefined;
  if (!raw) return null;

  const timestamped = parseTimestampedLyrics(data.lyrics_timestamped);

  return {
    raw: raw.trim(),
    timestamped,
    version,
  };
}

/**
 * Parse timestamped lyrics from MusicGPT format
 * 
 * Expected format: Array of { text: string, start: number, end: number }
 * or similar structure
 */
function parseTimestampedLyrics(
  data: unknown
): TimestampedLine[] | undefined {
  if (!data || !Array.isArray(data)) return undefined;

  try {
    return data
      .map((item: unknown) => {
        if (typeof item !== 'object' || item === null) return null;
        
        const obj = item as Record<string, unknown>;
        const text = String(obj.text || obj.lyrics || '');
        const start = Number(obj.start || obj.startTime || 0);
        const end = Number(obj.end || obj.endTime || start);

        if (!text || isNaN(start) || isNaN(end)) return null;

        return { text: text.trim(), start, end };
      })
      .filter((line): line is TimestampedLine => line !== null);
  } catch (error) {
    console.warn('[parseTimestampedLyrics] Failed to parse:', error);
    return undefined;
  }
}

/**
 * Split raw lyrics into lines
 * Preserves empty lines and formatting
 */
export function splitLyricsIntoLines(raw: string): string[] {
  return raw.split(/\r?\n/).map(line => line.trim());
}

/**
 * Find the active line index based on current time
 */
export function findActiveLineIndex(
  timestamped: TimestampedLine[],
  currentTime: number
): number {
  for (let i = 0; i < timestamped.length; i++) {
    const line = timestamped[i];
    if (currentTime >= line.start && currentTime < line.end) {
      return i;
    }
  }

  // If past all lines, return last line
  if (timestamped.length > 0 && currentTime >= timestamped[timestamped.length - 1].end) {
    return timestamped.length - 1;
  }

  return -1;
}

/**
 * Format lyrics for display
 * Handles line breaks, paragraphs, and special formatting
 */
export function formatLyricsForDisplay(raw: string): string {
  // Preserve double line breaks (paragraphs)
  // Normalize single line breaks
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

