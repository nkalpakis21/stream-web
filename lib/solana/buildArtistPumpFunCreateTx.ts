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
  PUMP_ALT_ADDRESS_MAINNET,
  PUMP_CREATE_COMPUTE_UNITS,
  PUMP_PRIORITY_MICRO_LAMPORTS,
  getSolanaRpcUrl,
} from '@/lib/solana/pumpFun';

export type BuildArtistPumpFunCreateTxInput = {
  mint: PublicKey;
  user: PublicKey;
  name: string;
  symbol: string;
  uri: string;
};

export async function buildUnsignedArtistPumpFunCreateTx(
  input: BuildArtistPumpFunCreateTxInput
): Promise<VersionedTransaction> {
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

  const addressLookupTableAccounts = [];
  try {
    const alt = await connection.getAddressLookupTable(
      new PublicKey(PUMP_ALT_ADDRESS_MAINNET)
    );
    if (alt.value) {
      addressLookupTableAccounts.push(alt.value);
    }
  } catch (err) {
    console.warn('[pump.fun] Address lookup table unavailable, sending without ALT', err);
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: input.user,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(addressLookupTableAccounts);

  return new VersionedTransaction(message);
}
