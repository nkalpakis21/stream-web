'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { UserMenu } from '@/components/navigation/UserMenu';
import { Logo } from '@/components/branding/Logo';
import { CreateEntrySheet } from '@/components/create/CreateEntrySheet';
import { authHref } from '@/lib/auth/returnTo';
import { ANALYTICS_EVENTS, trackEvent } from '@/lib/analytics/track';
import { CREATE_ARTIST_HREF, STUDIO_NEW_ARTIST_HREF } from '@/lib/create/paths';
import { isCreatePath } from '@/lib/listen/surface';
import { useOwnedArtistCount } from '@/hooks/useOwnedArtistCount';

const navLinks = [
  { href: '/discover', label: 'Discover' },
  { href: '/artists', label: 'Artists' },
  { href: '/feed', label: 'Feed', requireAuth: true },
];

const iceCtaStyle = {
  minHeight: 44,
  borderRadius: 12,
  background: 'var(--accent-cta, #E8E6F2)',
  color: 'var(--accent-ink, #0A0A10)',
  fontSize: 14,
  lineHeight: '20px',
} as const;

const ghostCtaStyle = {
  minHeight: 44,
  borderRadius: 12,
  background: 'transparent',
  color: 'var(--ink, #F5F4F8)',
  border: '1px solid var(--line, #2A2A38)',
  fontSize: 14,
  lineHeight: '20px',
} as const;

export function SiteHeader() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { hasArtists } = useOwnedArtistCount();
  const [createOpen, setCreateOpen] = useState(false);
  const onAuthPage = pathname === '/signin' || pathname === '/signup';
  const hideLoggedOutCreate = onAuthPage || isCreatePath(pathname);
  const returnTo = onAuthPage ? '/discover' : pathname;
  const visibleLinks = navLinks.filter((link) => !link.requireAuth || user);

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}
    >
      <div
        className="mx-auto flex max-w-7xl items-center gap-3 px-3 sm:gap-4 sm:px-6"
        style={{ height: 'var(--header-h, 56px)' }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Logo variant="compact" className="max-[380px]:[&>span]:hidden" />
          <nav
            className="hidden min-w-0 items-center gap-0.5 overflow-x-auto sm:flex"
            aria-label="Primary"
          >
            {visibleLinks.map((link) => {
              const active =
                link.href === '/discover'
                  ? pathname === '/discover'
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex shrink-0 items-center px-2.5 font-medium transition-colors"
                  style={{
                    minHeight: 44,
                    fontSize: 14,
                    lineHeight: '20px',
                    color: active ? 'var(--ink)' : 'var(--mute)',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {hasArtists ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center px-3 font-semibold sm:px-4"
                  style={iceCtaStyle}
                  onClick={() => {
                    trackEvent(ANALYTICS_EVENTS.CTA_CREATE_HEADER);
                    setCreateOpen(true);
                  }}
                >
                  Create
                </button>
              ) : (
                <Link
                  href={STUDIO_NEW_ARTIST_HREF}
                  className="inline-flex items-center justify-center px-3 font-semibold sm:px-4"
                  style={iceCtaStyle}
                  onClick={() => trackEvent(ANALYTICS_EVENTS.CTA_CREATE_HEADER)}
                >
                  Create
                </Link>
              )}
              <UserMenu />
              <CreateEntrySheet open={createOpen} onOpenChange={setCreateOpen} />
            </>
          ) : (
            <>
              {hideLoggedOutCreate ? null : (
                <Link
                  href={CREATE_ARTIST_HREF}
                  className="inline-flex items-center justify-center px-3 font-semibold sm:px-4"
                  style={iceCtaStyle}
                  onClick={() => trackEvent(ANALYTICS_EVENTS.CTA_CREATE_HEADER)}
                >
                  Create artist
                </Link>
              )}
              <Link
                href={authHref('/signin', returnTo)}
                className="inline-flex items-center justify-center px-3 font-semibold sm:px-4"
                style={hideLoggedOutCreate ? iceCtaStyle : ghostCtaStyle}
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
