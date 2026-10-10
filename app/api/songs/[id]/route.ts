import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { countedPlayLogLine, songPatchMode } from '@/lib/server/playAttribution';
import { reservePlayCount } from '@/lib/server/playRateLimit';
import {
  adminGetSong,
  adminIncrementPlayCount,
  adminSoftDeleteSong,
  adminUpdateSongOwnerFields,
} from '@/lib/server/songsAdmin';
import { maybePostSongLive } from '@/lib/x/postSong';

export const runtime = 'nodejs';

/** Matches the mobile title cap. */
const SONG_TITLE_MAX_LENGTH = 300;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * Play-count-only `{ playCount: "increment" }` stays anonymous and rate-limited.
 * Optional `source` and `background` are accepted. Any other extra field on
 * that path is ignored. `title` and `isPublic` require the song owner, and
 * unknown fields on that path are rejected. A number `playCount` is never
 * accepted.
 *
 * Counted plays log `play_counted`. They do not write `playsBySource` or
 * `playsBackground`: PR #95's song key allowlist would reject later client
 * updates of a song that carried those fields.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('No valid fields to update');
    }

    const record = body as Record<string, unknown>;
    const parsed = songPatchMode(record);
    if (parsed.mode === 'invalid') return badRequest(parsed.error);

    if (parsed.mode === 'increment') {
      const reservation = await reservePlayCount(request, songId);
      if (reservation !== 'limited') {
        await adminIncrementPlayCount(songId);
        const line = countedPlayLogLine({
          songId,
          source: parsed.source,
          background: parsed.background,
          reservation,
        });
        if (line) console.log(line);
      }
      return NextResponse.json({ success: true });
    }

    const { hasPlay, hasTitle, hasPublic } = parsed;
    let title: string | undefined;
    if (hasTitle) {
      if (typeof record.title !== 'string') {
        return badRequest('title must be a string');
      }
      title = record.title.trim();
      if (!title) return badRequest('title cannot be empty');
      if (title.length > SONG_TITLE_MAX_LENGTH) {
        return badRequest(`title must be ${SONG_TITLE_MAX_LENGTH} characters or fewer`);
      }
    }
    if (hasPublic && typeof record.isPublic !== 'boolean') {
      return badRequest('isPublic must be a boolean');
    }

    const userId = await requireUser(request);
    const song = await adminGetSong(songId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }
    if (song.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Only the owner can update this song' },
        { status: 403 }
      );
    }

    let incrementPlayCount = false;
    if (hasPlay) {
      const reservation = await reservePlayCount(request, songId);
      incrementPlayCount = reservation !== 'limited';
    }

    await adminUpdateSongOwnerFields(songId, {
      title,
      isPublic: hasPublic ? (record.isPublic as boolean) : undefined,
      incrementPlayCount,
    });

    if (record.isPublic === true) {
      try {
        const updated = await adminGetSong(songId);
        if (updated?.isPublic) {
          await maybePostSongLive(songId);
        }
      } catch (error) {
        console.error('[API /songs] X song-live post failed:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('Error updating song:', error);
    return NextResponse.json({ error: 'Failed to update song' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id;
    const userId = await requireUser(request);
    await request.json().catch(() => null);

    const song = await adminGetSong(songId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }
    if (song.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Only the owner can delete this song' },
        { status: 403 }
      );
    }

    await adminSoftDeleteSong(songId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('Error deleting song:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('already deleted')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes('owner')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json({ error: 'Failed to delete song' }, { status: 500 });
  }
}
