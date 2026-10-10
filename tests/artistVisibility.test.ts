import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  artistIsVisible,
  artistReadResponse,
  artistShareMetadata,
} from '../lib/artists/visibility';

const FACE = 'https://cdn.example/private-face.jpg';
const privateArtist = {
  id: 'Far2rKTQV98sbAf1iqxw',
  name: 'Hidden Band',
  lore: 'Secret bio that must not leak',
  avatarURL: FACE,
  ownerId: 'alice',
  isPublic: false,
  deletedAt: null,
};

describe('private artist page access', () => {
  it('gives signed-out and a different user a 404 with no name, bio, or face', () => {
    for (const viewerId of [null, 'bob']) {
      assert.equal(artistIsVisible(privateArtist, viewerId), false);
      const metadata = artistShareMetadata(privateArtist, 'https://streamstar.xyz/artists/Far2rKTQV98sbAf1iqxw');
      const metaJson = JSON.stringify(metadata);
      assert.equal(metadata.title, 'Artist');
      assert.equal(metadata.description, undefined);
      assert.equal(metadata.image, null);
      assert.equal(metaJson.includes('Hidden Band'), false);
      assert.equal(metaJson.includes('Secret bio'), false);
      assert.equal(metaJson.includes(FACE), false);

      const api = artistReadResponse(privateArtist, viewerId);
      assert.equal(api.status, 404);
      const apiJson = JSON.stringify(api);
      assert.equal(apiJson.includes('Hidden Band'), false);
      assert.equal(apiJson.includes('Secret bio'), false);
      assert.equal(apiJson.includes(FACE), false);
      assert.equal(apiJson.includes('alice'), false);
    }
  });

  it('lets the owner open the page while share metadata stays generic', () => {
    assert.equal(artistIsVisible(privateArtist, 'alice'), true);
    const api = artistReadResponse(privateArtist, 'alice');
    assert.equal(api.status, 200);
    if (api.status === 200) {
      assert.equal(api.artist.name, 'Hidden Band');
    }
    const metadata = artistShareMetadata(privateArtist, 'https://streamstar.xyz/artists/Far2rKTQV98sbAf1iqxw');
    assert.equal(JSON.stringify(metadata).includes('Hidden Band'), false);
    assert.equal(metadata.image, null);
  });

  it('keeps a public artist visible, including share name and face', () => {
    const artist = { ...privateArtist, isPublic: true };
    assert.equal(artistIsVisible(artist, null), true);
    const metadata = artistShareMetadata(artist, 'https://streamstar.xyz/artists/Far2rKTQV98sbAf1iqxw');
    assert.equal(metadata.title, 'Hidden Band');
    assert.equal(metadata.image, FACE);
    assert.equal(artistReadResponse(artist, null).status, 200);
  });
});
