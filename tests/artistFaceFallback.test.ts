import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publicArtistPhotoUrl } from '../lib/artists/cardDisplay';
import { artistFaceSources, songCoverCandidates } from '../lib/images/artistFace';

const LOCKED = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/look.jpg?alt=media';
const AVATAR = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/avatar.jpg?alt=media';
const COVER = 'https://cdn.example/covers/poster.jpg';

describe('song card face sources', () => {
  it('uses the song cover first when the artist has no avatarURL', () => {
    const photoUrl = publicArtistPhotoUrl(null, null);
    const sources = artistFaceSources(
      photoUrl,
      songCoverCandidates({
        coverPosterUrl: COVER,
        albumCoverThumbnail: 'https://cdn.example/covers/thumb.jpg',
        albumCoverPath: 'https://cdn.example/covers/album.jpg',
      })
    );
    assert.equal(photoUrl, null);
    assert.equal(sources[0], COVER);
  });

  it('puts the locked face first when a current-version look is present', () => {
    const photoUrl = publicArtistPhotoUrl(LOCKED, AVATAR);
    const sources = artistFaceSources(
      photoUrl,
      songCoverCandidates({
        coverPosterUrl: COVER,
        albumCoverThumbnail: null,
        albumCoverPath: null,
      })
    );
    assert.equal(photoUrl, LOCKED);
    assert.equal(sources[0], LOCKED);
  });

  it('returns a public https face from the artist document field shape', () => {
    const artist = {
      name: 'Nicky G',
      avatarURL: AVATAR,
      currentVersionId: 'ver-locked',
      isPublic: true,
    };
    const version = { avatarURL: LOCKED };
    const photoUrl = publicArtistPhotoUrl(version.avatarURL, artist.avatarURL);
    assert.equal(photoUrl, LOCKED);

    const missingVersion = publicArtistPhotoUrl(null, artist.avatarURL);
    assert.equal(missingVersion, AVATAR);
    assert.equal(publicArtistPhotoUrl('artist-looks/uid/look.jpg', 'not-a-url'), null);
  });
});
