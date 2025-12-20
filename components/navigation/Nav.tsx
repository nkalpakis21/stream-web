'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { NotificationsBell } from '@/components/navigation/NotificationsBell';

export function Nav() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/discover', label: 'Discover' },
    { href: '/artists', label: 'Artists' },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="sticky top-0 z-50 glass border-b border-border/40 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo */}
          <Link 
            href="/" 
            className="text-xl sm:text-2xl font-space-grotesk font-semibold tracking-tight hover:opacity-80 transition-opacity flex-shrink-0"
          >
            Stream ⭐
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                  isActive(link.href)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            
            {user ? (
              <>
                <div className="w-px h-6 bg-border mx-2" />
                <NotificationsBell />
                <Link
                  href="/create"
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                    isActive('/create')
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  Create
                </Link>
                <div className="w-px h-6 bg-border mx-2" />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground max-w-[140px] truncate">
                    {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/50 transition-all duration-200"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-px h-6 bg-border mx-2" />
                <Link
                  href="/create"
                  className="px-5 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-full hover:opacity-90 transition-opacity shadow-soft"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center gap-2">
            {user && (
              <>
                <NotificationsBell />
                <div className="w-px h-6 bg-border" />
              </>
            )}
            
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 py-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 text-base font-medium rounded-xl transition-all duration-200 ${
                    isActive(link.href)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              
              {user ? (
                <>
                  <Link
                    href="/create"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-3 text-base font-medium rounded-xl transition-all duration-200 ${
                      isActive('/create')
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    Create
                  </Link>
                  <div className="px-4 py-2 border-t border-border/50 mt-2">
                    <p className="text-xs text-muted-foreground mb-2 truncate">
                      {user.email}
                    </p>
                    <button
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/50 transition-all duration-200 text-left"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <Link
                  href="/create"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 text-base font-medium bg-accent text-accent-foreground rounded-xl hover:opacity-90 transition-opacity shadow-soft text-center"
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
