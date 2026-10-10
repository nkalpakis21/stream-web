import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { Keypair } from '@solana/web3.js';
import type { Firestore } from 'firebase-admin/firestore';
import { GET } from '../app/api/cron/verify-mints/route';
import { handlePumpFunCreateTx } from '../lib/server/coinMints';
import { handlePumpFunConfirm } from '../lib/server/confirmArtistPumpFun';
import { markLegacyMints } from '../lib/server/markLegacyMints';
import { collectDryRunMintRows, isMintSweepAuthorized, runMintSweep } from '../lib/server/mintSweep';
import { pumpFunCoinUrl } from '../lib/solana/pumpFun';
import type { PumpFunCoin } from '../types/firestore';
import {
  inspectArtistMint,
  interpretBondingCurve,
  verifyArtistMint,
  type CreatorLookup,
} from '../lib/server/verifyArtistMint';
import { PumpFunCreateTxBuildError } from '../lib/solana/buildArtistPumpFunCreateTx';

const OWNER = Keypair.generate().publicKey.toBase58();
const OTHER = Keypair.generate().publicKey.toBase58();
const MINT = Keypair.generate().publicKey.toBase58();
const LEGACY_MINT = Keypair.generate().publicKey.toBase58();
const YOUNG_MINT = Keypair.generate().publicKey.toBase58();

const NOW = 1_800_000_000_000;
const ELIGIBLE_AT = NOW - 11 * 60 * 1000;

type Stored = Record<string, unknown>;

function isDeleteSentinel(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { methodName?: string }).methodName === 'FieldValue.delete'
  );
}

function applyUpdate(target: Stored, data: Stored) {
  for (const [key, value] of Object.entries(data)) {
    if (!key.includes('.')) {
      if (isDeleteSentinel(value)) delete target[key];
      else target[key] = value;
      continue;
    }
    const parts = key.split('.');
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const existing = cursor[part];
      const next =
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? { ...(existing as Stored) }
          : {};
      cursor[part] = next;
      cursor = next;
    }
    const leaf = parts[parts.length - 1];
    if (isDeleteSentinel(value)) delete cursor[leaf];
    else cursor[leaf] = value;
  }
}

function fieldAt(data: Stored, field: string): unknown {
  if (!field.includes('.')) return data[field];
  let cursor: unknown = data;
  for (const part of field.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Stored)[part];
  }
  return cursor;
}

