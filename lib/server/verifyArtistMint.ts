/**
 * Prove an artist pump.fun coin was bound to its owner at create-tx time.
 *
 * `coinMints/{mint}` is written by create-tx before the unsigned transaction
 * is returned. A match requires that doc's uid to equal `artist.ownerId`,
 * and the on-chain creator to equal `coinMints.creatorWallet`.
 *
 * Creator source: the pump.fun bonding-curve `creator` field.
 *
 * `createV2Instruction` writes the launching wallet onto that account (the
 * `creator` argument). That pubkey receives creator fees, and it is the
 * wallet create-tx stores as `creatorWallet`. Metaplex update authority on
 * pump.fun mints is a program authority, not the launching wallet, so
 * comparing it would reject real coins. Metaplex `creators[0]` is what the
 * protocol copies onto older curves. For create_v2 the bonding-curve field
 * is already that wallet, including after graduation (`complete` stays on
 * the same account).
 *
 * A missing bonding-curve account or a decode failure is treated like an RPC
 * error: confirm leaves the coin unverified. The cron counts that as a
 * mismatch only once mintFirstSeenAt is more than 30 minutes old. A
 * graduated curve (`complete`) still verifies when the creator matches.
 * A `coinMints` doc whose uid is not the artist owner is an immediate clear.
 * RPC errors and the 5s timeout leave the document alone so the next run
 * can retry.
 *
 * No `coinMints` doc is not a confirm-route failure. Confirm saves the coin
 * without verifiedAt and logs coin_saved_unbound. The cron clears that coin
 * only when root mintFirstSeenAt, a server stamp, is more than 30 minutes
 * old. createdAt is a client clock and is not used.
 *
 * Fee sharing can later replace `creator` with a sharing-config PDA. The
 * first match writes `verifiedAt`, and a later call does not re-check, so a
 * sharing upgrade does not clear a coin we already accepted.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { readCoinMintBinding, type CoinMintBinding } from '@/lib/server/coinMints';
import { getSolanaRpcUrl } from '@/lib/solana/pumpFun';
import { emptyPumpFunCoin } from '@/types/firestore';

export const MINT_CREATOR_RPC_TIMEOUT_MS = 5_000;
/** Cron clears a missing binding only after the artist is older than this. */
export const MINT_UNBOUND_CLEAR_MS = 30 * 60 * 1000;

export type CreatorLookup =
  | { status: 'ok'; creator: string | null }
  | { status: 'unavailable' }
  /** Account missing, or the account bytes did not decode. */
  | { status: 'missing' };

export type VerifyArtistMintResult =
  | { result: 'matched'; creatorWallet: string }
  | { result: 'cleared'; reason: 'mismatch' | 'unbound' }
  | { result: 'unbound'; mint: string }
  | {
      result: 'unchanged';
      reason:
        | 'rpc'
        | 'missing_curve'
        | 'no_mint'
        | 'already_verified'
        | 'missing'
        | 'deleted'
        | 'mint_changed';
    };

export type MintCheckRow = {
  artistId: string;
  name: string;
  mint: string;
  boundUid: string | null;
  creatorWallet: string | null;
  onchainCreator: string | null;
  result: 'match' | 'mismatch' | 'unbound' | 'rpc_error';
};

export type VerifyArtistMintDeps = {
  db?: Firestore;
  lookupCreator?: (mint: string) => Promise<CreatorLookup>;
  timeoutMs?: number;
  /**
   * What to do when `coinMints/{mint}` is missing.
   * Confirm uses `leave` (never clear). The cron uses `clear` only after
   * mintFirstSeenAt is more than 30 minutes old.
   */
  unbound?: 'leave' | 'clear';
  /**
   * Missing bonding curve or a decode failure. Confirm leaves it.
   * The cron clears it as a mismatch only after mintFirstSeenAt is more
   * than 30 minutes old.
   */
  missingCurve?: 'leave' | 'clear';
};

type MintDecision =
  | { action: 'verify'; creatorWallet: string }
  | { action: 'clear'; reason: 'mismatch' | 'unbound' }
  | { action: 'leave'; reason: 'rpc' | 'unbound' | 'missing_curve' };

function walletString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function mintFromPump(pumpFun: unknown): string | null {
  if (!pumpFun || typeof pumpFun !== 'object' || Array.isArray(pumpFun)) return null;
  return walletString((pumpFun as { mint?: unknown }).mint);
}

export function hasVerifiedAt(pumpFun: unknown): boolean {
  if (!pumpFun || typeof pumpFun !== 'object' || Array.isArray(pumpFun)) return false;
  return (pumpFun as { verifiedAt?: unknown }).verifiedAt != null;
}

