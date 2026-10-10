#!/usr/bin/env tsx
/**
 * Stamp mintSweepExemptAt on every artist that has pumpFun.mint and does
 * not already have that field. Safe to run again. An existing
 * mintSweepExemptAt is never overwritten.
 *
 *   tsx scripts/mark-legacy-mints.ts --dry-run
 *   tsx scripts/mark-legacy-mints.ts
 *
 * --dry-run prints one JSON line per artist and does not write.
 * Each line is {artistId, name, mint}.
 *
 * Needs Firebase Admin credentials. Do not point this at production
 * unless the CTO asked for that run.
 */

import { markLegacyMints } from '../lib/server/markLegacyMints';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const rows = await markLegacyMints({ dryRun });
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
  if (dryRun) {
    console.error(`dry-run: ${rows.length} artist(s) would be exempted`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
