import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { adminListComments } from '../lib/server/commentsAdmin';

/**
 * Develop loaded comments with one client getDocs.
 * #106 added a composite Admin query (and a fallback scan) plus a second
 * GET /api/comments?count=1. The list now uses one targetId read for both
 * the page and the live count.
 */
function commentDb() {
  let gets = 0;
  const rows = [
    {
      id: 'tomb',
      data: {
        targetType: 'song',
        targetId: 'song-1',
        parentCommentId: null,
        deleted: true,
        createdAt: Timestamp.fromMillis(1),
      },
    },
    {
      id: 'reply',
      data: {
        targetType: 'song',
        targetId: 'song-1',
        parentCommentId: 'tomb',
        authorId: 'bob',
        content: 'still here',
        deleted: false,
        createdAt: Timestamp.fromMillis(2),
      },
    },
    {
      id: 'top',
      data: {
        targetType: 'song',
        targetId: 'song-1',
        parentCommentId: null,
        authorId: 'cara',
        content: 'hello',
        deleted: false,
        createdAt: Timestamp.fromMillis(3),
      },
    },
    {
      id: 'other',
      data: {
        targetType: 'artist',
        targetId: 'song-1',
        parentCommentId: null,
        content: 'wrong target',
        createdAt: Timestamp.fromMillis(4),
      },
    },
  ];
  const db = {
    collection() {
      return {
        where(field: string, _op: string, value: unknown) {
          return {
            async get() {
              gets += 1;
              return {
                docs: rows
                  .filter(row => row.data[field as 'targetId'] === value)
                  .map(row => ({
                    id: row.id,
                    data: () => row.data,
                  })),
              };
            },
          };
        },
      };
    },
  };
  return {
    db,
    reads: () => gets,
  };
}

describe('comment list query count', () => {
  after(() => {
    setAdminDbForTests(null);
  });

  it('reads Firestore once and counts the live reply plus the live top-level comment', async () => {
    const fake = commentDb();
    setAdminDbForTests(fake.db);
    const page = await adminListComments('song', 'song-1', 20, null);
    assert.equal(fake.reads(), 1);
    assert.equal(page.liveCount, 2);
    assert.deepEqual(
      page.comments.map(comment => comment.id),
      ['top', 'tomb']
    );
  });
});