function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as { toMillis?: () => number };
  if (typeof record.toMillis === 'function') {
    const ms = record.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function createDb(options?: { writesThrow?: boolean }) {
  const docs = new Map<string, Stored>();

  function refuseWrite() {
    if (options?.writesThrow) throw new Error('dry-run tried to write');
  }

  function docRef(path: string) {
    const id = path.split('/').pop() ?? '';
    return {
      id,
      path,
      async get() {
        const data = docs.get(path);
        return {
          exists: data != null,
          id,
          data: () => (data ? { ...data } : undefined),
        };
      },
      update(data: Stored) {
        refuseWrite();
        const current = docs.get(path);
        if (!current) throw new Error(`missing ${path}`);
        applyUpdate(current, data);
      },
      async set(data: Stored) {
        refuseWrite();
        docs.set(path, { ...data });
      },
      async delete() {
        refuseWrite();
        docs.delete(path);
      },
      collection(sub: string) {
        return collection(`${path}/${sub}`);
      },
    };
  }

  function collection(path: string) {
    const filters: Array<{ field: string; op: string; value: unknown }> = [];
    let limitN: number | null = null;
    let orderById = false;
    let after: { createdAtMs: number; id: string; idOnly?: boolean } | null = null;
    const api = {
      doc(id: string) {
        return docRef(`${path}/${id}`);
      },
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
        return api;
      },
      orderBy(field?: unknown) {
        if (field && typeof field !== 'string') orderById = true;
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      startAfter(timestamp: unknown, id?: string) {
        if (typeof timestamp === 'string' && id === undefined) {
          after = { createdAtMs: 0, id: timestamp, idOnly: true };
          return api;
        }
        const createdAtMs = timestampMillis(timestamp);
        if (createdAtMs != null && typeof id === 'string') {
          after = { createdAtMs, id };
        }
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
          }));
        for (const filter of filters) {
          rows = rows.filter(row => {
            const actual = fieldAt(row.data, filter.field);
            if (filter.op === '==') {
              if (filter.value === null) return actual === null;
              return actual === filter.value;
            }
            const left = timestampMillis(actual);
            const right = timestampMillis(filter.value);
            if (left == null || right == null) return false;
            if (filter.op === '>=') return left >= right;
            if (filter.op === '>') return left > right;
            if (filter.op === '<') return left < right;
            return false;
          });
        }
        rows.sort((a, b) => {
          if (!orderById) {
            const left = timestampMillis(a.data.createdAt) ?? 0;
            const right = timestampMillis(b.data.createdAt) ?? 0;
            if (left !== right) return left - right;
          }
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        if (after) {
          const cursor = after;
          rows = rows.filter(row => {
            if (cursor.idOnly) return row.id > cursor.id;
            const ms = timestampMillis(row.data.createdAt) ?? 0;
            if (ms > cursor.createdAtMs) return true;
            if (ms < cursor.createdAtMs) return false;
            return row.id > cursor.id;
          });
        }
        if (limitN != null) rows = rows.slice(0, limitN);
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
  }

  const db = {
    collection,
    async runTransaction<T>(fn: (tx: {
      get: (ref: { get: () => Promise<{ exists: boolean; data: () => Stored | undefined }> }) => Promise<{ exists: boolean; data: () => Stored | undefined }>;
      update: (ref: { update: (data: Stored) => void }, data: Stored) => void;
      set: (ref: { set: (data: Stored) => unknown }, data: Stored) => void;
    }) => Promise<T>): Promise<T> {
      return fn({
        get: ref => ref.get(),
        update(ref, data) {
          ref.update(data);
        },
        set(ref, data) {
          ref.set(data);
        },
      });
    },
  };

  return { db: db as unknown as Firestore, docs };
}

function coin(mint: string, creator = OWNER) {
  return {
    mint,
    url: `https://pump.fun/coin/${mint}`,
    symbol: 'TEST',
    launchedAt: null,
    creatorWallet: creator,
  };
}

function seedArtist(
  docs: Map<string, Stored>,
  id: string,
  createdAt: number,
  mint: string | null,
  ownerId = 'user-1'
) {
  docs.set(`artists/${id}`, {
    id,
    ownerId,
    name: id,
    deletedAt: null,
    createdAt,
    pumpFun: mint
      ? coin(mint)
      : { mint: null, url: null, symbol: null, launchedAt: null, creatorWallet: null },
  });
}

function bindMint(docs: Map<string, Stored>, mint: string, uid: string, creator = OWNER) {
  docs.set(`coinMints/${mint}`, { uid, creatorWallet: creator });
}

function pumpOf(docs: Map<string, Stored>, id: string) {
  return (docs.get(`artists/${id}`) as Stored).pumpFun as Stored;
}

function captureClears() {
  const entries: Array<{ event: string; payload: Stored }> = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].startsWith('coin_cleared_') || args[0] === 'coin_saved_unbound')
    ) {
      entries.push({ event: args[0], payload: args[1] as Stored });
    }
  };
  return {
    entries,
    restore() {
      console.info = original;
    },
  };
}

function emptyPump() {
  return { mint: null, url: null, symbol: null, launchedAt: null, creatorWallet: null };
}

function confirmRequest(mint = MINT) {
  return new NextRequest('http://localhost/api/artists/artist-1/pump-fun', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mint,
      url: pumpFunCoinUrl(mint),
      symbol: 'test',
      creatorWallet: OWNER,
    }),
  });
}

function persistPump(db: Firestore) {
  return async (input: {
    artistId: string;
    mint: string;
    url: string;
    symbol: string;
    creatorWallet: string;
  }) => {
    const pumpFun = {
      mint: input.mint,
      url: input.url,
      symbol: input.symbol,
      launchedAt: null,
      creatorWallet: input.creatorWallet,
    };
    db.collection('artists').doc(input.artistId).update({ pumpFun });
    return {
      pumpFun: pumpFun as PumpFunCoin,
      coinMetadataId: null,
      coinImagePath: null,
      noop: false,
    };
  };
}

