import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtistFace } from '../components/artists/ArtistFace';
import { artistHeroFaceSources, failFaceSrc } from '../lib/images/artistFace';

const LOCKED = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/look.jpg?alt=media';
const AVATAR = 'https://firebasestorage.googleapis.com/v0/b/stream-dev/o/avatar.jpg?alt=media';
const COVER = 'https://cdn.example/covers/leg.jpg';
const THUMB = 'https://cdn.example/covers/thumb.jpg';
const ALBUM = 'https://cdn.example/covers/album.jpg';

const coverSong = {
  coverPosterUrl: COVER,
  albumCoverThumbnail: THUMB,
  albumCoverPath: ALBUM,
  isPublic: true,
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
    assert.deepEqual(sources, [THUMB, COVER, ALBUM]);
    const html = faceHtml(sources, 'Gunna');
    assert.ok(html.includes(`src="${THUMB}"`));
    assert.match(html, /#14141C/);
    assert.match(html, /artist-face-hero/);
    assert.doesNotMatch(html, /artist-index-face-initials/);
    assert.doesNotMatch(html, />GU</);

    const row = renderToStaticMarkup(
      createElement(ArtistFace, { name: 'Gunna', sources, size: 'card' })
    );
    assert.match(row, /artist-face-card/);
    assert.match(row, /artist-index-face-initials/);
    assert.ok(row.includes(`src="${THUMB}"`));
  });

  it('walks thumbnail, full cover, then the next song', () => {
    const nextThumb = 'https://cdn.example/covers/next-thumb.jpg';
    const nextCover = 'https://cdn.example/covers/next-full.jpg';
    const sources = artistHeroFaceSources({
      lockedLookUrl: null,
      avatarURL: null,
      songs: [
        coverSong,
        {
          isPublic: true,
          albumCoverThumbnail: nextThumb,
          coverPosterUrl: nextCover,
          albumCoverPath: null,
        },
      ],
    });
    assert.deepEqual(sources, [THUMB, COVER, ALBUM, nextThumb, nextCover]);
  });

  it('shows the second candidate when the first fails, and initials only after every candidate fails', () => {
    const missing = 'https://cdn.example/missing.jpg';
    const ok = 'https://cdn.example/ok.jpg';
    const afterFirst = failFaceSrc([missing, ok], [], missing, null);
    assert.equal(afterFirst.src, ok);
    assert.deepEqual(afterFirst.failed, [missing]);
    const shown = faceHtml(afterFirst.src ? [afterFirst.src] : [], 'Gunna');
    assert.ok(shown.includes(`src="${ok}"`));
    assert.doesNotMatch(shown, /artist-index-face-initials/);
    assert.doesNotMatch(shown, />GU</);

    const stayed = failFaceSrc([missing, ok], [], missing, missing);
    assert.equal(stayed.src, missing);

    const afterBoth = failFaceSrc([missing, ok], afterFirst.failed, ok, null);
    assert.equal(afterBoth.src, null);
    const initials = faceHtml([]);
    assert.match(initials, /artist-index-face-initials/);
    assert.doesNotMatch(initials, /<img/);
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
