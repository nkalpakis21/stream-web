'use client';

import Link from 'next/link';
import { ANALYTICS_EVENTS, trackEvent } from '@/lib/analytics/track';
import { CREATE_ARTIST_HREF, STUDIO_NEW_ARTIST_HREF } from '@/lib/create/paths';

export function LoggedOutCreateBand() {
  const keepListening = () => {
    document.getElementById('listen-featured')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-card/60 p-5 sm:p-6">
      <h2 className="font-playfair font-semibold tracking-[-0.02em] text-[#E8E6F2] text-[40px] leading-[44px] sm:text-[48px] sm:leading-[52px] md:text-[64px] md:leading-[68px]">
        Create music. Go viral. Earn.
      </h2>
      <p className="mt-4 max-w-[34ch] font-sans text-[16px] font-normal leading-[23px] text-muted-foreground sm:text-[18px] sm:leading-[26px]">
        AI builds your artist, makes the songs, and monetizes them for you.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={CREATE_ARTIST_HREF}
          className="listen-btn-primary"
          onClick={() => trackEvent(ANALYTICS_EVENTS.CTA_CREATE_HOME_LOGGED_OUT)}
        >
          Create your first artist
        </Link>
        <button type="button" className="listen-btn-ghost" onClick={keepListening}>
          Keep listening
        </button>
      </div>
    </section>
  );
}

export function LoggedInEmptyCreateBanner() {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-card/60 p-5 sm:p-6">
      <h2 className="listen-h1 text-foreground">You&apos;re ready to manage.</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
        No artists yet. Create your first AI artist, then generate a song.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={STUDIO_NEW_ARTIST_HREF} className="listen-btn-primary">
          Create your first artist
        </Link>
        <Link href="/dashboard" className="listen-btn-ghost">
          Open Studio
        </Link>
      </div>
    </section>
  );
}