function sameWallet(left: string, right: string): boolean {
  try {
    return new PublicKey(left).equals(new PublicKey(right));
  } catch {
    return false;
  }
}

function isValidPublicKey(value: string): boolean {
  try {
    return Boolean(new PublicKey(value));
  } catch {
    return false;
  }
}

export function judgeBoundMint(
  ownerId: string,
  binding: CoinMintBinding | null,
  lookup: CreatorLookup | null
): MintDecision {
  if (!binding) return { action: 'leave', reason: 'unbound' };
  if (binding.uid !== ownerId) return { action: 'clear', reason: 'mismatch' };
  if (!lookup || lookup.status === 'unavailable') return { action: 'leave', reason: 'rpc' };
  if (lookup.status === 'missing') return { action: 'leave', reason: 'missing_curve' };
  if (lookup.creator && sameWallet(binding.creatorWallet, lookup.creator)) {
    return { action: 'verify', creatorWallet: binding.creatorWallet };
  }
  return { action: 'clear', reason: 'mismatch' };
}

type DecodedBondingCurve = {
  creator?: { toBase58?: () => string } | null;
  complete?: boolean;
};

/**
 * A missing account or a decode failure is `missing`. A decoded curve,
 * including one with `complete === true`, is `ok` and keeps its creator.
 */
export function interpretBondingCurve(
  account: unknown,
  decode: (account: unknown) => DecodedBondingCurve | null
): CreatorLookup {
  if (!account) return { status: 'missing' };
  let decoded: DecodedBondingCurve | null;
  try {
    decoded = decode(account);
  } catch {
    return { status: 'missing' };
  }
  if (!decoded) return { status: 'missing' };
  const creator = decoded.creator?.toBase58?.() || null;
  return { status: 'ok', creator };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('mint-creator-timeout');
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Read the bonding-curve creator for `mint`. Never throws.
 * `missing` means the account is absent or did not decode. `unavailable`
 * is an RPC failure. `creator: null` on `ok` is a decoded curve with no creator.
 */
export async function lookupBondingCurveCreator(mint: string): Promise<CreatorLookup> {
  let mintKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
  } catch {
    return { status: 'ok', creator: null };
  }

  try {
    const { bondingCurvePda, PUMP_SDK } = await import('@pump-fun/pump-sdk');
    const pda = bondingCurvePda(mintKey);
    const connection = new Connection(getSolanaRpcUrl(), {
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(MINT_CREATOR_RPC_TIMEOUT_MS),
        }),
    });
    const info = await connection.getAccountInfo(pda, 'confirmed');
    return interpretBondingCurve(info, account => PUMP_SDK.decodeBondingCurveNullable(account as never));
  } catch (err) {
    const name = err instanceof Error ? err.name : 'error';
    console.error('[verifyArtistMint] bonding curve lookup failed', { mint, name });
    return { status: 'unavailable' };
  }
}

async function readBinding(db: Firestore, mint: string): Promise<CoinMintBinding | null> {
  const snap = await db.collection(COLLECTIONS.coinMints).doc(mint).get();
  if (!snap.exists) return null;
  return readCoinMintBinding(snap.data());
}

async function resolveLookup(
  mint: string,
  deps: VerifyArtistMintDeps
): Promise<CreatorLookup> {
  if (!isValidPublicKey(mint)) return { status: 'ok', creator: null };
  const lookup = deps.lookupCreator ?? lookupBondingCurveCreator;
  return withTimeout(lookup(mint), deps.timeoutMs ?? MINT_CREATOR_RPC_TIMEOUT_MS);
}

