#!/usr/bin/env tsx
/**
 * Read-only report of every artist coin. Prints one JSON object per coin
 * and never writes Firestore.
 *
 *   tsx scripts/dry-run-mint-check.ts
 *
 * Each line is
 *   {artistId, name, mint, boundUid, creatorWallet, onchainCreator, result}
 * result is match, mismatch, unbound, or rpc_error.
 *
 * Needs Firebase Admin credentials and a Solana RPC URL, same as the app.
 * Do not point this at production unless the CTO asked for that report.
 */

import { collectDryRunMintRows } from '../lib/server/mintSweep';

async function main(): Promise<void> {
  const rows = await collectDryRunMintRows({});
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
