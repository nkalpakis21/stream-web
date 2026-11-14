'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { VoiceSheet } from '@/components/voices/VoiceSheet';
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
  const [open, setOpen] = useState(false);
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
      setOpen(false);
    } catch {
      setError("Couldn't change the voice.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="owner-flat-card" data-artist-voice>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#F5F4F8]">Voice</p>
          {shown ? (
            <p className="mt-1 text-sm text-[#F5F4F8]" data-current-voice>
              {shown.name}
              {shown.descriptor ? (
                <span className="mt-0.5 block text-xs text-[#8B8896]">{shown.descriptor}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          data-change-voice
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-medium text-[#E8E6F2]"
          onClick={() => {
            setSelected(saved);
            setError(null);
            setOpen(true);
          }}
        >
          Change
        </button>
      </div>
      {open ? (
        <VoiceSheet
          voices={voices}
          selected={selected}
          currentSlug={saved}
          confirm
          busy={busy}
          title="Change the voice"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          onSelect={setSelected}
          onUse={() => void save()}
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#FF4D6A]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
