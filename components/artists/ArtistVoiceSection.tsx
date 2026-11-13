'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { VoicePicker } from '@/components/voices/VoicePicker';
import type { PublicStreamstarVoice, VoiceSlug } from '@/lib/voices/streamstarVoices';

export function ArtistVoiceSection({
  artistId,
  voiceSlug,
  voices,
}: {
  artistId: string;
  voiceSlug?: string | null;
  voices: readonly PublicStreamstarVoice[];
}) {
  const { user } = useAuth();
  const current = voices.some(voice => voice.slug === voiceSlug) ? (voiceSlug as VoiceSlug) : null;
  const [selected, setSelected] = useState<VoiceSlug | null>(current);
  const [saved, setSaved] = useState<VoiceSlug | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = voices.find(voice => voice.slug === saved);

  const save = async () => {
    if (!user || !selected || selected === saved) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getFreshIdToken(user);
      const response = await fetch(`/api/artists/${encodeURIComponent(artistId)}/voice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ voice: selected }),
      });
      if (!response.ok) {
        setError("Couldn't change the voice.");
        return;
      }
      setSaved(selected);
    } catch {
      setError("Couldn't change the voice.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="owner-flat-card" data-artist-voice>
      <p className="text-sm font-medium text-[#F5F4F8]">Voice</p>
      {shown ? (
        <p className="mt-1 text-sm text-[#8B8896]" data-current-voice>
          {shown.name}
          {shown.descriptor ? ` · ${shown.descriptor}` : ''}
        </p>
      ) : null}
      <div className="mt-4">
        <VoicePicker
          voices={voices}
          selected={selected}
          currentSlug={saved}
          onSelect={setSelected}
          onUse={() => void save()}
          busy={busy}
          confirm
        />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
