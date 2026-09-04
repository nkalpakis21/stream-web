'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast, ToastContainer } from '@/components/ui/toast';
import { getFreshIdToken, userFacingApiError } from '@/lib/api/clientAuth';
import { MAX_ARTIST_BIO_LENGTH } from '@/lib/brand/bio';

interface ArtistBioEditorProps {
  artistId: string;
  currentBio: string;
  onSaved?: (bio: string) => void;
}

export function ArtistBioEditor({
  artistId,
  currentBio,
  onSaved,
}: ArtistBioEditorProps) {
  const { user } = useAuth();
  const [bio, setBio] = useState(currentBio.slice(0, MAX_ARTIST_BIO_LENGTH));
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    setBio(currentBio.slice(0, MAX_ARTIST_BIO_LENGTH));
  }, [currentBio]);

  const handleSave = async () => {
    if (!user || saving) return;

    const trimmed = bio.trim();
    if (trimmed.length > MAX_ARTIST_BIO_LENGTH) {
      showToast(`Bio must be ${MAX_ARTIST_BIO_LENGTH} characters or less`, 'error');
      return;
    }

    if (trimmed === currentBio.trim()) {
      return;
    }

    setSaving(true);
    try {
      const token = await getFreshIdToken(user);
      const response = await fetch(`/api/artists/${artistId}/bio`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          userFacingApiError(response.status, data.error, 'Failed to save bio')
        );
      }
      const next = typeof data.artist?.lore === 'string' ? data.artist.lore : trimmed;
      setBio(next.slice(0, MAX_ARTIST_BIO_LENGTH));
      showToast('Bio saved', 'success');
      onSaved?.(next);
    } catch (error) {
      showToast(userFacingApiError(undefined, error, 'Failed to save bio'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <label htmlFor="owner-bio" className="owner-bio-label">
        Bio
      </label>
      <div className="owner-bio-box">
        <textarea
          id="owner-bio"
          value={bio}
          maxLength={MAX_ARTIST_BIO_LENGTH}
          rows={5}
          disabled={saving}
          onChange={e => setBio(e.target.value.slice(0, MAX_ARTIST_BIO_LENGTH))}
          placeholder="Write your bio so listeners know who you are."
        />
        <span className="owner-bio-count">
          {bio.length} / {MAX_ARTIST_BIO_LENGTH}
        </span>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !user}
        className="btn-ghost owner-bio-save"
      >
        {saving ? 'Saving…' : 'Save bio'}
      </button>
    </div>
  );
}
