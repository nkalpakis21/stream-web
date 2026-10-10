/**
 * Read the Metaplex token-metadata URI for a mint.
 * Account layout: 1-byte key, 32-byte update authority, 32-byte mint,
 * then Borsh strings name, symbol, uri.
 */

import { PublicKey } from '@solana/web3.js';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export function metaplexMetadataAddress(mint: string): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  return pda.toBase58();
}

export function metaplexMetadataUriFromAccount(data: Uint8Array): string | null {
  let offset = 1 + 32 + 32;
  const readString = (): string | null => {
    if (offset + 4 > data.length) return null;
    const length =
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24);
    offset += 4;
    if (length < 0 || length > 400 || offset + length > data.length) return null;
    const text = Buffer.from(data.subarray(offset, offset + length))
      .toString('utf8')
      .replace(/\0+$/g, '')
      .trim();
    offset += length;
    return text;
  };
  if (readString() === null) return null;
  if (readString() === null) return null;
  const uri = readString();
  return uri || null;
}

export async function fetchMetaplexMetadataUri(
  mint: string,
  rpcUrl: string,
  options?: { fetchImpl?: typeof fetch; signal?: AbortSignal }
): Promise<string | null> {
  const endpoint = rpcUrl.trim();
  if (!endpoint) return null;
  let address: string;
  try {
    address = metaplexMetadataAddress(mint);
  } catch {
    return null;
  }
  const response = await (options?.fetchImpl ?? fetch)(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [address, { encoding: 'base64' }],
    }),
    signal: options?.signal,
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    result?: { value?: { data?: unknown } | null };
  };
  const data = body.result?.value?.data;
  const base64 = Array.isArray(data) && typeof data[0] === 'string' ? data[0] : null;
  if (!base64) return null;
  return metaplexMetadataUriFromAccount(Buffer.from(base64, 'base64'));
}
