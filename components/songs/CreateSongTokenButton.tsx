'use client';

/**
 * Product song minting is retired. Tokens are artist-level via pump.fun,
 * not per-song Metaplex mints. This control is unused and must not call
 * POST /api/songs/[id]/mint-token. Do not re-enable.
 */
interface CreateSongTokenButtonProps {
  songId: string;
  ownerId: string;
  tokenMintAddress: string | null | undefined;
}

export function CreateSongTokenButton(_props: CreateSongTokenButtonProps) {
  return null;
}