function createTxRequest() {
  return new NextRequest('http://localhost/api/artists/pump-fun/create-tx', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mint: MINT,
      user: OWNER,
      name: 'Nova',
      symbol: 'NOVA',
      uri: 'https://example.com/meta.json',
    }),
  });
}

function fakeBuiltTx() {
  return {
    serialize: () => Uint8Array.from([1, 2, 3]),
  } as never;
}

describe('verifyArtistMint', () => {
  it('sets pumpFun.verifiedAt when the binding uid and on-chain creator match', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    bindMint(docs, MINT, 'user-1', OWNER);

    const result = await verifyArtistMint('artist-1', {
      db,
      lookupCreator: async () => ({ status: 'ok', creator: OWNER }),
    });

    assert.deepEqual(result, { result: 'matched', creatorWallet: OWNER });
    assert.ok(pumpOf(docs, 'artist-1').verifiedAt);
    assert.equal(pumpOf(docs, 'artist-1').mint, MINT);
  });

  it('clears pumpFun and logs coin_cleared_mismatch when the mint is bound to another uid', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    bindMint(docs, MINT, 'someone-else', OTHER);
    const logs = captureClears();
    let lookedUp = false;

    try {
      const result = await verifyArtistMint('artist-1', {
        db,
        lookupCreator: async () => {
          lookedUp = true;
          return { status: 'ok', creator: OTHER };
        },
      });
      assert.deepEqual(result, { result: 'cleared', reason: 'mismatch' });
    } finally {
      logs.restore();
    }

    assert.equal(lookedUp, false);
    assert.deepEqual(pumpOf(docs, 'artist-1'), emptyPump());
    assert.deepEqual(logs.entries, [
      { event: 'coin_cleared_mismatch', payload: { artistId: 'artist-1', mint: MINT } },
    ]);
  });

  it('clears pumpFun when the on-chain creator differs from coinMints.creatorWallet', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    bindMint(docs, MINT, 'user-1', OWNER);
    const logs = captureClears();

    try {
      const result = await verifyArtistMint('artist-1', {
        db,
        lookupCreator: async () => ({ status: 'ok', creator: OTHER }),
      });
      assert.deepEqual(result, { result: 'cleared', reason: 'mismatch' });
    } finally {
      logs.restore();
    }

    assert.deepEqual(pumpOf(docs, 'artist-1'), emptyPump());
    assert.deepEqual(logs.entries, [
      { event: 'coin_cleared_mismatch', payload: { artistId: 'artist-1', mint: MINT } },
    ]);
  });

  it('leaves the coin in place when the RPC lookup times out', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    bindMint(docs, MINT, 'user-1', OWNER);
    const logs = captureClears();
    let release: (value: CreatorLookup) => void = () => {};
    const hung = new Promise<CreatorLookup>(resolve => {
      release = resolve;
    });

    try {
      const result = await verifyArtistMint('artist-1', {
        db,
        timeoutMs: 20,
        lookupCreator: () => hung,
      });
      assert.deepEqual(result, { result: 'unchanged', reason: 'rpc' });
    } finally {
      release({ status: 'ok', creator: OWNER });
      logs.restore();
      await new Promise(resolve => setTimeout(resolve, 15));
    }

    const pump = pumpOf(docs, 'artist-1');
    assert.equal(pump.mint, MINT);
    assert.equal(pump.verifiedAt, undefined);
    assert.deepEqual(logs.entries, []);
  });

  it('overwrites creatorWallet with the binding wallet when it verifies', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    (docs.get('artists/artist-1') as Stored).pumpFun = {
      ...(pumpOf(docs, 'artist-1')),
      creatorWallet: OTHER,
    };
    bindMint(docs, MINT, 'user-1', OWNER);

    const result = await verifyArtistMint('artist-1', {
      db,
      lookupCreator: async () => ({ status: 'ok', creator: OWNER }),
    });

    assert.deepEqual(result, { result: 'matched', creatorWallet: OWNER });
    assert.equal(pumpOf(docs, 'artist-1').creatorWallet, OWNER);
  });

  it('deletes coin metadata and mintFirstSeenAt when it clears', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    const artist = docs.get('artists/artist-1') as Stored;
    artist.coinMetadataId = 'meta-1';
    artist.coinImagePath = 'c/meta-1.png';
    artist.mintFirstSeenAt = NOW;
    bindMint(docs, MINT, 'someone-else', OTHER);

    const result = await verifyArtistMint('artist-1', { db });

    assert.deepEqual(result, { result: 'cleared', reason: 'mismatch' });
    assert.equal(artist.coinMetadataId, undefined);
    assert.equal(artist.coinImagePath, undefined);
    assert.equal(artist.mintFirstSeenAt, undefined);
    assert.deepEqual(pumpOf(docs, 'artist-1'), emptyPump());
  });

  it('verifies a graduated curve when the creator matches', async () => {
    const lookup = interpretBondingCurve({ data: Buffer.from([1]) }, () => ({
      creator: { toBase58: () => OWNER },
      complete: true,
    }));
    assert.deepEqual(lookup, { status: 'ok', creator: OWNER });
    assert.deepEqual(interpretBondingCurve(null, () => null), { status: 'missing' });
    assert.deepEqual(
      interpretBondingCurve({ data: Buffer.from([1]) }, () => {
        throw new Error('decode failed');
      }),
      { status: 'missing' }
    );

    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, MINT);
    bindMint(docs, MINT, 'user-1', OWNER);
    const result = await verifyArtistMint('artist-1', {
      db,
      lookupCreator: async () => lookup,
    });
    assert.deepEqual(result, { result: 'matched', creatorWallet: OWNER });
    assert.ok(pumpOf(docs, 'artist-1').verifiedAt);
  });
});

