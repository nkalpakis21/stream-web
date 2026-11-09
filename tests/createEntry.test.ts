import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  CREATE_ARTIST_HREF,
  CREATE_SONG_HREF,
  createEntryTarget,
  STUDIO_NEW_SONG_HREF,
} from '../lib/create/paths';

describe('generic Create routing', () => {
  it('opens the sheet only for a signed-in manager who already has an artist', () => {
    assert.equal(createEntryTarget({ signedIn: true, hasArtists: true }), 'sheet');
    assert.equal(createEntryTarget({ signedIn: true, hasArtists: false }), 'create');
    assert.equal(createEntryTarget({ signedIn: false, hasArtists: true }), 'create');
    assert.equal(createEntryTarget({ signedIn: false, hasArtists: false }), 'create');
  });

  it('sends New song to Studio and New artist to /create', () => {
    assert.equal(CREATE_ARTIST_HREF, '/create');
    assert.equal(STUDIO_NEW_SONG_HREF, '/dashboard?tab=songs&new=1');
    assert.equal(CREATE_SONG_HREF, STUDIO_NEW_SONG_HREF);
    const sheet = readFileSync('components/create/CreateEntrySheet.tsx', 'utf8');
    assert.match(sheet, /STUDIO_NEW_SONG_HREF/);
    assert.match(sheet, /CREATE_ARTIST_HREF/);
    assert.match(sheet, /New song/);
    assert.match(sheet, /New artist/);
    assert.match(sheet, /rounded-\[12px\]/);
    assert.doesNotMatch(sheet, /#C8F542|lime/);
  });
});