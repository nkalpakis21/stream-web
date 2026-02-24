/**
 * Mint SPL token with Metaplex metadata for a song.
 * Creates mint, metadata, and mints initial supply to the mint authority.
 */

import { createFungible } from '@metaplex-foundation/mpl-token-metadata';
import {
  createTokenIfMissing,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
  mintTokensTo,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  percentAmount,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import bs58 from 'bs58';
import type { SongDocument } from '@/types/firestore';
import type { AIArtistDocument } from '@/types/firestore';

const INITIAL_SUPPLY = 1_000_000n; // 1M tokens (9 decimals = 1e15 raw units)
const DECIMALS = 9;

export interface MintSongTokenParams {
  song: SongDocument;
  artist: AIArtistDocument | null;
  metadataUri: string;
}

/**
 * Create SPL token with Metaplex metadata for a song.
 * Returns the mint public key (base58 string).
 */
export async function mintSongToken({
  song,
  artist,
  metadataUri,
}: MintSongTokenParams): Promise<string> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    'https://api.devnet.solana.com';
  const privateKeyBase58 = process.env.SOLANA_MINT_AUTHORITY_PRIVATE_KEY;

  if (!privateKeyBase58) {
    throw new Error(
      'SOLANA_MINT_AUTHORITY_PRIVATE_KEY is not set in environment'
    );
  }

  const secretKey = bs58.decode(privateKeyBase58);
  const umi = createUmi(rpcUrl)
    .use(mplTokenMetadata())
    .use(mplToolbox());

  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, keypair);
  umi.use(keypairIdentity(signer));

  const mintSigner = generateSigner(umi);

  // Safe symbol: max 6 chars for Metaplex. STRM + first 3 of songId
  const symbolSuffix = song.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);
  const name = song.title.slice(0, 32) || 'Stream Song';

  const symbol = `STRM${symbolSuffix}`.slice(0, 6);
  const createFungibleIx = createFungible(umi, {
    mint: mintSigner,
    name,
    symbol,
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: DECIMALS,
  });

  const createTokenIx = createTokenIfMissing(umi, {
    mint: mintSigner.publicKey,
    owner: umi.identity.publicKey,
    ataProgram: getSplAssociatedTokenProgramId(umi),
  });

  const mintTokensIx = mintTokensTo(umi, {
    mint: mintSigner.publicKey,
    token: findAssociatedTokenPda(umi, {
      mint: mintSigner.publicKey,
      owner: umi.identity.publicKey,
    }),
    amount: INITIAL_SUPPLY,
  });

  await createFungibleIx
    .add(createTokenIx)
    .add(mintTokensIx)
    .sendAndConfirm(umi);

  return mintSigner.publicKey;
}