describe('mint sweep cron', () => {
  it('does not let a backdated createdAt escape the sweep', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'backdated', 1, MINT);
    (docs.get('artists/backdated') as Stored).mintFirstSeenAt = NOW - 31 * 60 * 1000;
    seedArtist(docs, 'future', NOW + 10 * 365 * 24 * 60 * 60 * 1000, LEGACY_MINT);
    (docs.get('artists/future') as Stored).mintFirstSeenAt = NOW - 31 * 60 * 1000;
    const logs = captureClears();

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => ({ status: 'ok', creator: OWNER }),
      });
      assert.equal(summary.checked, 2);
      assert.equal(summary.cleared, 2);
    } finally {
      logs.restore();
    }

    assert.deepEqual(pumpOf(docs, 'backdated'), emptyPump());
    assert.deepEqual(pumpOf(docs, 'future'), emptyPump());
    assert.deepEqual(
      logs.entries.map(entry => entry.payload.artistId),
      ['backdated', 'future']
    );
  });

  it('skips an artist stamped mintSweepExemptAt', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'legacy', 1, LEGACY_MINT);
    const legacy = docs.get('artists/legacy') as Stored;
    legacy.mintSweepExemptAt = 1;
    legacy.mintFirstSeenAt = NOW - 31 * 60 * 1000;
    const logs = captureClears();
    let lookedUp = false;

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => {
          lookedUp = true;
          return { status: 'ok', creator: OWNER };
        },
      });
      assert.equal(summary.checked, 0);
      assert.equal(summary.cleared, 0);
      assert.equal(summary.stamped, 0);
    } finally {
      logs.restore();
    }

    assert.equal(lookedUp, false);
    assert.equal(pumpOf(docs, 'legacy').mint, LEGACY_MINT);
    assert.deepEqual(logs.entries, []);
  });

  it('stamps mintFirstSeenAt on first sight and does not clear', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'fresh', 1, MINT);
    const logs = captureClears();
    let lookedUp = false;

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => {
          lookedUp = true;
          return { status: 'ok', creator: OWNER };
        },
      });
      assert.equal(summary.stamped, 1);
      assert.equal(summary.cleared, 0);
      assert.equal(summary.checked, 1);
    } finally {
      logs.restore();
    }

    assert.equal(lookedUp, false);
    assert.equal(pumpOf(docs, 'fresh').mint, MINT);
    assert.equal(pumpOf(docs, 'fresh').verifiedAt, undefined);
    assert.ok((docs.get('artists/fresh') as Stored).mintFirstSeenAt);
    assert.deepEqual(logs.entries, []);
  });

  it('clears a missing binding once mintFirstSeenAt is more than 30 minutes old', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'stale', NOW, MINT);
    (docs.get('artists/stale') as Stored).mintFirstSeenAt = NOW - 31 * 60 * 1000;
    const logs = captureClears();

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => ({ status: 'ok', creator: OWNER }),
      });
      assert.equal(summary.checked, 1);
      assert.equal(summary.cleared, 1);
      assert.equal(summary.stamped, 0);
      assert.equal(summary.unbound, 0);
    } finally {
      logs.restore();
    }

    assert.deepEqual(pumpOf(docs, 'stale'), emptyPump());
    assert.deepEqual(logs.entries, [
      { event: 'coin_cleared_unbound', payload: { artistId: 'stale', mint: MINT } },
    ]);
  });

  it('clears an on-chain mismatch without waiting 30 minutes', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'wrong', 1, MINT);
    (docs.get('artists/wrong') as Stored).mintFirstSeenAt = NOW - 60 * 1000;
    bindMint(docs, MINT, 'user-1', OWNER);
    const logs = captureClears();

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => ({ status: 'ok', creator: OTHER }),
      });
      assert.equal(summary.cleared, 1);
      assert.equal(summary.stamped, 0);
    } finally {
      logs.restore();
    }

    assert.deepEqual(pumpOf(docs, 'wrong'), emptyPump());
    assert.deepEqual(logs.entries, [
      { event: 'coin_cleared_mismatch', payload: { artistId: 'wrong', mint: MINT } },
    ]);
  });

  it('leaves a missing curve unchanged until mintFirstSeenAt is 30 minutes old', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'young', 1, MINT);
    (docs.get('artists/young') as Stored).mintFirstSeenAt = NOW - 60 * 1000;
    bindMint(docs, MINT, 'user-1', OWNER);
    const logs = captureClears();

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => ({ status: 'missing' }),
      });
      assert.equal(summary.cleared, 0);
      assert.equal(summary.unchanged, 1);
    } finally {
      logs.restore();
    }

    assert.equal(pumpOf(docs, 'young').mint, MINT);
    assert.equal(pumpOf(docs, 'young').verifiedAt, undefined);
    assert.deepEqual(logs.entries, []);
  });

  it('clears a missing curve once mintFirstSeenAt is more than 30 minutes old', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'stale-curve', 1, MINT);
    (docs.get('artists/stale-curve') as Stored).mintFirstSeenAt = NOW - 31 * 60 * 1000;
    bindMint(docs, MINT, 'user-1', OWNER);
    const logs = captureClears();

    try {
      const summary = await runMintSweep({
        db,
        nowMs: NOW,
        lookupCreator: async () => ({ status: 'missing' }),
      });
      assert.equal(summary.cleared, 1);
    } finally {
      logs.restore();
    }

    assert.deepEqual(pumpOf(docs, 'stale-curve'), emptyPump());
    assert.deepEqual(logs.entries, [
      { event: 'coin_cleared_mismatch', payload: { artistId: 'stale-curve', mint: MINT } },
    ]);
  });

  it('includes an artist with no deletedAt field and skips one where it is set', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'present', 1, MINT);
    delete (docs.get('artists/present') as Stored).deletedAt;
    seedArtist(docs, 'gone', 1, LEGACY_MINT);
    const gone = docs.get('artists/gone') as Stored;
    gone.deletedAt = NOW;
    gone.mintFirstSeenAt = NOW - 31 * 60 * 1000;

    const summary = await runMintSweep({
      db,
      nowMs: NOW,
      lookupCreator: async () => ({ status: 'ok', creator: OWNER }),
    });

    assert.equal(summary.stamped, 1);
    assert.equal(summary.cleared, 0);
    assert.equal(pumpOf(docs, 'present').mint, MINT);
    assert.ok((docs.get('artists/present') as Stored).mintFirstSeenAt);
    assert.equal(pumpOf(docs, 'gone').mint, LEGACY_MINT);
  });

  it('rejects cron requests that do not present CRON_SECRET', async () => {
    const previous = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      const missing = await GET(new NextRequest('http://localhost/api/cron/verify-mints'));
      assert.equal(missing.status, 401);

      process.env.CRON_SECRET = 'cron-secret';
      const wrong = await GET(
        new NextRequest('http://localhost/api/cron/verify-mints', {
          headers: { authorization: 'Bearer other' },
        })
      );
      assert.equal(wrong.status, 401);
      assert.equal(
        isMintSweepAuthorized(
          new NextRequest('http://localhost/api/cron/verify-mints', {
            headers: { authorization: 'Bearer cron-secret' },
          })
        ),
        true
      );
      assert.equal(
        isMintSweepAuthorized(
          new NextRequest('http://localhost/api/cron/verify-mints', {
            headers: { authorization: 'Bearer cron-secreX' },
          })
        ),
        false
      );
      assert.equal(
        isMintSweepAuthorized(
          new NextRequest('http://localhost/api/cron/verify-mints', {
            headers: { authorization: 'Bearer cron-secret-extra' },
          })
        ),
        false
      );
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});

