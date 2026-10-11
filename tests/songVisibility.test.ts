import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hiddenSongPageMetadata, songIsVisible } from '../lib/songs/visibility';

const PRIVATE = {
  id: 'song-private',
  title: 'Seed Private Song',
  ownerId: 'owner-alice',
  isPublic: false,
  deletedAt: null,
};

describe('song visibility', () => {
  it('shows a private song only to its owner', () => {
    assert.equal(songIsVisible(PRIVATE, null), false);
    assert.equal(songIsVisible(PRIVATE, 'owner-bob'), false);
    assert.equal(songIsVisible(PRIVATE, 'owner-alice'), true);
    assert.equal(songIsVisible({ ...PRIVATE, isPublic: true }, null), true);
    assert.equal(songIsVisible({ ...PRIVATE, deletedAt: 1 }, 'owner-alice'), false);
    assert.equal(songIsVisible(null, 'owner-alice'), false);
  });

  it('keeps the private title out of the shared metadata', () => {
    const meta = JSON.stringify(hiddenSongPageMetadata());
    assert.equal(meta.includes('Seed Private Song'), false);
    assert.equal(meta.includes('owner-alice'), false);
    assert.equal(hiddenSongPageMetadata().robots.index, false);
    assert.equal(hiddenSongPageMetadata().openGraph.images.length, 0);
    assert.equal(hiddenSongPageMetadata().openGraph.title, 'Song');
  });
});