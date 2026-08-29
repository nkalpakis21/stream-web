'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { UserMenu } from '@/components/navigation/UserMenu';
import { Logo } from '@/components/branding/Logo';
import { LogoIcon } from '@/components/branding/LogoIcon';

const navLinks = [
  { href: '/discover', label: 'Discover' },
  { href: '/artists', label: 'Artists' },
  { href: '/feed', label: 'Feed', requireAuth: true },
  { href: '/chat', label: 'Chat', requireAuth: true },
];

export function SiteHeader() {
  const { user } = useAuth();
  const pathname = usePathname();

  const visibleLinks = navLinks.filter((link) => !link.requireAuth || user);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          <span className="hidden min-[390px]:block">
            <Logo variant="compact" />
          </span>
          <Link href="/" className="min-[390px]:hidden" aria-label="Streamstar home">
            <LogoIcon size={28} />
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {visibleLinks.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  active
                    ? 'text-foreground bg-secondary/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <UserMenu />
          ) : (
            <>
              <Link
                href="/signin"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