describe('pump.fun confirm route', () => {
  it('sets pumpFun.verifiedAt when the confirmed mint is bound to the owner', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, null);
    bindMint(docs, MINT, 'user-1', OWNER);

    const response = await handlePumpFunConfirm(confirmRequest(), 'artist-1', {
      requireUserId: async () => 'user-1',
      persistArtistPumpFun: persistPump(db),
      verifyDeps: {
        db,
        lookupCreator: async () => ({ status: 'ok', creator: OWNER }),
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.verified, true);
    assert.equal(body.pumpFun.mint, MINT);
    assert.equal(pumpOf(docs, 'artist-1').mint, MINT);
    assert.ok(pumpOf(docs, 'artist-1').verifiedAt);
  });

  it('saves the coin without verifiedAt when the mint has no binding', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, null);
    const logs = captureClears();
    let lookedUp = false;

    try {
      const response = await handlePumpFunConfirm(confirmRequest(), 'artist-1', {
        requireUserId: async () => 'user-1',
        persistArtistPumpFun: persistPump(db),
        verifyDeps: {
          db,
          lookupCreator: async () => {
            lookedUp = true;
            return { status: 'ok', creator: OWNER };
          },
        },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.error, undefined);
      assert.equal(body.verified, false);
      assert.equal(body.cleared, undefined);
      assert.equal(body.pumpFun.mint, MINT);
      assert.equal(body.pumpFun.verifiedAt, undefined);
    } finally {
      logs.restore();
    }

    assert.equal(lookedUp, false);
    assert.equal(pumpOf(docs, 'artist-1').mint, MINT);
    assert.equal(pumpOf(docs, 'artist-1').verifiedAt, undefined);
    assert.deepEqual(logs.entries, [
      { event: 'coin_saved_unbound', payload: { artistId: 'artist-1', mint: MINT } },
    ]);
  });

  it('leaves a missing curve unverified on confirm', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, null);
    bindMint(docs, MINT, 'user-1', OWNER);

    const response = await handlePumpFunConfirm(confirmRequest(), 'artist-1', {
      requireUserId: async () => 'user-1',
      persistArtistPumpFun: persistPump(db),
      verifyDeps: {
        db,
        lookupCreator: async () => ({ status: 'missing' }),
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.verified, false);
    assert.equal(body.cleared, undefined);
    assert.equal(body.pumpFun.mint, MINT);
    assert.equal(pumpOf(docs, 'artist-1').verifiedAt, undefined);
    assert.equal(pumpOf(docs, 'artist-1').mint, MINT);
  });

  it('returns the binding creatorWallet when the coin verifies', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, null);
    bindMint(docs, MINT, 'user-1', OTHER);

    const response = await handlePumpFunConfirm(confirmRequest(), 'artist-1', {
      requireUserId: async () => 'user-1',
      persistArtistPumpFun: async input => {
        const saved = await persistPump(db)(input);
        const artist = docs.get('artists/artist-1') as Stored;
        artist.coinMetadataId = 'meta-1';
        artist.coinImagePath = 'c/meta-1.png';
        return {
          ...saved,
          coinMetadataId: 'meta-1',
          coinImagePath: 'c/meta-1.png',
        };
      },
      verifyDeps: {
        db,
        lookupCreator: async () => ({ status: 'ok', creator: OTHER }),
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.verified, true);
    assert.equal(body.pumpFun.creatorWallet, OTHER);
    assert.equal(pumpOf(docs, 'artist-1').creatorWallet, OTHER);
    assert.equal(body.coinMetadataId, 'meta-1');
  });

  it('does not return stale metadata when confirm clears the coin', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, null);
    bindMint(docs, MINT, 'someone-else', OTHER);

    const response = await handlePumpFunConfirm(confirmRequest(), 'artist-1', {
      requireUserId: async () => 'user-1',
      persistArtistPumpFun: async input => {
        const saved = await persistPump(db)(input);
        const artist = docs.get('artists/artist-1') as Stored;
        artist.coinMetadataId = 'meta-1';
        artist.coinImagePath = 'c/meta-1.png';
        artist.mintFirstSeenAt = NOW;
        return {
          ...saved,
          coinMetadataId: 'meta-1',
          coinImagePath: 'c/meta-1.png',
        };
      },
      verifyDeps: { db },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.verified, false);
    assert.equal(body.cleared, 'mismatch');
    assert.equal(body.pumpFun.mint, null);
    assert.equal(body.coinMetadataId, null);
    assert.equal(body.coinImagePath, null);
    const artist = docs.get('artists/artist-1') as Stored;
    assert.equal(artist.coinMetadataId, undefined);
    assert.equal(artist.coinImagePath, undefined);
    assert.equal(artist.mintFirstSeenAt, undefined);
  });

  it('rejects a mint that is already on another artist and does not write', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'artist-1', ELIGIBLE_AT, null);
    seedArtist(docs, 'artist-2', ELIGIBLE_AT, MINT);
    let persisted = 0;

    const response = await handlePumpFunConfirm(confirmRequest(), 'artist-1', {
      requireUserId: async () => 'user-1',
      persistArtistPumpFun: async input => {
        persisted += 1;
        return persistPump(db)(input);
      },
      verifyDeps: { db },
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'This mint is already on another artist.');
    assert.equal(persisted, 0);
    assert.equal(pumpOf(docs, 'artist-1').mint, null);
    assert.equal(pumpOf(docs, 'artist-2').mint, MINT);
  });
});

