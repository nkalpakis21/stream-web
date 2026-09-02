/**
 * Server-only: build an unsigned pump.fun create_v2 VersionedTransaction
 * with @pump-fun/pump-sdk. The mint keypair and user wallet sign on the client.
 * Never accepts or returns a private key.
 */

import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { PUMP_SDK } from '@pump-fun/pump-sdk';
import {
  METADATA_URI_TOO_LONG_NOTICE,
  PUMP_ALT_ADDRESS_MAINNET,
  PUMP_CREATE_COMPUTE_UNITS,
  PUMP_PRIORITY_MICRO_LAMPORTS,
  getSolanaRpcUrl,
  isMetadataUriTooLong,
} from '@/lib/solana/pumpFun';

export type BuildArtistPumpFunCreateTxInput = {
  mint: PublicKey;
  user: PublicKey;
  name: string;
  symbol: string;
  uri: string;
};

export class PumpFunCreateTxBuildError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PumpFunCreateTxBuildError';
    this.status = status;
  }
}

function formatSimFailure(err: unknown, logs: string[] | null | undefined): string {
  const logText = (logs ?? []).join('\n');
  const errText = typeof err === 'string' ? err : JSON.stringify(err);
  if (/UriTooLong|Error Number:\s*6045|Custom["\s:]*6045/i.test(`${errText}\n${logText}`)) {
    return METADATA_URI_TOO_LONG_NOTICE;
  }
  if (/insufficient lamports|insufficient funds/i.test(logText)) {
    return 'Not enough SOL for network fees (about 0.02 SOL).';
  }

  const tail = (logs ?? []).filter(Boolean).slice(-6);
  const combined = tail.length
    ? `Launch simulation failed (${errText}). Logs: ${tail.join(' | ')}`
    : `Launch simulation failed (${errText}).`;
  return combined.length > 500 ? `${combined.slice(0, 497)}...` : combined;
}

async function assertUnsignedCreateTxSimulates(
  connection: Connection,
  tx: VersionedTransaction
): Promise<void> {
  let sim;
  try {
    sim = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'confirmed',
    });
  } catch (err) {
    console.error('[pump.fun] create_v2 simulation RPC failed', err);
    throw new PumpFunCreateTxBuildError(
      'Could not simulate the launch transaction. Try again.',
      503
    );
  }

  if (sim.value.err) {
    throw new PumpFunCreateTxBuildError(
      formatSimFailure(sim.value.err, sim.value.logs)
    );
  }
}

export async function buildUnsignedArtistPumpFunCreateTx(
  input: BuildArtistPumpFunCreateTxInput
): Promise<VersionedTransaction> {
  if (isMetadataUriTooLong(input.uri)) {
    throw new PumpFunCreateTxBuildError(METADATA_URI_TOO_LONG_NOTICE);
  }

  const connection = new Connection(getSolanaRpcUrl(), 'confirmed');

  const createIx = await PUMP_SDK.createV2Instruction({
    mint: input.mint,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    creator: input.user,
    user: input.user,
    mayhemMode: false,
    cashback: false,
  });

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: PUMP_CREATE_COMPUTE_UNITS,
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: PUMP_PRIORITY_MICRO_LAMPORTS,
    }),
    createIx,
  ];

  let addressLookupTableAccount = null;
  try {
    const alt = await connection.getAddressLookupTable(
      new PublicKey(PUMP_ALT_ADDRESS_MAINNET)
    );
    addressLookupTableAccount = alt.value;
  } catch (err) {
    console.warn('[pump.fun] Address lookup table unavailable', err);
  }

  if (!addressLookupTableAccount) {
    throw new PumpFunCreateTxBuildError(
      'Pump.fun address lookup table is unavailable. Try again.'
    );
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: input.user,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message([addressLookupTableAccount]);

  const tx = new VersionedTransaction(message);
  await assertUnsignedCreateTxSimulates(connection, tx);
  return tx;
}
