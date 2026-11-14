import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectArtistPageSongs } from '../lib/artists/ownerSongs';
import {
  audioUrlForPlayback,
  playableAudioUrl,
  songAudioExpired,
  takePlayablePage,
  withoutExpiredAudio,
  type AudioVersionRef,
} from '../lib/songs/audioAvailability';

function version(partial: AudioVersionRef): AudioVersionRef {
  return partial;
}

describe('song audio expiry filter', () => {
  it('treats an expired primary with no other audio as unplayable', () => {
    const versions = [version({ id: 'a', isPrimary: true, audioURL: 'https://old', audioExpired: true })];
    assert.equal(songAudioExpired(versions), true);
    assert.equal(playableAudioUrl(versions), null);
    assert.equal(audioUrlForPlayback(versions, 'https://old'), null);
  });

  it('keeps a song when another version still has playable audio', () => {
    const versions = [
      version({ id: 'a', isPrimary: true, audioURL: 'https://old', audioExpired: true }),
      version({ id: 'b', isPrimary: false, audioURL: 'https://live', audioExpired: false }),
    ];
    assert.equal(songAudioExpired(versions), false);
    assert.equal(playableAudioUrl(versions), 'https://live');
    assert.equal(audioUrlForPlayback(versions, 'https://old'), 'https://live');
  });

  it('plays the primary when only a non-primary file expired', () => {
    const versions = [
      version({ id: 'a', isPrimary: true, audioURL: 'https://live' }),
      version({ id: 'b', audioURL: 'https://old', audioExpired: true }),
    ];
    assert.equal(songAudioExpired(versions), false);
    assert.equal(playableAudioUrl(versions), 'https://live');
  });

  it('does not hide a version that was never marked expired', () => {
    const versions = [version({ isPrimary: true, audioURL: 'https://ours.example/song.mp3' })];
    assert.equal(songAudioExpired(versions), false);
    assert.equal(playableAudioUrl(versions), 'https://ours.example/song.mp3');
  });

  it('does not treat a song with no audio yet as expired', () => {
    assert.equal(songAudioExpired([]), false);
    assert.equal(songAudioExpired([version({ isPrimary: true, audioURL: null })]), false);
    assert.equal(audioUrlForPlayback([], 'https://direct'), 'https://direct');
    assert.equal(
      audioUrlForPlayback([version({ isPrimary: true, audioURL: null })], 'https://direct'),
      'https://direct'
    );
  });

  it('drops expired songs and keeps list order', () => {
    const songs = [
      { id: 'first' },
      { id: 'gone' },
      { id: 'third' },
    ];
    const versions = new Map<string, AudioVersionRef[]>([
      ['first', [version({ isPrimary: true, audioURL: 'https://a' })]],
      ['gone', [version({ isPrimary: true, audioURL: 'https://b', audioExpired: true })]],
      ['third', [version({ isPrimary: true, audioURL: 'https://c', audioExpired: false })]],
    ]);
    assert.deepEqual(
      withoutExpiredAudio(songs, song => versions.get(song.id)).map(song => song.id),
      ['first', 'third']
    );
  });

  it('pages past expired rows without giving them a slot', () => {
    const ordered = [
      { id: 'expired-a' },
      { id: 'keep-b' },
      { id: 'keep-c' },
      { id: 'keep-d' },
    ];
    const expired = new Set(['expired-a']);
    const page = takePlayablePage(ordered, song => expired.has(song.id), 2, false);
    assert.deepEqual(page.songs.map(song => song.id), ['keep-b', 'keep-c']);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextCursor, 'keep-c');

    const done = takePlayablePage(
      [{ id: 'keep-b' }, { id: 'keep-c' }],
      () => false,
      2,
      false
    );
    assert.equal(done.hasMore, false);
    assert.equal(done.nextCursor, null);

    const onlyExpired = takePlayablePage(
      [{ id: 'expired-a' }, { id: 'expired-b' }],
      () => true,
      2,
      true
    );
    assert.deepEqual(onlyExpired.songs, []);
    assert.equal(onlyExpired.hasMore, true);
    assert.equal(onlyExpired.nextCursor, 'expired-b');
  });

  it('keeps expired songs in place for the owner and hides them from everyone else', () => {
    const songs = [
      { id: 'new', ownerId: 'alice', artistId: 'band', isPublic: true, createdAt: 30, deletedAt: null },
      { id: 'gone', ownerId: 'alice', artistId: 'band', isPublic: true, createdAt: 20, deletedAt: null },
      { id: 'older', ownerId: 'alice', artistId: 'band', isPublic: true, createdAt: 10, deletedAt: null },
    ];
    const expired = (song: { id: string }) => song.id === 'gone';
    assert.deepEqual(
      selectArtistPageSongs(songs, 'alice', 'alice', 'band', expired).map(song => song.id),
      ['new', 'gone', 'older']
    );
    assert.deepEqual(
      selectArtistPageSongs(songs, 'bob', 'alice', 'band', expired).map(song => song.id),
      ['new', 'older']
    );
    assert.deepEqual(
      selectArtistPageSongs(songs, null, 'alice', 'band', expired).map(song => song.id),
      ['new', 'older']
    );
  });
});
