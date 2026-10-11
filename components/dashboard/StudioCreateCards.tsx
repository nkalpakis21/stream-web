import Link from 'next/link';

/** Static studio actions. Shown in the skeleton and the loaded overview so the cards do not move. */
export function StudioCreateCards() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <Link
        href="/dashboard?tab=artists&new=1"
        className="group rounded-xl border border-white/10 bg-card/60 p-6 transition-colors hover:border-primary/40 sm:p-8"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Create</p>
        <h3 className="mt-2 text-xl font-bold text-foreground">Artist</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Photo first. Name, lore, voice. Coin optional.
        </p>
        <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
          Open
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </Link>

      <Link
        href="/dashboard?tab=songs&new=1"
        className="group rounded-xl border border-white/10 bg-card/60 p-6 transition-colors hover:border-primary/40 sm:p-8"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Generate</p>
        <h3 className="mt-2 text-xl font-bold text-foreground">Song</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick an artist, title, prompt. One generation.
        </p>
        <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
          Open
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </Link>
    </div>
  );
}
