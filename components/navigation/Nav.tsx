'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { UserMenu } from '@/components/navigation/UserMenu';

export function Nav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHomePage = pathname === '/';

  const navLinks = [
    { href: '/feed', label: 'Feed', requireAuth: true },
    { href: '/discover', label: 'Discover' },
    { href: '/artists', label: 'Artists' },
    { href: '/chat', label: 'Chat', requireAuth: true },
  ];

  const isActive = (href: string) => pathname === href;

  // Seamless glass nav: transparent on homepage to let gradient flow through; subtle glass elsewhere
  const navBarClass = isHomePage
    ? 'sticky top-0 z-50 bg-transparent border-b border-white/10 backdrop-blur-sm'
    : 'sticky top-0 z-50 bg-background/60 border-b border-white/10 backdrop-blur-md';

  const linkClass = (active: boolean) =>
    isHomePage
      ? `text-sm font-medium transition-colors duration-200 ${active ? 'text-white' : 'text-white/70 hover:text-white'}`
      : `text-sm font-medium transition-colors duration-200 ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`;

  const logoClass = isHomePage
    ? 'text-lg font-semibold tracking-tight text-white hover:opacity-80 transition-opacity duration-200 flex-shrink-0'
    : 'text-lg font-semibold tracking-tight text-foreground hover:opacity-70 transition-opacity duration-200 flex-shrink-0';

  const signInClass = isHomePage
    ? 'text-sm font-medium text-white hover:opacity-80 transition-opacity duration-200'
    : 'text-sm font-medium text-accent hover:opacity-80 transition-opacity duration-200';

  return (
    <nav className={navBarClass}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Logo */}
          <Link href="/" className={logoClass}>
            Stream ⭐
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              if (link.requireAuth && !user) return null;
              return (
                <Link key={link.href} href={link.href} className={linkClass(isActive(link.href))}>
                  {link.label}
                </Link>
              );
            })}
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className={linkClass(pathname?.startsWith('/dashboard') ?? false)}
                >
                  Dashboard
                </Link>
                <div className={`w-px h-4 mx-1 ${isHomePage ? 'bg-white/20' : 'bg-border/50'}`} />
                <UserMenu />
              </>
            ) : (
              <Link href="/signin" className={signInClass}>
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center gap-3">
            {user && <UserMenu />}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 ${
                isHomePage ? 'hover:bg-white/10' : 'hover:bg-muted/50'
              }`}
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg className={`w-5 h-5 ${isHomePage ? 'text-white' : 'text-foreground'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className={`w-5 h-5 ${isHomePage ? 'text-white' : 'text-foreground'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            className={`md:hidden py-3 animate-in slide-in-from-top-2 duration-200 ${
              isHomePage ? 'border-t border-white/10 bg-blue-950/50 backdrop-blur-sm' : 'border-t border-border/40'
            }`}
          >
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => {
                if (link.requireAuth && !user) return null;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-2.5 text-base font-medium rounded-lg transition-colors duration-200 ${
                      isHomePage
                        ? isActive(link.href)
                          ? 'text-white bg-white/10'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                        : isActive(link.href)
                          ? 'text-foreground bg-muted/50'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {user ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-2.5 text-base font-medium rounded-lg transition-colors duration-200 ${
                    isHomePage
                      ? pathname?.startsWith('/dashboard')
                        ? 'text-white bg-white/10'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                      : pathname?.startsWith('/dashboard')
                        ? 'text-foreground bg-muted/50'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-2.5 text-base font-medium transition-opacity duration-200 ${
                    isHomePage ? 'text-white hover:opacity-80' : 'text-accent hover:opacity-80'
                  }`}
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
