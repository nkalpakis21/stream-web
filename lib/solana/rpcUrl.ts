/**
 * First candidate that is a usable Solana RPC HTTP(S) URL after trim.
 * Rejects missing scheme, quotes, whitespace-only, and key-only values.
 */
export function firstHttpSolanaRpcUrl(
  ...candidates: Array<string | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (!url) continue;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
  }
  return undefined;
}
