'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface ArtistLookPickerProps {
  artistName: string;
  lore: string;
  genres: string;
  moods: string;
  influences: string;
  selectedUrl: string | null;
  onSelectedUrlChange: (url: string | null) => void;
  disabled?: boolean;
}

function splitCsv(value: string): string[] {
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

async function fileToDataUri(file: File, maxPx = 1024): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = objectUrl;
    });

    const scale = Math.min(1, maxPx / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image.');
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ArtistLookPicker({
  artistName,
  lore,
  genres,
  moods,
  influences,
  selectedUrl,
  onSelectedUrlChange,
  disabled = false,
}: ArtistLookPickerProps) {
  const fileInputId = useId();
  const lookNotesId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [lookNotes, setLookNotes] = useState('');
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceDataUri, setReferenceDataUri] = useState<string | null>(null);
  const [looks, setLooks] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artists/looks')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setAvailable(Boolean(data.available));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReferenceChange = async (file: File | null) => {
    if (!file) {
      setReferencePreview(null);
      setReferenceDataUri(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    try {
      const dataUri = await fileToDataUri(file);
      setReferenceDataUri(dataUri);
      setReferencePreview(dataUri);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };

  const handleGenerate = async () => {
    if (!artistName.trim()) {
      setError('Enter an artist name before generating looks.');
      return;
    }
    if (available === false) {
      setError(
        'Look generation is not configured (FAL_KEY). You can still create this artist with a placeholder avatar.'
      );
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/artists/looks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: artistName.trim(),
          lore,
          genres: splitCsv(genres),
          moods: splitCsv(moods),
          influences: splitCsv(influences),
          lookNotes: lookNotes.trim() || undefined,
          referenceImage: referenceDataUri || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ||
            (response.status === 503
              ? 'Look generation is not configured (FAL_KEY). You can still create this artist with a placeholder avatar.'
              : 'Failed to generate looks.')
        );
      }
      const urls = Array.isArray(data.looks)
        ? data.looks.map((look: { url?: string }) => look.url).filter(Boolean)
        : [];
      if (urls.length === 0) {
        throw new Error('No looks were returned. Create the artist without an avatar, or try again.');
      }
      setLooks(urls);
      onSelectedUrlChange(urls[0]);
    } catch (err) {
      setLooks([]);
      onSelectedUrlChange(null);
      setError(err instanceof Error ? err.message : 'Failed to generate looks.');
    } finally {
      setGenerating(false);
    }
  };

  const generateDisabled =
    disabled || generating || available === false || !artistName.trim();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Artist look</p>
        <p className="text-xs text-muted-foreground mt-1">
          Generate a small set of portraits from this artist&apos;s lore and style. Pick one to lock it — songs will keep this face. Optional. Regenerating later is not in this flow.
        </p>
      </div>

      <div>
        <label htmlFor={fileInputId} className="block text-sm font-medium mb-2 text-foreground">
          Reference photo (optional)
        </label>
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          disabled={disabled || generating}
          onChange={e => handleReferenceChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent/10 file:text-accent file:font-medium"
        />
        {referencePreview && (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={referencePreview}
              alt="Reference preview"
              className="w-16 h-16 rounded-full object-cover ring-2 ring-border"
            />
            <button
              type="button"
              onClick={() => {
                handleReferenceChange(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remove reference
            </button>
          </div>
        )}
      </div>

      <div>
        <label htmlFor={lookNotesId} className="block text-sm font-medium mb-2 text-foreground">
          Look notes (optional)
        </label>
        <input
          id={lookNotesId}
          type="text"
          maxLength={500}
          value={lookNotes}
          disabled={disabled || generating}
          onChange={e => setLookNotes(e.target.value)}
          placeholder="e.g. silver hair, neon jacket, 80s album-cover lighting"
          className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generateDisabled}
        className="w-full px-4 py-2.5 border border-border rounded-xl hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm text-foreground"
      >
        {generating ? 'Generating looks…' : 'Generate looks'}
      </button>

      {available === false && (
        <p className="text-xs text-muted-foreground">
          Look generation is not configured (set <span className="font-mono">FAL_KEY</span>). You can still create this artist — they&apos;ll use a placeholder avatar until a look is generated.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      {looks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Pick one look</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {looks.map((url, index) => {
              const isSelected = selectedUrl === url;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => onSelectedUrlChange(url)}
                  aria-pressed={isSelected}
                  aria-label={`Select look ${index + 1}`}
                  className={`relative aspect-square rounded-xl overflow-hidden ring-2 transition-all ${
                    isSelected ? 'ring-accent scale-[1.02]' : 'ring-transparent hover:ring-border'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
          {selectedUrl && (
            <button
              type="button"
              onClick={() => onSelectedUrlChange(null)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear selection (create without a look)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