describe('create-tx mint binding', () => {
  it('returns 409 and no transaction when the mint is rebound to another uid', async () => {
    const { db, docs } = createDb();
    const built: string[] = [];
    const buildTx = async () => {
      built.push('tx');
      return fakeBuiltTx();
    };

    const first = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-1',
      db,
      buildTx,
      mintAccount: async () => 'absent',
    });
    assert.equal(first.status, 200);
    const created = await first.json();
    assert.equal(typeof created.transaction, 'string');
    assert.equal(created.transaction.length > 0, true);
    assert.equal((docs.get(`coinMints/${MINT}`) as Stored).uid, 'user-1');
    assert.equal((docs.get(`coinMints/${MINT}`) as Stored).creatorWallet, OWNER);

    const again = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-1',
      db,
      buildTx,
      mintAccount: async () => 'absent',
    });
    assert.equal(again.status, 200);

    const rebound = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-2',
      db,
      buildTx,
      mintAccount: async () => 'absent',
    });
    assert.equal(rebound.status, 409);
    const body = await rebound.json();
    assert.equal(body.transaction, undefined);
    assert.equal((docs.get(`coinMints/${MINT}`) as Stored).uid, 'user-1');
    assert.deepEqual(built, ['tx', 'tx', 'tx']);
  });

  it('rejects an existing mint and binds nothing', async () => {
    const { db, docs } = createDb();
    let built = 0;
    const response = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-1',
      db,
      mintAccount: async () => 'exists',
      buildTx: async () => {
        built += 1;
        return fakeBuiltTx();
      },
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.transaction, undefined);
    assert.equal(built, 0);
    assert.equal(docs.get(`coinMints/${MINT}`), undefined);
  });

  it('fails closed when the mint-account RPC errors', async () => {
    const { db, docs } = createDb();
    let built = 0;
    const response = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-1',
      db,
      mintAccount: async () => {
        throw new Error('rpc down');
      },
      buildTx: async () => {
        built += 1;
        return fakeBuiltTx();
      },
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.transaction, undefined);
    assert.equal(built, 0);
    assert.equal(docs.get(`coinMints/${MINT}`), undefined);
  });

  it('leaves no binding when simulation fails', async () => {
    const { db, docs } = createDb();
    const response = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-1',
      db,
      mintAccount: async () => 'absent',
      buildTx: async () => {
        throw new PumpFunCreateTxBuildError('Launch simulation failed', 400);
      },
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.transaction, undefined);
    assert.equal(docs.get(`coinMints/${MINT}`), undefined);
  });

  it('sends no transaction when the bind write fails', async () => {
    const built: string[] = [];
    const db = {
      collection() {
        return { doc() { return { path: `coinMints/${MINT}` }; } };
      },
      async runTransaction() {
        throw new Error('firestore unavailable');
      },
    } as unknown as Firestore;

    const response = await handlePumpFunCreateTx(createTxRequest(), {
      requireUser: async () => 'user-1',
      db,
      mintAccount: async () => 'absent',
      buildTx: async () => {
        built.push('tx');
        return fakeBuiltTx();
      },
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'Could not bind this mint.');
    assert.equal(body.transaction, undefined);
    assert.deepEqual(built, ['tx']);
  });
});

