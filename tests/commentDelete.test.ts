import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { isLiveCommentData } from '../lib/comments/live';
import {
  commentTombstone,
  deleteAuthoredComments,
  deleteOneComment,
} from '../lib/server/commentDelete';

type Stored = Record<string, unknown>;

/**
 * Admin query plus BulkWriter. set/delete settle only inside flush().
 */
function createDb() {
  const docs = new Map<string, Stored>();

  function snapshot(path: string, id: string) {
    const data = docs.get(path);
    return {
      id,
      ref: { id, path },
      exists: docs.has(path),
      data: () => (data ? { ...data } : undefined),
      get(field: string) {
        return data ? data[field] : undefined;
      },
    };
  }

  function collection(path: string) {
    return {
      doc(id: string) {
        const docPath = `${path}/${id}`;
        return {
          id,
          path: docPath,
          async get() {
            return snapshot(docPath, id);
          },
        };
      },
      where(field: string, op: string, value: unknown) {
        let afterId: string | null = null;
        let max: number | null = null;
        const api = {
          limit(count: number) {
            max = count;
            return api;
          },
          startAfter(cursor?: { id?: string }) {
            afterId = typeof cursor?.id === 'string' ? cursor.id : null;
            return api;
          },
          async get() {
            let rows = [...docs.entries()]
              .filter(([docPath]) => {
                if (!docPath.startsWith(`${path}/`)) return false;
                return !docPath.slice(path.length + 1).includes('/');
              })
              .map(([docPath, data]) => ({
                id: docPath.split('/').pop() ?? '',
                path: docPath,
                data,
              }))
              .filter(row => {
                const stored = row.data[field];
                if (op === '==') return stored === value;
                if (op === 'in') return Array.isArray(value) && value.includes(stored);
                return false;
              })
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            if (afterId) {
              const cursorId = afterId;
              rows = rows.filter(row => row.id > cursorId);
            }
            if (max != null) rows = rows.slice(0, max);
            return {
              empty: rows.length === 0,
              size: rows.length,
              docs: rows.map(row => snapshot(row.path, row.id)),
            };
          },
        };
        return api;
      },
    };
  }

  const pending: Array<() => void> = [];
  let flushed = false;
  const writer = {
    set(ref: { path: string }, data: Stored) {
      return new Promise<void>((resolve, reject) => {
        pending.push(() => {
          if (!flushed) {
            reject(new Error(`awaited ${ref.path} before flush`));
            return;
          }
          docs.set(ref.path, { ...data });
          resolve();
        });
      });
    },
    delete(ref: { path: string }) {
      return new Promise<void>((resolve, reject) => {
        pending.push(() => {
          if (!flushed) {
            reject(new Error(`awaited ${ref.path} before flush`));
            return;
          }
          docs.delete(ref.path);
          resolve();
        });
      });
    },
    async flush() {
      flushed = true;
      const batch = pending.splice(0, pending.length);
      for (const settle of batch) settle();
      flushed = false;
    },
  };

  return {
    db: { collection } as unknown as Firestore,
    writer: writer as never,
    docs,
  };
}

const SECRET_KEYS = [
  'authorId',
  'content',
  'body',
  'authorName',
  'name',
  'avatar',
  'avatarURL',
  'photoURL',
  'updatedAt',
  'deletedAt',
];

function liveComment(id: string, extra: Stored = {}): Stored {
  return {
    id,
    targetType: 'song',
    targetId: 'song-1',
    authorId: 'user-1',
    content: 'hello',
    body: 'hello',
    authorName: 'Ada',
    name: 'Ada',
    avatar: 'https://cdn.example/ada.png',
    avatarURL: 'https://cdn.example/ada.png',
    photoURL: 'https://cdn.example/ada.png',
    parentCommentId: null,
    createdAt: { seconds: 10 },
    updatedAt: { seconds: 11 },
    deletedAt: null,
    ...extra,
  };
}

function assertTombstone(stored: Stored, parentCommentId: string | null) {
  assert.deepEqual(Object.keys(stored).sort(), [
    'createdAt',
    'deleted',
    'parentCommentId',
    'targetId',
    'targetType',
  ]);
  assert.equal(stored.deleted, true);
  assert.equal(stored.parentCommentId, parentCommentId);
  assert.equal(stored.targetType, 'song');
  assert.equal(stored.targetId, 'song-1');
  assert.deepEqual(stored.createdAt, { seconds: 10 });
  for (const key of SECRET_KEYS) {
    assert.equal(stored[key], undefined);
  }
}

