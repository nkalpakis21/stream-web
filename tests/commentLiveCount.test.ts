import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countLiveComments } from '../lib/comments/live';

describe('live comment count', () => {
  it('counts a live reply and a live top-level comment, and skips the tombstone', () => {
    const comments = [
      { deleted: true, parentCommentId: null, targetId: 'song-1' },
      { parentCommentId: 'tombstone-parent', content: 'still here' },
      { parentCommentId: null, content: 'top level' },
    ];
    assert.equal(countLiveComments(comments), 2);
  });
});
