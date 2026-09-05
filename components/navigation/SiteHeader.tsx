'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { UserMenu } from '@/components/navigation/UserMenu';
import { Logo } from '@/components/branding/Logo';
import { authHref } from '@/lib/auth/returnTo';

const navLinks = [
  { href: '/discover', label: 'Discover' },
  { href: '/artists', label: 'Artists' },
  { href: '/feed', label: 'Feed', requireAuth: true },
];

export function SiteHeader() {
  const { user } = useAuth();
  const pathname = usePathname();
  const onAuthPage = pathname === '/signin' || pathname === '/signup';
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
          <Logo variant="compact" />
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

        <div className="ml-auto flex shrink-0 items-center">
          {user ? (
            <UserMenu />
          ) : (
            <Link
              href={authHref('/signin', returnTo)}
              className="inline-flex items-center justify-center px-4 font-semibold"
              style={{
                minHeight: 44,
                borderRadius: 12,
                background: 'var(--accent-cta)',
                color: 'var(--accent-ink)',
                fontSize: 14,
                lineHeight: '20px',
              }}
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