describe('comment delete', () => {
  it('overwrites a comment that has replies with only the tombstone fields', async () => {
    const { db, writer, docs } = createDb();
    docs.set('comments/parent', liveComment('parent'));
    docs.set(
      'comments/reply',
      liveComment('reply', { authorId: 'user-2', parentCommentId: 'parent', content: 'still here' })
    );

    await deleteAuthoredComments(db, writer, 'user-1');

    assertTombstone(docs.get('comments/parent') as Stored, null);
    const reply = docs.get('comments/reply') as Stored;
    assert.equal(reply.authorId, 'user-2');
    assert.equal(reply.content, 'still here');
    const live = [...docs.values()].filter(row => isLiveCommentData(row));
    assert.equal(live.length, 1);
    assert.equal(live[0]?.authorId, 'user-2');
  });

  it('hard-deletes a comment that has no replies', async () => {
    const { db, writer, docs } = createDb();
    docs.set('comments/solo', liveComment('solo'));
    docs.set('comments/other', liveComment('other', { authorId: 'user-2', content: 'kept' }));

    await deleteAuthoredComments(db, writer, 'user-1');

    assert.equal(docs.has('comments/solo'), false);
    assert.equal((docs.get('comments/other') as Stored).content, 'kept');
    assert.equal([...docs.values()].filter(row => isLiveCommentData(row)).length, 1);
  });

  it('removes a parent once its only replies were the deleted user', async () => {
    const { db, writer, docs } = createDb();
    docs.set('comments/parent', liveComment('parent'));
    docs.set('comments/reply', liveComment('reply', { parentCommentId: 'parent' }));

    await deleteAuthoredComments(db, writer, 'user-1');

    assert.equal(docs.has('comments/parent'), false);
    assert.equal(docs.has('comments/reply'), false);
  });

  it('leaves a live parent when a childless reply is removed', async () => {
    const { db, writer, docs } = createDb();
    docs.set('comments/parent', liveComment('parent', { authorId: 'user-2', content: 'stays' }));
    docs.set('comments/reply', liveComment('reply', { parentCommentId: 'parent' }));

    await deleteAuthoredComments(db, writer, 'user-1');

    assert.equal(docs.has('comments/reply'), false);
    assert.equal((docs.get('comments/parent') as Stored).content, 'stays');
    assert.equal((docs.get('comments/parent') as Stored).deleted, undefined);
  });

  it('collapses an empty tombstone when its last reply is deleted', async () => {
    const { db, writer, docs } = createDb();
    docs.set('comments/parent', commentTombstone(liveComment('parent')) as unknown as Stored);
    docs.set('comments/reply', liveComment('reply', { parentCommentId: 'parent' }));

    await deleteAuthoredComments(db, writer, 'user-1');

    assert.equal(docs.has('comments/reply'), false);
    assert.equal(docs.has('comments/parent'), false);
  });

  it('is idempotent after the author fields are gone', async () => {
    const { db, writer, docs } = createDb();
    docs.set('comments/parent', liveComment('parent'));
    docs.set(
      'comments/reply',
      liveComment('reply', { authorId: 'user-2', parentCommentId: 'parent' })
    );

    await deleteAuthoredComments(db, writer, 'user-1');
    const tombstone = { ...(docs.get('comments/parent') as Stored) };
    await deleteAuthoredComments(db, writer, 'user-1');

    assert.deepEqual(docs.get('comments/parent'), tombstone);
    assert.equal(docs.has('comments/reply'), true);
  });

  it('deleteOneComment tombstones or removes and rejects another author', async () => {
    const withReplies = createDb();
    withReplies.docs.set('comments/parent', liveComment('parent'));
    withReplies.docs.set(
      'comments/reply',
      liveComment('reply', { authorId: 'user-2', parentCommentId: 'parent' })
    );
    const tombstoned = await deleteOneComment(
      withReplies.db,
      withReplies.writer,
      'parent',
      'user-1'
    );
    assert.equal(tombstoned.outcome, 'tombstone');
    assertTombstone(withReplies.docs.get('comments/parent') as Stored, null);

    const alone = createDb();
    alone.docs.set('comments/solo', liveComment('solo'));
    const removed = await deleteOneComment(alone.db, alone.writer, 'solo', 'user-1');
    assert.equal(removed.outcome, 'removed');
    assert.equal(alone.docs.has('comments/solo'), false);

    const denied = createDb();
    denied.docs.set('comments/solo', liveComment('solo'));
    const wrong = await deleteOneComment(denied.db, denied.writer, 'solo', 'user-2');
    assert.equal(wrong.authorMatches, false);
    assert.equal((denied.docs.get('comments/solo') as Stored).authorId, 'user-1');
    assert.equal((denied.docs.get('comments/solo') as Stored).content, 'hello');
  });
});
