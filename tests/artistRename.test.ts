import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { adminUpdateArtistName } from '../lib/server/artistsAdmin';

type Doc = Record<string, unknown>;

function createFakeDb() {
  const docs = new Map<string, Doc>();
  let seq = 0;

  function collection(name: string) {
    return {
      doc(id?: string) {
        const docId = id ?? `gen${++seq}`;
        const path = `${name}/${docId}`;
        return {
          id: docId,
          async get() {
            const data = docs.get(path);
            return {
              exists: data != null,
              id: docId,
              data: () => (data ? { ...data } : undefined),
            };
          },
          async set(data: Doc, options?: { merge?: boolean }) {
            if (options?.merge && docs.has(path)) {
              docs.set(path, { ...docs.get(path), ...data });
            } else {
              docs.set(path, { ...data });
            }
          },
        };
      },
      where(field: string, _op: string, value: unknown) {
        const query = {
          limit() {
            return query;
          },
          async get() {
            const found = [...docs.entries()]
              .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
              .map(([path, data]) => ({
                id: path.split('/')[1],
                data: () => data,
              }));
            return { docs: found, empty: found.length === 0, size: found.length };
          },
        };
        return query;
      },
    };
  }

  return { db: { collection } as unknown as Firestore, docs };
}

function seedArtist(
  docs: Map<string, Doc>,
  id: string,
  ownerId: string,
  name: string
) {
  docs.set(`artistVersions/${id}-v1`, {
    id: `${id}-v1`,
    artistId: id,
    versionNumber: 1,
    name,
    avatarURL: null,
    styleDNA: { genres: [], moods: [], tempoRange: { min: 60, max: 120 }, influences: [] },
    lore: 'bio',
    vocalIdentity: null,
    createdBy: ownerId,
    parentVersionId: null,
  });
  docs.set(`artists/${id}`, {
    id,
    ownerId,
    name,
    nameLowercase: name.toLowerCase(),
    avatarURL: null,
    lore: 'bio',
    deletedAt: null,
    currentVersionId: `${id}-v1`,
  });
}

describe('admin artist rename', () => {
  it('updates name and nameLowercase for the owner when the name is free', async () => {
    const { db, docs } = createFakeDb();
    seedArtist(docs, 'artist1', 'alice', 'Nova');

    const updated = await adminUpdateArtistName('artist1', 'alice', 'Nova Two', db);

    assert.equal(updated.name, 'Nova Two');
    assert.equal(updated.nameLowercase, 'nova two');
    assert.equal(docs.get('artists/artist1')?.nameLowercase, 'nova two');
    assert.notEqual(docs.get('artists/artist1')?.currentVersionId, 'artist1-v1');
  });

  it('rejects a caller who does not own the artist', async () => {
    const { db, docs } = createFakeDb();
    seedArtist(docs, 'artist1', 'alice', 'Nova');

    await assert.rejects(
      () => adminUpdateArtistName('artist1', 'bob', 'Other', db),
      /Only the owner can update the artist name/
    );
    assert.equal(docs.get('artists/artist1')?.name, 'Nova');
  });

  it('rejects a name another artist already uses', async () => {
    const { db, docs } = createFakeDb();
    seedArtist(docs, 'artist1', 'alice', 'Nova');
    seedArtist(docs, 'artist2', 'bob', 'Taken');

    await assert.rejects(
      () => adminUpdateArtistName('artist1', 'alice', 'Taken', db),
      /already taken/
    );
    assert.equal(docs.get('artists/artist1')?.name, 'Nova');
  });

  it('allows the owner to keep their own current name', async () => {
    const { db, docs } = createFakeDb();
    seedArtist(docs, 'artist1', 'alice', 'Nova');

    const updated = await adminUpdateArtistName('artist1', 'alice', 'Nova', db);
    assert.equal(updated.name, 'Nova');
    assert.equal(updated.nameLowercase, 'nova');
  });
});
