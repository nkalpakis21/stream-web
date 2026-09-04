'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  PhotoFrameEditor,
  type PhotoFrameEditorHandle,
} from '@/components/artists/PhotoFrameEditor';
import {
  getFreshIdToken,
  SIGN_IN_AGAIN_MESSAGE,
  userFacingApiError,
} from '@/lib/api/clientAuth';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SOURCE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const OWNER_FACE_PX = 232;

interface ArtistLookPickerProps {
  artistName: string;
  lore: string;
  genres: string;
  moods: string;
  influences: string;
  selectedUrl: string | null;
  onSelectedUrlChange: (url: string | null) => void;
  disabled?: boolean;
  /**
   * `create` is the new-artist form. `lock` is the owner-only artist page:
   * pick a look to persist `avatarURL`. Same Fal endpoint either way.
   */
  mode?: 'create' | 'lock';
  /** Current locked face on the artist page. Ignored in create mode. */
  lockedUrl?: string | null;
}

function splitCsv(value: string): string[] {
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

/** Never mention Fal, FAL_KEY, or missing AI config in the UI. */
function userFacingGenerateError(status: number | undefined, error: unknown): string {
  const raw = errorText(error);
  if (
    status === 503 ||
    /FAL_KEY|\bFal\b|fal\.ai|not configured/i.test(raw)
  ) {
    return "Couldn't generate looks right now.";
  }
  return raw.trim() || 'Failed to generate looks.';
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
  mode = 'create',
  lockedUrl = null,
}: ArtistLookPickerProps) {
  const { user } = useAuth();
  const isLockMode = mode === 'lock';
  const autoSelectFirst = !isLockMode;
  const allowClear = !isLockMode;
  const fileInputId = useId();
  const lookNotesId = useId();
  const generatePanelId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<PhotoFrameEditorHandle>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [lookNotes, setLookNotes] = useState('');
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [looks, setLooks] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const clearPhoto = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPhotoSrc(null);
    setUploadedUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoChange = (file: File | null) => {
    if (!file) {
      clearPhoto();
      return;
    }
    const type = (file.type || '').toLowerCase();
    if (!type.startsWith('image/') || (type && !ALLOWED_SOURCE_TYPES.has(type))) {
      setError('Please choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError('Photo must be 5 MB or smaller.');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPhotoSrc(objectUrl);
    setUploadedUrl(null);
    setError(null);
  };

  const handleUsePhoto = async () => {
    if (!user) {
      setError('Sign in to use this photo.');
      return;
    }
    if (!frameRef.current) {
      setError('Choose a photo first.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const blob = await frameRef.current.exportJpeg();
      const token = await getFreshIdToken(user);
      const form = new FormData();
      form.append('file', blob, 'look.jpg');
      const response = await fetch('/api/artists/looks/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) {
        throw new Error(
          userFacingApiError(response.status, data.error, 'Failed to upload photo.')
        );
      }
      setUploadedUrl(data.url);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPhotoSrc(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSelectedUrlChange(data.url);
    } catch (err) {
      setError(userFacingApiError(undefined, err, 'Failed to upload photo.'));
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!artistName.trim()) {
      setError('Enter an artist name before generating looks.');
      return;
    }
    if (available === false) {
      setError("Couldn't generate looks right now.");
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      let referenceImage: string | undefined;
      if (photoSrc && frameRef.current) {
        const framed = await frameRef.current.exportJpeg();
        referenceImage = await blobToDataUri(framed);
      }

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
          referenceImage,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(userFacingGenerateError(response.status, data.error));
      }
      const urls = Array.isArray(data.looks)
        ? data.looks.map((look: { url?: string }) => look.url).filter(Boolean)
        : [];
      if (urls.length === 0) {
        throw new Error(
          isLockMode
            ? 'No looks were returned. Upload a photo instead, or try again.'
            : 'No looks were returned. Upload a photo, create the artist without an avatar, or try again.'
        );
      }
      setLooks(urls);
      if (autoSelectFirst) {
        onSelectedUrlChange(urls[0]);
      }
    } catch (err) {
      setLooks([]);
      if (!(uploadedUrl && selectedUrl === uploadedUrl)) {
        onSelectedUrlChange(null);
      }
      setError(userFacingGenerateError(undefined, err));
    } finally {
      setGenerating(false);
    }
  };

  const busy = disabled || generating || uploading;
  const generateDisabled = busy || !artistName.trim();
  const showGeneratePath = available === true;
  const usingUploadedPhoto = Boolean(uploadedUrl && selectedUrl === uploadedUrl);
  const faceUrl = photoSrc ? null : selectedUrl || lockedUrl;
  const isLockedFace = Boolean(faceUrl) && !photoSrc;

  const openFilePicker = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const acceptDroppedFile = (fileList: FileList | null) => {
    const file = fileList?.[0] ?? null;
    if (!file) return;
    handlePhotoChange(file);
  };

  const hiddenFileInput = (
    <input
      id={fileInputId}
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      disabled={busy}
      onChange={e => handlePhotoChange(e.target.files?.[0] ?? null)}
      className="sr-only"
      tabIndex={-1}
    />
  );

  const generatePanel = showGenerate && showGeneratePath ? (
    <div id={generatePanelId} className={isLockMode ? 'owner-look-generate-panel space-y-4' : 'mt-4 space-y-4'}>
      <div>
        <label htmlFor={lookNotesId} className="block text-sm font-medium mb-2 text-foreground">
          Look notes (optional)
        </label>
        <input
          id={lookNotesId}
          type="text"
          maxLength={500}
          value={lookNotes}
          disabled={busy}
          onChange={e => setLookNotes(e.target.value)}
          placeholder="e.g. silver hair, neon jacket, 80s album-cover lighting"
          className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Optional notes plus the framed photo are sent as a reference.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generateDisabled}
        className="w-full px-4 py-2.5 border border-border rounded-xl hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm text-foreground"
      >
        {generating ? 'Generating looks…' : 'Generate looks'}
      </button>

      {looks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Pick one generated look</p>
          <div className={`grid gap-3 ${isLockMode ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {looks.map((url, index) => {
              const isSelected = selectedUrl === url;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => onSelectedUrlChange(url)}
                  disabled={busy}
                  aria-pressed={isSelected}
                  aria-label={`Select look ${index + 1}`}
                  className={`relative aspect-square rounded-xl overflow-hidden ring-2 transition-all ${
                    isSelected ? 'ring-accent scale-[1.02]' : 'ring-transparent hover:ring-border'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
          {allowClear && selectedUrl && (
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
  ) : null;

  if (isLockMode) {
    return (
      <div className="owner-look">
        {hiddenFileInput}
        {photoSrc ? (
          <PhotoFrameEditor
            key={photoSrc}
            ref={frameRef}
            src={photoSrc}
            disabled={busy}
            viewportPx={OWNER_FACE_PX}
            circular
          />
        ) : (
          <div
            className={`owner-face ${isLockedFace ? 'is-locked' : 'is-empty'}${dragOver ? ' is-over' : ''}`}
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label={isLockedFace ? 'Replace artist photo' : 'Upload artist photo'}
            onClick={openFilePicker}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openFilePicker();
              }
            }}
            onDragEnter={event => {
              event.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragOver={event => {
              event.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragLeave={event => {
              event.preventDefault();
              setDragOver(false);
            }}
            onDrop={event => {
              event.preventDefault();
              setDragOver(false);
              if (!busy) acceptDroppedFile(event.dataTransfer.files);
            }}
          >
            {faceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faceUrl} alt="" className="owner-face-img" />
            ) : (
              <div className="owner-face-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 12a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5.5 19.25a6.5 6.5 0 0 1 13 0"
                  />
                </svg>
                <span>Drop a photo or browse</span>
              </div>
            )}
          </div>
        )}

        {isLockedFace ? (
          <p className="owner-look-caption">Locked · songs keep this face</p>
        ) : null}

        <button
          type="button"
          onClick={photoSrc ? handleUsePhoto : openFilePicker}
          disabled={busy || Boolean(photoSrc && !user)}
          className="btn-primary owner-look-upload"
        >
          {photoSrc
            ? uploading
              ? 'Uploading…'
              : 'Use this photo'
            : 'Upload photo'}
        </button>

        {photoSrc ? (
          <button
            type="button"
            onClick={() => handlePhotoChange(null)}
            disabled={busy}
            className="owner-look-remove"
          >
            Remove photo
          </button>
        ) : null}

        {error && (
          <p className="owner-look-error" role="alert">
            {error === SIGN_IN_AGAIN_MESSAGE ? (
              <>
                Your session expired.{' '}
                <Link href="/signin" className="underline font-medium hover:opacity-80">
                  Sign in again
                </Link>{' '}
                to continue.
              </>
            ) : (
              error
            )}
          </p>
        )}

        {showGeneratePath && (
          <div>
            <button
              type="button"
              onClick={() => setShowGenerate(open => !open)}
              aria-expanded={showGenerate}
              aria-controls={generatePanelId}
              className="owner-look-generate"
            >
              Or <u>generate a look</u>
            </button>
            {generatePanel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Artist look</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isLockMode ? (
            <>
              Upload a photo and frame the face, then use this photo to lock it. Songs will keep this face.
            </>
          ) : (
            <>
              Upload a photo and frame the face, then use this photo as the artist look. Songs will keep this face.
            </>
          )}
        </p>
      </div>

      <div>
        <label htmlFor={fileInputId} className="block text-sm font-medium mb-2 text-foreground">
          Photo
        </label>
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={busy}
          onChange={e => handlePhotoChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-accent/10 file:text-accent file:font-medium"
        />
        {photoSrc && (
          <div className="mt-4 space-y-3">
            <PhotoFrameEditor key={photoSrc} ref={frameRef} src={photoSrc} disabled={busy} />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleUsePhoto}
                disabled={busy || !user}
                className="px-4 py-2.5 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
              >
                {uploading ? 'Uploading…' : 'Use this photo'}
              </button>
              <button
                type="button"
                onClick={() => handlePhotoChange(null)}
                disabled={busy}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Remove photo
              </button>
            </div>
            {usingUploadedPhoto && (
              <p className="text-xs text-muted-foreground">
                {isLockMode ? 'This photo is locked as the artist look.' : 'This photo will be used as the artist look.'}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error === SIGN_IN_AGAIN_MESSAGE ? (
            <>
              Your session expired.{' '}
              <Link href="/signin" className="underline font-medium hover:opacity-80">
                Sign in again
              </Link>{' '}
              to continue.
            </>
          ) : (
            error
          )}
        </p>
      )}

      {showGeneratePath && (
        <div>
          <button
            type="button"
            onClick={() => setShowGenerate(open => !open)}
            aria-expanded={showGenerate}
            aria-controls={generatePanelId}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Or generate a look
          </button>

          {showGenerate && (
            <div id={generatePanelId} className="mt-4 space-y-4">
              <div>
                <label htmlFor={lookNotesId} className="block text-sm font-medium mb-2 text-foreground">
                  Look notes (optional)
                </label>
                <input
                  id={lookNotesId}
                  type="text"
                  maxLength={500}
                  value={lookNotes}
                  disabled={busy}
                  onChange={e => setLookNotes(e.target.value)}
                  placeholder="e.g. silver hair, neon jacket, 80s album-cover lighting"
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Optional notes plus the framed photo are sent as a reference.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateDisabled}
                className="w-full px-4 py-2.5 border border-border rounded-xl hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm text-foreground"
              >
                {generating ? 'Generating looks…' : 'Generate looks'}
              </button>

              {looks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Pick one generated look</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {looks.map((url, index) => {
                      const isSelected = selectedUrl === url;
                      return (
                        <button
                          key={url}
                          type="button"
                          onClick={() => onSelectedUrlChange(url)}
                          disabled={busy}
                          aria-pressed={isSelected}
                          aria-label={`Select look ${index + 1}`}
                          className={`relative aspect-square rounded-xl overflow-hidden ring-2 transition-all ${
                            isSelected ? 'ring-accent scale-[1.02]' : 'ring-transparent hover:ring-border'
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                  {allowClear && selectedUrl && (
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
          )}
        </div>
      )}
    </div>
  );
}