async function commitMintDecision(
  db: Firestore,
  artistId: string,
  mint: string,
  decision: Exclude<MintDecision, { action: 'leave' }>
): Promise<'applied' | 'skipped'> {
  const ref = db.collection(COLLECTIONS.artists).doc(artistId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'skipped';
    const data = snap.data() as { deletedAt?: unknown; pumpFun?: unknown } | undefined;
    if (!data || data.deletedAt) return 'skipped';
    if (mintFromPump(data.pumpFun) !== mint) return 'skipped';
    if (hasVerifiedAt(data.pumpFun)) return 'skipped';

    if (decision.action === 'verify') {
      tx.update(ref, {
        'pumpFun.verifiedAt': FieldValue.serverTimestamp(),
        'pumpFun.creatorWallet': decision.creatorWallet,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return 'applied';
    }

    tx.update(ref, {
      pumpFun: emptyPumpFunCoin(),
      coinMetadataId: FieldValue.delete(),
      coinImagePath: FieldValue.delete(),
      mintFirstSeenAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'applied';
  });
}

export async function verifyArtistMint(
  artistId: string,
  deps: VerifyArtistMintDeps = {}
): Promise<VerifyArtistMintResult> {
  const db = deps.db ?? getAdminDb();
  const snap = await db.collection(COLLECTIONS.artists).doc(artistId).get();
  if (!snap.exists) return { result: 'unchanged', reason: 'missing' };

  const artist = snap.data() as
    | { ownerId?: unknown; deletedAt?: unknown; pumpFun?: unknown }
    | undefined;
  if (!artist) return { result: 'unchanged', reason: 'missing' };
  if (artist.deletedAt) return { result: 'unchanged', reason: 'deleted' };
  if (hasVerifiedAt(artist.pumpFun)) return { result: 'unchanged', reason: 'already_verified' };

  const mint = mintFromPump(artist.pumpFun);
  if (!mint) return { result: 'unchanged', reason: 'no_mint' };

  const ownerId = typeof artist.ownerId === 'string' ? artist.ownerId : '';
  const binding = await readBinding(db, mint);
  if (!binding) {
    if (deps.unbound === 'clear') {
      const wrote = await commitMintDecision(db, artistId, mint, {
        action: 'clear',
        reason: 'unbound',
      });
      if (wrote === 'skipped') return { result: 'unchanged', reason: 'mint_changed' };
      console.info('coin_cleared_unbound', { artistId, mint });
      return { result: 'cleared', reason: 'unbound' };
    }
    return { result: 'unbound', mint };
  }

  let lookup: CreatorLookup | null = null;
  if (binding.uid === ownerId) {
    try {
      lookup = await resolveLookup(mint, deps);
    } catch (err) {
      const name = err instanceof Error ? err.name : 'error';
      console.error('[verifyArtistMint] creator lookup failed', { artistId, mint, name });
      return { result: 'unchanged', reason: 'rpc' };
    }
  }

  const decision = judgeBoundMint(ownerId, binding, lookup);
  if (decision.action === 'leave') {
    if (decision.reason === 'unbound') return { result: 'unbound', mint };
    if (decision.reason === 'missing_curve' && deps.missingCurve === 'clear') {
      const wrote = await commitMintDecision(db, artistId, mint, {
        action: 'clear',
        reason: 'mismatch',
      });
      if (wrote === 'skipped') return { result: 'unchanged', reason: 'mint_changed' };
      console.info('coin_cleared_mismatch', { artistId, mint });
      return { result: 'cleared', reason: 'mismatch' };
    }
    if (decision.reason === 'missing_curve') {
      return { result: 'unchanged', reason: 'missing_curve' };
    }
    return { result: 'unchanged', reason: 'rpc' };
  }

  const wrote = await commitMintDecision(db, artistId, mint, decision);
  if (wrote === 'skipped') return { result: 'unchanged', reason: 'mint_changed' };
  if (decision.action === 'verify') {
    return { result: 'matched', creatorWallet: decision.creatorWallet };
  }

  console.info('coin_cleared_mismatch', { artistId, mint });
  return { result: 'cleared', reason: 'mismatch' };
}

/** Read-only report. Does not write. */
export async function inspectArtistMint(
  input: { artistId: string; name: string; mint: string; ownerId: string },
  deps: VerifyArtistMintDeps & { db: Firestore }
): Promise<MintCheckRow> {
  const binding = await readBinding(deps.db, input.mint);
  const base = {
    artistId: input.artistId,
    name: input.name,
    mint: input.mint,
    boundUid: binding?.uid ?? null,
    creatorWallet: binding?.creatorWallet ?? null,
  };

  if (!binding) {
    return { ...base, onchainCreator: null, result: 'unbound' };
  }
  if (binding.uid !== input.ownerId) {
    return { ...base, onchainCreator: null, result: 'mismatch' };
  }

  const lookupFn = deps.lookupCreator ?? lookupBondingCurveCreator;
  let lookup: CreatorLookup;
  try {
    lookup = await withTimeout(lookupFn(input.mint), deps.timeoutMs ?? MINT_CREATOR_RPC_TIMEOUT_MS);
  } catch {
    lookup = { status: 'unavailable' };
  }

  if (lookup.status === 'unavailable' || lookup.status === 'missing') {
    return { ...base, onchainCreator: null, result: 'rpc_error' };
  }
  const decision = judgeBoundMint(input.ownerId, binding, lookup);
  return {
    ...base,
    onchainCreator: lookup.creator,
    result: decision.action === 'verify' ? 'match' : 'mismatch',
  };
}
