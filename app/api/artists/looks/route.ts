import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  FAL_KEY_MISSING_MESSAGE,
  generateArtistLooks,
  isFalConfigured,
} from '@/lib/ai/fal';

/**
 * FAL_KEY (server-only): Fal.ai API key for Flux artist-look generation.
 * Unset = generate is disabled (503). Artist create still works with no avatar.
 */

export const maxDuration = 60;

const generateBodySchema = z.object({
  name: z.string().trim().min(1, 'Artist name is required').max(80),
  lore: z.string().max(2000).optional().default(''),
  genres: z.array(z.string().max(40)).max(12).optional().default([]),
  moods: z.array(z.string().max(40)).max(12).optional().default([]),
  influences: z.array(z.string().max(60)).max(12).optional().default([]),
  lookNotes: z.string().max(500).optional(),
  referenceImage: z.string().max(2_500_000).optional(),
});

export async function GET() {
  return NextResponse.json({ available: isFalConfigured() });
}

export async function POST(request: Request) {
  if (!isFalConfigured()) {
    return NextResponse.json(
      { error: FAL_KEY_MISSING_MESSAGE, available: false },
      { status: 503 }
    );
  }

  try {
    const json = await request.json();
    const parsed = generateBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }

    const looks = await generateArtistLooks({
      name: parsed.data.name,
      lore: parsed.data.lore,
      genres: parsed.data.genres,
      moods: parsed.data.moods,
      influences: parsed.data.influences,
      lookNotes: parsed.data.lookNotes,
      referenceImage: parsed.data.referenceImage,
    });

    return NextResponse.json({ looks, available: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate artist looks';
    console.error('[API /artists/looks]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
