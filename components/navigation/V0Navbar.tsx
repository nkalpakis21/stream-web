'use client';

import { useState } from 'react';
import { Music, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { UserMenu } from '@/components/navigation/UserMenu';

const navLinks = [
  { label: 'Feed', href: '/feed', requireAuth: true },
  { label: 'Discover', href: '/discover' },
  { label: 'Artists', href: '/artists' },
  { label: 'Chat', href: '/chat', requireAuth: true },
];

export function V0Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const pathname = usePathname();

  const visibleNavLinks = navLinks.filter((link) => !link.requireAuth || user);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Music className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight font-mono text-foreground">Stream ⭐</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {visibleNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                pathname === link.href
                  ? 'text-foreground bg-secondary/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Link
              href="/dashboard"
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                pathname?.startsWith('/dashboard')
                  ? 'text-foreground bg-secondary/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              Dashboard
            </Link>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <UserMenu />
          ) : (
            <>
              <Link
                href="/signin"
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signin"
                className="px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          {user && <UserMenu />}
          <button
            className="p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="flex flex-col px-6 py-4 gap-1">
            {visibleNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-all"
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-all"
              >
                Dashboard
              </Link>
            ) : (
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border/50">
                <Link
                  href="/signin"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground text-center rounded-lg"
                >
                  Log in
                </Link>
                <Link
                  href="/signin"
                  onClick={() => setMobileOpen(false)}
                  className="px-5 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg text-center hover:opacity-90 transition-opacity"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
