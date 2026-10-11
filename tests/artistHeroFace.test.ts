import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtistFace } from '../components/artists/ArtistFace';
import { artistHeroFaceSources } from '../lib/images/artistFace';

const LOCKED = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/look.jpg?alt=media';
const AVATAR = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/avatar.jpg?alt=media';
const COVER = 'https://cdn.example/covers/leg.jpg';

const coverSong = {
  coverPosterUrl: COVER,
  albumCoverThumbnail: 'https://cdn.example/covers/thumb.jpg',
  albumCoverPath: 'https://cdn.example/covers/album.jpg',
};

function faceHtml(sources: string[], name = 'L.E.G') {
  return renderToStaticMarkup(
    createElement(ArtistFace, { name, sources, size: 'hero' })
  );
}

describe('artist hero face', () => {
  it('uses the current-version avatar, then the artist avatar', () => {
    const locked = artistHeroFaceSources({
      lockedLookUrl: LOCKED,
      avatarURL: AVATAR,
      song: coverSong,
    });
    assert.equal(locked[0], LOCKED);

    const avatar = artistHeroFaceSources({
      lockedLookUrl: null,
      avatarURL: AVATAR,
      song: coverSong,
    });
    assert.equal(avatar[0], AVATAR);

    const html = faceHtml(avatar);
    assert.ok(html.includes(`src="${AVATAR}"`));
    assert.match(html, /#14141C/);
    assert.doesNotMatch(html, /artist-index-face-initials/);
    assert.equal(locked[1], AVATAR);
    assert.ok(locked.includes(COVER));
  });

  it('uses the latest public song cover when the artist has no avatar', () => {
    const sources = artistHeroFaceSources({
      lockedLookUrl: null,
      avatarURL: null,
      song: coverSong,
    });
    assert.equal(sources[0], COVER);
    const html = faceHtml(sources, 'Gunna');
    assert.ok(html.includes(`src="${COVER}"`));
    assert.match(html, /#14141C/);
    assert.match(html, /artist-face-hero/);
    assert.doesNotMatch(html, /artist-index-face-initials/);
    assert.doesNotMatch(html, />GU</);

    const row = renderToStaticMarkup(
      createElement(ArtistFace, { name: 'Gunna', sources, size: 'card' })
    );
    assert.match(row, /artist-face-card/);
    assert.match(row, /artist-index-face-initials/);
    assert.ok(row.includes(`src="${COVER}"`));
  });

  it('paints initials when there is no avatar and no cover', () => {
    const sources = artistHeroFaceSources({
      lockedLookUrl: '  ',
      avatarURL: null,
      song: {
        coverPosterUrl: null,
        albumCoverThumbnail: '',
        albumCoverPath: null,
      },
    });
    assert.deepEqual(sources, []);
    const html = faceHtml(sources, 'L.E.G');
    assert.match(html, /artist-face-hero/);
    assert.match(html, /#14141C/);
    assert.match(html, /artist-index-face-initials/);
    assert.match(html, />L\.</);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /CoverPlaceholder|bg-muted/);
  });
});
