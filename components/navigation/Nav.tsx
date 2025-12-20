'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { NotificationsBell } from '@/components/navigation/NotificationsBell';

export function Nav() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  const navLinks = [
    { href: '/discover', label: 'Discover' },
    { href: '/artists', label: 'Artists' },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="sticky top-0 z-50 glass border-b border-border/40 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link 
            href="/" 
            className="text-2xl font-semibold tracking-tight hover:opacity-80 transition-opacity"
          >
            Stream ⭐
          </Link>
          
          <div className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                  isActive(link.href)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
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
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  Create
                </Link>
                <div className="w-px h-6 bg-border mx-2" />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground hidden sm:block max-w-[120px] truncate">
                    {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-all duration-200"
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
        </div>
      </div>
    </nav>
  );
}

