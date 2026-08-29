'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { authHref } from '@/lib/auth/returnTo';

const tabs = [
  {
    href: '/',
    label: 'Home',
    match: (path: string) => path === '/',
    icon: (active: boolean) => (
      <svg className="h-6 w-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/discover',
    label: 'Discover',
    match: (path: string) => path.startsWith('/discover') || path.startsWith('/songs'),
    icon: () => (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    href: '/artists',
    label: 'Artists',
    match: (path: string) => path.startsWith('/artists'),
    icon: () => (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const youHref = user ? '/dashboard' : authHref('/signin', pathname);
  const youLabel = user ? 'You' : 'Log in';
  const youActive = pathname.startsWith('/dashboard') || pathname.startsWith('/me') || pathname.startsWith('/signin') || pathname.startsWith('/signup');

  return (
    <nav
      data-mobile-nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/98 md:hidden supports-[backdrop-filter]:bg-card/95 supports-[backdrop-filter]:backdrop-blur-xl"
      aria-label="Mobile"
      style={{
        height: 'calc(var(--tab-h, 56px) + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex h-[var(--tab-h,56px)] items-center justify-around px-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {tab.icon(active)}
              {tab.label}
            </Link>
          );
        })}
        <Link
          href={youHref}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
            youActive ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {youLabel}
        </Link>
      </div>
    </nav>
  );
}
