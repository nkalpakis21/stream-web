'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { LaunchCoinToggle } from '@/components/artists/LaunchCoinToggle';
import { ConnectXToggle } from '@/components/artists/ConnectXToggle';
import { createArtist } from '@/lib/services/artists';
import { startArtistXConnect } from '@/lib/x/startConnectClient';
import { ArtistLookPicker } from '@/components/artists/ArtistLookPicker';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { resolvePumpFunForArtistCreate } from '@/lib/solana/launchArtistPumpFunCoin';
import type { StyleDNA } from '@/types/firestore';
import { useToast, ToastContainer } from '@/components/ui/toast';

interface CreativeArtistFormProps {
  onSuccess?: (artistId: string) => void;
  onCancel?: () => void;
}

export function CreativeArtistForm({ onSuccess, onCancel }: CreativeArtistFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    lore: '',
    genres: '',
    moods: '',
    influences: '',
    tempoMin: '60',
    tempoMax: '180',
    isPublic: true,
    vocalIdentity: '',
    launchCoin: false,
    coinName: '',
    ticker: '',
    connectX: false,
  });
  const [avatarURL, setAvatarURL] = useState<string | null>(null);
  const { toasts, showToast, dismissToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const styleDNA: StyleDNA = {
        genres: formData.genres.split(',').map(g => g.trim()).filter(Boolean),
        moods: formData.moods.split(',').map(m => m.trim()).filter(Boolean),
        tempoRange: {
          min: parseInt(formData.tempoMin),
          max: parseInt(formData.tempoMax),
        },
        influences: formData.influences.split(',').map(i => i.trim()).filter(Boolean),
      };

      const pumpWallet =
        connected && publicKey && signTransaction
          ? { publicKey, signTransaction }
          : null;

      const { pumpFun, launchNotice } = await resolvePumpFunForArtistCreate({
        launchCoin: formData.launchCoin,
        coinName: formData.coinName.trim() || formData.name,
        ticker: formData.ticker,
        imageUrl: avatarURL,
        description: formData.lore,
        wallet: pumpWallet,
        connection,
        getIdToken: user ? () => getFreshIdToken(user) : undefined,
      });

      const artist = await createArtist(user.uid, {
        name: formData.name,
        styleDNA,
        lore: formData.lore,
        vocalIdentity: formData.vocalIdentity.trim() || null,
        avatarURL,
        isPublic: formData.isPublic,
        pumpFun,
      });

      const shouldConnectX = formData.connectX;

      setFormData({
        name: '',
        lore: '',
        genres: '',
        moods: '',
        influences: '',
        tempoMin: '60',
        tempoMax: '180',
        isPublic: true,
        vocalIdentity: '',
        launchCoin: false,
        coinName: '',
        ticker: '',
        connectX: false,
      });
      setAvatarURL(null);

      if (launchNotice) {
        showToast(launchNotice, 'info');
      }

      if (shouldConnectX) {
        const xError = await startArtistXConnect(user, artist.id);
        if (xError) {
          showToast(xError, 'error');
        } else {
          return;
        }
      }

      if (onSuccess) {
        onSuccess(artist.id);
      } else {
        router.push(`/artists/${artist.id}`);
      }
    } catch (error) {
      console.error('Failed to create artist:', error);
      showToast('Failed to create artist. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 shadow-lg">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="relative p-6 sm:p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-foreground">Create artist</h3>
            <p className="text-sm text-muted-foreground">Photo, name, lore, voice. Coin is optional.</p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <ArtistLookPicker
            artistName={formData.name}
            lore={formData.lore}
            genres={formData.genres}
            moods={formData.moods}
            influences={formData.influences}
            selectedUrl={avatarURL}
            onSelectedUrlChange={setAvatarURL}
            disabled={loading}
          />

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2 text-foreground">
              Name <span className="text-primary">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Neon Dreams"
              className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="lore" className="block text-sm font-medium mb-2 text-foreground">
              Lore <span className="text-primary">*</span>
            </label>
            <textarea
              id="lore"
              required
              rows={4}
              value={formData.lore}
              onChange={e => setFormData({ ...formData, lore: e.target.value })}
              placeholder="Who they are, where they come from…"
              className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label htmlFor="vocalIdentity" className="block text-sm font-medium mb-2 text-foreground">
              Voice
            </label>
            <input
              id="vocalIdentity"
              type="text"
              maxLength={200}
              value={formData.vocalIdentity}
              onChange={e => setFormData({ ...formData, vocalIdentity: e.target.value })}
              placeholder="e.g. warm smoky alto, late-night R&B"
              className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              How this artist should sound. Locked on every song.
            </p>
          </div>

          <div className="border-t border-border/50 pt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all"
            >
              <div className="text-left">
                <h4 className="text-sm font-semibold text-foreground">More details</h4>
                <p className="text-xs text-muted-foreground">Genres, mood, tempo — optional</p>
              </div>
              <svg
                className={`w-5 h-5 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="pt-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="genres" className="block text-sm font-medium mb-2 text-foreground">
                      Genres
                    </label>
                    <input
                      id="genres"
                      type="text"
                      value={formData.genres}
                      onChange={e => setFormData({ ...formData, genres: e.target.value })}
                      placeholder="electronic, pop, ambient"
                      className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="moods" className="block text-sm font-medium mb-2 text-foreground">
                      Moods
                    </label>
                    <input
                      id="moods"
                      type="text"
                      value={formData.moods}
                      onChange={e => setFormData({ ...formData, moods: e.target.value })}
                      placeholder="melancholic, energetic, dreamy"
                      className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="influences" className="block text-sm font-medium mb-2 text-foreground">
                    Influences
                  </label>
                  <input
                    id="influences"
                    type="text"
                    value={formData.influences}
                    onChange={e => setFormData({ ...formData, influences: e.target.value })}
                    placeholder="Miles Davis, Daft Punk"
                    className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="tempoMin" className="block text-sm font-medium mb-2 text-foreground">
                      Min tempo
                    </label>
                    <input
                      id="tempoMin"
                      type="number"
                      min="30"
                      max="200"
                      value={formData.tempoMin}
                      onChange={e => setFormData({ ...formData, tempoMin: e.target.value })}
                      className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="tempoMax" className="block text-sm font-medium mb-2 text-foreground">
                      Max tempo
                    </label>
                    <input
                      id="tempoMax"
                      type="number"
                      min="30"
                      max="200"
                      value={formData.tempoMax}
                      onChange={e => setFormData({ ...formData, tempoMax: e.target.value })}
                      className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <LaunchCoinToggle
            checked={formData.launchCoin}
            onChange={launchCoin => setFormData({ ...formData, launchCoin })}
            disabled={loading}
            artistName={formData.name}
            coinName={formData.coinName}
            onCoinNameChange={coinName => setFormData({ ...formData, coinName })}
            ticker={formData.ticker}
            onTickerChange={ticker => setFormData({ ...formData, ticker })}
            lookUrl={avatarURL}
          />

          <ConnectXToggle
            checked={formData.connectX}
            onChange={connectX => setFormData({ ...formData, connectX })}
            disabled={loading}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {formData.launchCoin ? 'Creating and launching…' : 'Creating…'}
                </span>
              ) : (
                'Create artist'
              )}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-3 border border-border rounded-xl hover:bg-muted/50 transition-all font-medium text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
