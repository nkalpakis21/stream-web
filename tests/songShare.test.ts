import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brandOgImageUrl } from '../lib/brand/site';
import { isSongPagePath } from '../lib/songs/paths';
import {
  SHARE_COLUMN_WIDTH,
  SHARE_LISTEN,
  coverFaceVersionMs,
  layoutShareTitle,
  measureShareText,
  metadataFromShareFacts,
  selectShareArt,
  shareImagePath,
  shareImageContentType,
  sharePageGate,
  songIsSharePublic,
} from '../lib/songs/shareCard';
import { hiddenSongPageMetadata } from '../lib/songs/visibility';
import {
  VISITOR_ID_MAX_AGE_SECONDS,
  canonicalVisitorId,
  createVisitorId,
} from '../lib/analytics/visitorId';

const SECRET = 'Seed Private Song';

function imageUrl(metadata: {
  openGraph?: { images?: unknown } | null;
}): string {
  const images = metadata.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : null;
  if (!first) return '';
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && first && 'url' in first) return String(first.url);
  return '';
}

describe('song share metadata', () => {
  it('sets the share title, listen description, large card, and versioned image', () => {
    const versionMs = 1_730_000_000_000;
    const resolved = metadataFromShareFacts({
      gate: 'public',
      songId: 'song-1',
      title: 'Night Drive',
      artistName: 'Nova',
      audioReady: true,
      coverUrl: 'https://cdn.example/cover.jpg',
      faceUrl: 'https://cdn.example/face.jpg',
      versionMs,
    });
    assert.equal(resolved.notFound, false);
    if (resolved.notFound) return;
    const { metadata } = resolved;
    const twitter = metadata.twitter as { card?: string; title?: string; images?: string[] } | null;
    assert.equal(metadata.openGraph?.title, 'Night Drive by Nova');
    assert.equal(twitter?.title, 'Night Drive by Nova');
    assert.equal(metadata.openGraph?.description, SHARE_LISTEN);
    assert.equal(metadata.description, SHARE_LISTEN);
    assert.equal(twitter?.card, 'summary_large_image');
    const url = imageUrl(metadata);
    assert.equal(
      url,
      `https://www.streamstar.xyz/songs/song-1/opengraph-image?v=${versionMs}`
    );
    assert.equal(twitter?.images?.[0], url);
    assert.equal(shareImagePath('song-1', versionMs), `/songs/song-1/opengraph-image?v=${versionMs}`);
  });

  it('versions the image from the newer of the cover and the face', () => {
    assert.equal(
      coverFaceVersionMs({
        coverUrl: 'https://cdn.example/cover.jpg',
        coverUpdatedAtMs: 100,
        songUpdatedAtMs: 90,
        faceUrl: 'https://cdn.example/face.jpg',
        faceUpdatedAtMs: 250,
      }),
      250
    );
    assert.equal(
      coverFaceVersionMs({
        coverUrl: 'https://cdn.example/cover.jpg',
        coverUpdatedAtMs: null,
        songUpdatedAtMs: 80,
        faceUrl: null,
        faceUpdatedAtMs: 999,
      }),
      80
    );
    assert.equal(
      coverFaceVersionMs({
        coverUrl: null,
        coverUpdatedAtMs: 500,
        faceUrl: null,
        faceUpdatedAtMs: null,
      }),
      null
    );
  });

  it('picks the cover, the face, initials, or the brand image', () => {
    const both = selectShareArt({
      shareable: true,
      coverUrl: ' https://cdn.example/cover.jpg ',
      faceUrl: 'https://cdn.example/face.jpg',
      artistName: 'Nova Lane',
    });
    assert.equal(both.kind, 'card');
    if (both.kind === 'card') {
      assert.deepEqual(both.square, { type: 'image', url: 'https://cdn.example/cover.jpg' });
      assert.deepEqual(both.face, { type: 'image', url: 'https://cdn.example/face.jpg' });
    }

    const faceOnly = selectShareArt({
      shareable: true,
      coverUrl: null,
      faceUrl: 'https://cdn.example/face.jpg',
      artistName: 'Nova',
    });
    assert.equal(faceOnly.kind, 'card');
    if (faceOnly.kind === 'card') {
      assert.deepEqual(faceOnly.square, { type: 'image', url: 'https://cdn.example/face.jpg' });
      assert.deepEqual(faceOnly.face, { type: 'image', url: 'https://cdn.example/face.jpg' });
    }

    const coverOnly = selectShareArt({
      shareable: true,
      coverUrl: 'https://cdn.example/cover.jpg',
      faceUrl: '  ',
      artistName: 'Nova Lane',
    });
    assert.equal(coverOnly.kind, 'card');
    if (coverOnly.kind === 'card') {
      assert.deepEqual(coverOnly.square, { type: 'image', url: 'https://cdn.example/cover.jpg' });
      assert.deepEqual(coverOnly.face, { type: 'initials', initials: 'NL' });
    }

    const oneWord = selectShareArt({
      shareable: true,
      coverUrl: 'https://cdn.example/cover.jpg',
      faceUrl: null,
      artistName: 'Jimmy',
    });
    assert.equal(oneWord.kind, 'card');
    if (oneWord.kind === 'card') {
      assert.deepEqual(oneWord.face, { type: 'initials', initials: 'J' });
    }

    assert.deepEqual(
      selectShareArt({ shareable: true, coverUrl: null, faceUrl: null, artistName: 'Nova' }),
      { kind: 'brand' }
    );
    assert.deepEqual(
      selectShareArt({
        shareable: false,
        coverUrl: 'https://cdn.example/secret.jpg',
        faceUrl: 'https://cdn.example/face.jpg',
        artistName: SECRET,
      }),
      { kind: 'brand' }
    );
  });

  it('gives private, deleted, and not-ready songs no card', () => {
    const secret = {
      title: SECRET,
      ownerId: 'owner-alice',
      isPublic: false,
      deletedAt: null,
    };
    assert.equal(sharePageGate(secret, null), 'not-found');
    assert.equal(sharePageGate(secret, 'owner-bob'), 'not-found');
    assert.equal(sharePageGate(secret, 'owner-alice'), 'hidden');
    assert.equal(sharePageGate({ ...secret, deletedAt: 1 }, 'owner-alice'), 'not-found');
    assert.equal(sharePageGate({ ...secret, isPublic: true, deletedAt: 1 }, null), 'not-found');
    assert.equal(sharePageGate(null, null), 'not-found');

    const hidden = metadataFromShareFacts({ gate: 'hidden' });
    assert.equal(hidden.notFound, false);
    if (!hidden.notFound) {
      const meta = JSON.stringify(hidden.metadata);
      assert.equal(meta.includes(SECRET), false);
      assert.equal(hidden.metadata.openGraph?.images && Array.isArray(hidden.metadata.openGraph.images)
        ? hidden.metadata.openGraph.images.length
        : 0, 0);
      assert.deepEqual(hidden.metadata, hiddenSongPageMetadata());
    }
    assert.equal(metadataFromShareFacts({ gate: 'not-found' }).notFound, true);

    const pending = metadataFromShareFacts({
      gate: 'public',
      songId: 'song-pending',
      title: 'Still Rendering',
      artistName: 'Nova',
      audioReady: false,
      coverUrl: 'https://cdn.example/cover.jpg',
      faceUrl: 'https://cdn.example/face.jpg',
      versionMs: 50,
    });
    assert.equal(pending.notFound, false);
    if (!pending.notFound) {
      assert.equal(imageUrl(pending.metadata), brandOgImageUrl());
      assert.equal(imageUrl(pending.metadata).includes('song-pending'), false);
      assert.equal(imageUrl(pending.metadata).includes('opengraph-image'), false);
    }

    const shell = {
      title: 'Waiting Shell',
      ownerId: 'owner-alice',
      isPublic: true,
      deletedAt: null,
      audioReady: false as const,
    };
    assert.equal(songIsSharePublic(shell), false);
    assert.equal(sharePageGate(shell, null), 'not-found');
    assert.equal(sharePageGate(shell, 'owner-alice'), 'hidden');
    const failed = { ...shell, audioReady: true, generationStatus: 'failed' as const, title: 'Failed Take' };
    assert.equal(songIsSharePublic(failed), false);
    assert.equal(sharePageGate(failed, null), 'not-found');
    assert.equal(sharePageGate(failed, 'owner-bob'), 'not-found');
    assert.equal(sharePageGate(failed, 'owner-alice'), 'hidden');
    const ownerFailed = metadataFromShareFacts({ gate: 'hidden' });
    assert.equal(ownerFailed.notFound, false);
    if (!ownerFailed.notFound) {
      const meta = JSON.stringify(ownerFailed.metadata);
      assert.equal(meta.includes('Failed Take'), false);
      assert.equal(meta.includes('opengraph-image'), false);
      assert.equal(ownerFailed.metadata.openGraph?.images && Array.isArray(ownerFailed.metadata.openGraph.images)
        ? ownerFailed.metadata.openGraph.images.length
        : 0, 0);
    }
    assert.equal(metadataFromShareFacts({ gate: 'not-found' }).notFound, true);
    assert.equal(songIsSharePublic({ ...shell, audioReady: undefined, title: 'Legacy' }), true);
    assert.equal(shareImageContentType('binary/octet-stream', Uint8Array.from([0xff, 0xd8, 0xff, 0])), 'image/jpeg');
    assert.equal(shareImageContentType('image/png', Uint8Array.from([0])), 'image/png');
    assert.equal(shareImageContentType('text/html', Uint8Array.from([0x3c, 0x68])), null);

    const noArt = metadataFromShareFacts({
      gate: 'public',
      songId: 'song-plain',
      title: 'Plain',
      artistName: 'Nova',
      audioReady: true,
      coverUrl: null,
      faceUrl: null,
      versionMs: null,
    });
    assert.equal(noArt.notFound, false);
    if (!noArt.notFound) assert.equal(imageUrl(noArt.metadata), brandOgImageUrl());
  });

  it('steps the title down, then ellipsizes inside two lines', () => {
    const short = layoutShareTitle('Night Drive');
    assert.equal(short.fontSize, 64);
    assert.deepEqual(short.lines, ['Night Drive']);

    let stepped = '';
    for (let count = 2; count < 30; count += 1) {
      const text = Array.from({ length: count }, () => 'amber').join(' ');
      const layout = layoutShareTitle(text);
      if (layout.fontSize === 52 && layout.lines.every(line => !line.includes('…'))) {
        stepped = text;
        break;
      }
    }
    assert.ok(stepped, 'expected a title that fits at 52px and not at 64px');
    const steppedLayout = layoutShareTitle(stepped);
    assert.equal(steppedLayout.fontSize, 52);
    assert.ok(steppedLayout.lines.length <= 2);

    const squeezed = layoutShareTitle('W'.repeat(80));
    assert.equal(squeezed.fontSize, 52);
    assert.ok(squeezed.lines.length <= 2);
    assert.equal(squeezed.lines.some(line => line.endsWith('…')), true);
    for (const line of squeezed.lines) {
      assert.ok(measureShareText(line, 52) <= SHARE_COLUMN_WIDTH);
    }
  });
});

describe('song page path', () => {
  it('matches only /songs/[id]', () => {
    assert.equal(isSongPagePath('/songs/abc'), true);
    assert.equal(isSongPagePath('/songs/abc/fork'), false);
    assert.equal(isSongPagePath('/song/abc'), false);
    assert.equal(isSongPagePath('/discover'), false);
  });
});

describe('share visitor id', () => {
  it('accepts ssv_ uuid v4 and keeps it for about a year', () => {
    const minted = createVisitorId();
    assert.equal(canonicalVisitorId(minted), minted);
    assert.equal(canonicalVisitorId('  SSV_11111111-1111-4111-8111-111111111111  '), 'ssv_11111111-1111-4111-8111-111111111111');
    assert.equal(canonicalVisitorId('ssv_nope'), null);
    assert.equal(canonicalVisitorId('ssv_11111111-1111-3111-8111-111111111111'), null);
    assert.equal(canonicalVisitorId('visitor'), null);
    const year = 60 * 60 * 24 * 365;
    assert.equal(VISITOR_ID_MAX_AGE_SECONDS, year);
  });
});
