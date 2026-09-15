'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ANALYTICS_EVENTS, trackEvent } from '@/lib/analytics/track';
import { STUDIO_NEW_ARTIST_HREF, STUDIO_NEW_SONG_HREF } from '@/lib/create/paths';

interface CreateEntrySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEntrySheet({ open, onOpenChange }: CreateEntrySheetProps) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const go = (href: string, eventName: string) => {
    trackEvent(eventName);
    onOpenChange(false);
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Close create"
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-entry-title"
        className="relative w-full max-w-md rounded-xl border border-white/10 bg-card p-6 shadow-xl sm:p-8"
      >
        <h2
          id="create-entry-title"
          className="font-playfair text-[28px] font-semibold tracking-tight text-foreground sm:text-[34px]"
        >
          Create
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Managers only. Listening stays on home.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => go(STUDIO_NEW_SONG_HREF, ANALYTICS_EVENTS.CREATE_SHEET_SONG)}
            className="w-full rounded-xl border border-white/10 bg-card/60 p-4 text-left transition-colors hover:border-primary/40"
          >
            <p className="text-base font-semibold text-foreground">New song</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate for one of your artists. One generation.
            </p>
          </button>
          <button
            type="button"
            onClick={() => go(STUDIO_NEW_ARTIST_HREF, ANALYTICS_EVENTS.CREATE_SHEET_ARTIST)}
            className="w-full rounded-xl border border-white/10 bg-card/60 p-4 text-left transition-colors hover:border-primary/40"
          >
            <p className="text-base font-semibold text-foreground">New artist</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Photo first. Name, lore, voice. Coin optional.
            </p>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="listen-btn-ghost mt-6"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
