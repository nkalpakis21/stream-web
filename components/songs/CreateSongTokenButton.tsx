'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

interface CreateSongTokenButtonProps {
  songId: string;
  ownerId: string;
  tokenMintAddress: string | null | undefined;
}

export function CreateSongTokenButton({
  songId,
  ownerId,
  tokenMintAddress,
}: CreateSongTokenButtonProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintAddress, setMintAddress] = useState<string | null>(
    tokenMintAddress || null
  );

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (!user || user.uid !== ownerId) {
    return null;
  }

  if (mintAddress) {
    return null;
  }

  const handleCreateToken = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch(`/api/songs/${songId}/mint-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create token');
      }

      setMintAddress(data.mintAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={handleCreateToken}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? 'Creating Token...' : 'Create Token'}
      </button>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
