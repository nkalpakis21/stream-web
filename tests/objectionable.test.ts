import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { PATCH } from '../app/api/songs/[id]/route';
import { HttpError } from '../lib/server/auth';
import {
  OBJECTIONABLE_ALLOWLIST,
  OBJECTIONABLE_CONTENT_CODE,
  assertNoObjectionableContent,
  hasObjectionableContent,
} from '../lib/server/objectionable';

describe('objectionable words', () => {
  it('keeps the allowlist, including words that contain a blocked word', () => {
    for (const word of OBJECTIONABLE_ALLOWLIST) {
      assert.equal(hasObjectionableContent(word), false, word);
      assert.equal(hasObjectionableContent(word.toUpperCase()), false, word);
    }
    assert.equal(
      hasObjectionableContent('A cocky assassin in Niger ordered a spicy cocktail in Scunthorpe'),
      false
    );
    assert.equal(hasObjectionableContent('Spices'), false);
    assert.equal(hasObjectionableContent('spiiicy'), false);
    assert.equal(hasObjectionableContent('N1ger'), false);
  });

  it('matches whole words only, including leetspeak, repeats, and spacing', () => {
    const blocked = ['cock', 'c0ck', 'cooock', 'c o c k', 'c.o.c.k', 'C0CK'];
    for (const sample of blocked) {
      assert.equal(hasObjectionableContent(sample), true, sample);
    }
    assert.equal(hasObjectionableContent('n1gg3r'), true);
    assert.equal(hasObjectionableContent('n i g g e r'), true);
    assert.equal(hasObjectionableContent('cuuunt'), true);
    assert.equal(hasObjectionableContent('this prompt says cock once'), true);

    const clean = ['cocktail', 'cocky', 'scunthorpe', 'spicy', 'spices', 'assassin', 'niger', 'class', 'passenger', 'classic'];
    for (const sample of clean) {
      assert.equal(hasObjectionableContent(sample), false, sample);
    }
    assert.equal(hasObjectionableContent('s c u n t h o r p e'), false);
    assert.equal(hasObjectionableContent('grape'), false);
  });

  it('throws a generic code and does not include the matched word', () => {
    const word = 'n1gg3r';
    assert.throws(
      () => assertNoObjectionableContent('hello', word),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 400);
        assert.equal(error.message, OBJECTIONABLE_CONTENT_CODE);
        assert.equal(error.message.toLowerCase().includes('nigg'), false);
        assert.equal(error.message.includes(word), false);
        return true;
      }
    );
    assert.doesNotThrow(() => assertNoObjectionableContent('Niger', 'spicy cocktail', undefined, null));
  });
});

describe('PATCH /api/songs/[id] title', () => {
  function patch(title: string) {
    return new NextRequest('https://streamstar.xyz/api/songs/song-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }

  it('returns objectionable_content for a blocked title and does not echo the word', async () => {
    const response = await PATCH(patch('c o c k'), { params: { id: 'song-1' } });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body, { error: 'objectionable_content' });
  });

  it('does not block an allowlisted title before auth', async () => {
    const response = await PATCH(patch('Niger'), { params: { id: 'song-1' } });
    assert.equal(response.status, 401);
  });
});
