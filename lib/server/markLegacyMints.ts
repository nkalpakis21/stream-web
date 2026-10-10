/**
 * Exempt coins that already have pumpFun.mint. Stamps root
 * `mintSweepExemptAt` with a server timestamp when that field is absent.
 * A second run does not overwrite an existing stamp. Does not read createdAt.
 */

import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { mintFromPump } from '@/lib/server/verifyArtistMint';

export type LegacyMintRow = {
  artistId: string;
  name: string;
  mint: string;
};

export async function markLegacyMints(deps: {
  db?: Firestore;
  dryRun?: boolean;
  pageSize?: number;
}): Promise<LegacyMintRow[]> {
  const db = deps.db ?? getAdminDb();
  const dryRun = deps.dryRun === true;
  const pageSize = deps.pageSize ?? 200;
  const rows: LegacyMintRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    let query = db.collection(COLLECTIONS.artists).orderBy(FieldPath.documentId(), 'asc');
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(pageSize).get();
    if (snap.empty || snap.docs.length === 0) break;

    for (const doc of snap.docs) {
      cursor = doc.id;
      const data = doc.data() as
        | { name?: unknown; pumpFun?: unknown; mintSweepExemptAt?: unknown }
        | undefined;
      const mint = mintFromPump(data?.pumpFun);
      if (!mint || data?.mintSweepExemptAt != null) continue;
      const name = typeof data?.name === 'string' ? data.name : '';
      if (dryRun) {
        rows.push({ artistId: doc.id, name, mint });
        continue;
      }
      const stamped = await stampExemptIfAbsent(db, doc.id);
      if (stamped) rows.push({ artistId: doc.id, name, mint });
    }

    if (snap.docs.length < pageSize) break;
  }

  return rows;
}

/** Write the stamp only when it is still absent. Never replaces one. */
async function stampExemptIfAbsent(db: Firestore, artistId: string): Promise<boolean> {
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as { pumpFun?: unknown; mintSweepExemptAt?: unknown } | undefined;
    if (!mintFromPump(data?.pumpFun) || data?.mintSweepExemptAt != null) return false;
    tx.update(ref, {
      mintSweepExemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}