describe('dry-run mint check', () => {
  it('prints every coin and never writes', async () => {
    const { db, docs } = createDb({ writesThrow: true });
    seedArtist(docs, 'old-a', 1, MINT);
    seedArtist(docs, 'old-b', 1, OTHER);
    seedArtist(docs, 'old-c', 1, LEGACY_MINT);
    seedArtist(docs, 'later', NOW + 86_400_000, YOUNG_MINT);
    seedArtist(docs, 'empty', 1, null);
    bindMint(docs, MINT, 'user-1', OWNER);
    bindMint(docs, OTHER, 'someone-else', OTHER);

    const rows = await collectDryRunMintRows({
      db,
      pageSize: 1,
      lookupCreator: async mint => ({
        status: 'ok',
        creator: mint === MINT ? OWNER : OTHER,
      }),
    });

    assert.deepEqual(
      rows.map(row => row.artistId),
      ['later', 'old-a', 'old-b', 'old-c']
    );
    assert.deepEqual(rows.find(row => row.artistId === 'old-a'), {
      artistId: 'old-a',
      name: 'old-a',
      mint: MINT,
      boundUid: 'user-1',
      creatorWallet: OWNER,
      onchainCreator: OWNER,
      result: 'match',
    });
    assert.equal(rows.find(row => row.artistId === 'old-b')?.result, 'mismatch');
    assert.equal(rows.find(row => row.artistId === 'old-c')?.result, 'unbound');
    assert.equal(rows.find(row => row.artistId === 'later')?.result, 'unbound');
    assert.equal(pumpOf(docs, 'old-a').mint, MINT);
    assert.equal(pumpOf(docs, 'old-a').verifiedAt, undefined);
  });
});

