import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { tombstoneCoinMints } from '../lib/server/deleteAccount';

type Stored = Record<string, unknown>;

/**
 * Admin query plus BulkWriter, small enough for the tombstone step.
 * set() settles only inside flush(), so awaiting the ops first deadlocks.
 */
function createDb() {
  const docs = new Map<string, Stored>();
  let setCalls = 0;

  function collection(path: string) {
    return {
      doc(id: string) {
        return { id, path: `${path}/${id}` };
      },
      where(field: string, op: string, value: unknown) {
        let afterId: string | null = null;
        const api = {
          limit() {
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
                if (op !== '==') return false;
                return row.data[field] === value;
              })
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            if (afterId) {
              const cursorId = afterId;
              rows = rows.filter(row => row.id > cursorId);
            }
            return {
              empty: rows.length === 0,
              size: rows.length,
              docs: rows.map(row => ({
                id: row.id,
                data: () => ({ ...(docs.get(row.path) as Stored) }),
              })),
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
    set(
      ref: { path: string },
      data: Stored,
      options?: { merge?: boolean }
    ) {
      return new Promise<void>((resolve, reject) => {
        pending.push(() => {
          if (!flushed) {
            reject(new Error(`awaited ${ref.path} before flush`));
            return;
          }
          const current = docs.get(ref.path) ?? {};
          docs.set(ref.path, options?.merge ? { ...current, ...data } : { ...data });
          setCalls += 1;
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
    setCalls: () => setCalls,
  };
}

describe('account delete coinMints', () => {
  it('tombstones every binding for that uid and leaves other uids alone', async () => {
    const { db, writer, docs, setCalls } = createDb();
    docs.set('coinMints/mint-a', {
      uid: 'user-1',
      creatorWallet: 'wallet-a',
      createdAt: 1,
    });
    docs.set('coinMints/mint-b', {
      uid: 'user-1',
      creatorWallet: 'wallet-b',
      createdAt: 2,
    });
    docs.set('coinMints/mint-c', {
      uid: 'user-2',
      creatorWallet: 'wallet-c',
      createdAt: 3,
    });

    await tombstoneCoinMints(db, writer, 'user-1');

    for (const id of ['mint-a', 'mint-b']) {
      const stored = docs.get(`coinMints/${id}`) as Stored;
      assert.equal(stored.uid, undefined);
      assert.equal(stored.creatorWallet, undefined);
      assert.equal(stored.createdAt, undefined);
      assert.ok(stored.deletedAt instanceof FieldValue);
      assert.deepEqual(Object.keys(stored), ['deletedAt']);
    }
    assert.deepEqual(docs.get('coinMints/mint-c'), {
      uid: 'user-2',
      creatorWallet: 'wallet-c',
      createdAt: 3,
    });
    assert.equal(setCalls(), 2);
  });

  it('re-running delete is safe', { timeout: 1000 }, async () => {
    const { db, writer, docs, setCalls } = createDb();
    docs.set('coinMints/mint-a', {
      uid: 'user-1',
      creatorWallet: 'wallet-a',
      createdAt: 1,
    });

    await tombstoneCoinMints(db, writer, 'user-1');
    const tombstone = docs.get('coinMints/mint-a');
    assert.equal(setCalls(), 1);

    await tombstoneCoinMints(db, writer, 'user-1');

    assert.equal(docs.get('coinMints/mint-a'), tombstone);
    assert.equal((tombstone as Stored).uid, undefined);
    assert.ok((tombstone as Stored).deletedAt instanceof FieldValue);
    assert.equal(setCalls(), 1);
  });
});
