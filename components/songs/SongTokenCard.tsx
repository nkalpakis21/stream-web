'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

interface TokenMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  external_url?: string;
}

interface SongTokenCardProps {
  songId: string;
  tokenMintAddress: string;
}

const SOLANA_EXPLORER_BASE = 'https://explorer.solana.com';
const EXPLORER_CLUSTER = '?cluster=devnet';

function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, decimals);
  return `${whole}.${fracStr}`.replace(/\.?0+$/, '');
}

export function SongTokenCard({ songId, tokenMintAddress }: SongTokenCardProps) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [supply, setSupply] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [decimals, setDecimals] = useState<number>(9);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mintPubkey = new PublicKey(tokenMintAddress);

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch metadata
        const metaRes = await fetch(`/api/songs/${songId}/token-metadata`);
        if (!metaRes.ok) throw new Error('Failed to load metadata');
        const meta: TokenMetadata = await metaRes.json();
        if (!cancelled) setMetadata(meta);

        // Fetch mint info (supply, decimals)
        const mintInfo = await getMint(connection, mintPubkey);
        if (!cancelled) {
          setSupply(formatTokenAmount(mintInfo.supply, mintInfo.decimals));
          setDecimals(mintInfo.decimals);
        }

        // Fetch user balance if connected
        if (publicKey) {
          const ata = getAssociatedTokenAddressSync(mintPubkey, publicKey);
          try {
            const account = await getAccount(connection, ata);
            if (!cancelled) {
              setUserBalance(
                formatTokenAmount(account.amount, mintInfo.decimals)
              );
            }
          } catch {
            // No token account yet = 0 balance
            if (!cancelled) setUserBalance('0');
          }
        } else {
          if (!cancelled) setUserBalance(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load token');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [songId, tokenMintAddress, connection, publicKey]);

  if (loading && !metadata) {
    return (
      <div className="mt-4 p-4 rounded-lg border bg-card animate-pulse">
        <div className="h-4 w-24 bg-muted rounded mb-2" />
        <div className="h-3 w-full bg-muted rounded" />
      </div>
    );
  }

  if (error && !metadata) {
    return (
      <div className="mt-4 p-4 rounded-lg border bg-card border-destructive/50">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const explorerUrl = `${SOLANA_EXPLORER_BASE}/address/${tokenMintAddress}${EXPLORER_CLUSTER}`;

  return (
    <div className="mt-4 p-4 rounded-lg border bg-card">
      <div className="flex items-start gap-3">
        {metadata?.image && (
          <img
            src={metadata.image}
            alt={metadata.name}
            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{metadata?.name ?? 'Token'}</p>
          {metadata?.symbol && (
            <p className="text-xs text-muted-foreground">{metadata.symbol}</p>
          )}
          <div className="mt-2 space-y-1">
            {supply !== null && (
              <p className="text-xs text-muted-foreground">
                Total supply:{' '}
                <span className="font-mono text-foreground">
                  {Number(supply).toLocaleString()}
                </span>
              </p>
            )}
            {userBalance !== null && (
              <p className="text-xs text-muted-foreground">
                Your balance:{' '}
                <span className="font-mono text-foreground">
                  {Number(userBalance).toLocaleString()}
                </span>
              </p>
            )}
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs text-accent hover:underline"
          >
            View on Solana Explorer
          </a>
        </div>
      </div>
    </div>
  );
}