describe('mark legacy mints', () => {
  it('dry-run lists minted artists and does not write', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'has-coin', 1, MINT);
    seedArtist(docs, 'no-coin', 1, null);

    const rows = await markLegacyMints({ db, dryRun: true, pageSize: 1 });
    assert.deepEqual(rows, [{ artistId: 'has-coin', name: 'has-coin', mint: MINT }]);
    assert.equal((docs.get('artists/has-coin') as Stored).mintSweepExemptAt, undefined);
  });

  it('stamps mintSweepExemptAt once and skips a second pass', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'has-coin', 1, MINT);
    seedArtist(docs, 'no-coin', 1, null);

    const stamped = await markLegacyMints({ db, pageSize: 1 });
    assert.deepEqual(stamped, [{ artistId: 'has-coin', name: 'has-coin', mint: MINT }]);
    const firstStamp = (docs.get('artists/has-coin') as Stored).mintSweepExemptAt;
    assert.ok(firstStamp);
    assert.equal((docs.get('artists/no-coin') as Stored).mintSweepExemptAt, undefined);

    const again = await markLegacyMints({ db, pageSize: 1 });
    assert.deepEqual(again, []);
    assert.equal((docs.get('artists/has-coin') as Stored).mintSweepExemptAt, firstStamp);
  });

  it('does not overwrite an existing mintSweepExemptAt', async () => {
    const { db, docs } = createDb();
    seedArtist(docs, 'already', 1, MINT);
    const existing = { seconds: 10 };
    (docs.get('artists/already') as Stored).mintSweepExemptAt = existing;

    const rows = await markLegacyMints({ db, pageSize: 1 });
    assert.deepEqual(rows, []);
    assert.equal((docs.get('artists/already') as Stored).mintSweepExemptAt, existing);
  });
});

