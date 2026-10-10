import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentAuthor } from '../components/comments/CommentAuthor';
import { commentAuthorInitial, commentAuthorName, commentClientPayload } from '../lib/comments/author';

const UID = 'abcd1234WXYZlistener';

describe('comment authors', () => {
  it('renders Listener with an L disc and never a uid fallback', () => {
    const missing = renderToStaticMarkup(
      createElement(CommentAuthor, { displayName: null, loading: false })
    );
    assert.match(missing, /Listener/);
    assert.match(missing, /artist-index-face-initials/);
    assert.match(missing, />L</);
    assert.equal(missing.includes('User '), false);
    assert.equal(missing.includes(UID), false);

    const fallback = `User ${UID.slice(0, 8)}...`;
    const fromUid = renderToStaticMarkup(
      createElement(CommentAuthor, { displayName: fallback, loading: false })
    );
    assert.match(fromUid, /Listener/);
    assert.match(fromUid, />L</);
    assert.equal(fromUid.includes(UID.slice(0, 8)), false);
    assert.equal(fromUid.includes('User '), false);
    assert.equal(commentAuthorName(fallback), 'Listener');
    assert.equal(commentAuthorInitial(''), 'L');
    assert.equal(commentAuthorName('Ada Lovelace'), 'Ada Lovelace');
    assert.equal(commentAuthorInitial('Ada Lovelace'), 'AL');
  });

  it('does not send a uid-derived fallback name from the comments API', () => {
    const fallback = `User ${UID.slice(0, 8)}...`;
    const payload = commentClientPayload({
      id: 'c1',
      targetType: 'song',
      targetId: 'song-1',
      authorId: UID,
      content: 'hello',
      parentCommentId: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deleted: false,
      authorName: fallback,
      displayName: fallback,
      name: UID,
      avatarURL: 'https://cdn.example/secret.jpg',
    });
    const json = JSON.stringify(payload);
    assert.equal(json.includes(fallback), false);
    assert.equal(json.includes('authorName'), false);
    assert.equal(json.includes('displayName'), false);
    assert.equal(json.includes('avatarURL'), false);
    assert.equal('name' in payload, false);
    assert.equal(payload.authorId, UID);
    assert.equal(payload.content, 'hello');
  });
});
