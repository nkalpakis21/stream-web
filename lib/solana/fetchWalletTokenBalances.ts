import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { firstHttpSolanaRpcUrl } from '@/lib/solana/rpcUrl';

export interface WalletTokenBalance {
  mint: string;
  amount: number;
  decimals: number;
}

function rpcUrl(): string | undefined {
  return firstHttpSolanaRpcUrl(
    process.env.SOLANA_RPC_URL,
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  );
}

function uiAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Non-zero SPL balances for a wallet. Fail-soft when RPC is missing
 * or the lookup fails — never invent balances (STR-41).
 */
export async function fetchWalletTokenBalances(
  ownerAddress: string
): Promise<WalletTokenBalance[]> {
  const endpoint = rpcUrl();
  if (!endpoint) return [];

  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerAddress.trim());
  } catch {
    return [];
  }

  const connection = new Connection(endpoint, 'confirmed');
  const combined = new Map<string, WalletTokenBalance>();

  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const { value } = await connection.getParsedTokenAccountsByOwner(owner, {
        programId,
      });
      for (const { account } of value) {
        const parsed = account.data as {
          parsed?: {
            info?: {
              mint?: string;
              tokenAmount?: { uiAmount?: number | null; decimals?: number };
            };
          };
        };
        const mint = parsed.parsed?.info?.mint?.trim();
        const amount = uiAmount(parsed.parsed?.info?.tokenAmount?.uiAmount);
        const decimals = parsed.parsed?.info?.tokenAmount?.decimals;
        if (!mint || amount == null || amount <= 0) continue;
        const prev = combined.get(mint);
        if (prev) {
          prev.amount += amount;
        } else {
          combined.set(mint, {
            mint,
            amount,
            decimals: typeof decimals === 'number' ? decimals : 0,
          });
        }
      }
    } catch {
      // Fail-soft per program. Do not invent balances.
    }
  }

  return Array.from(combined.values());
}
