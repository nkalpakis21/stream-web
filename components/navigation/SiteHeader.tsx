'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { UserMenu } from '@/components/navigation/UserMenu';
import { Logo } from '@/components/branding/Logo';
import { LogoIcon } from '@/components/branding/LogoIcon';
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
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div
        className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6"
        style={{ height: 'var(--header-h, 56px)' }}
      >
        <div className="min-w-0 shrink-0">
          <span className="hidden min-[390px]:block">
            <Logo variant="compact" />
          </span>
          <Link href="/" className="min-[390px]:hidden" aria-label="Streamstar home">
            <LogoIcon size={28} />
          </Link>
        </div>

        <nav
          className="flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-x-auto sm:gap-1 md:flex-none md:justify-center"
          aria-label="Primary"
        >
          {visibleLinks.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 border-b-2 px-2 py-2 text-sm font-medium transition-colors sm:px-3 ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user ? (
            <UserMenu />
          ) : (
            <Link
              href={authHref('/signin', returnTo)}
              className="inline-flex items-center px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:px-0"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
