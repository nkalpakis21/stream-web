'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const isHomePage = usePathname() === '/';

  const footerClass = isHomePage
    ? 'border-t border-white/10 bg-indigo-950 mt-auto'
    : 'border-t border-border/50 bg-muted/30 mt-auto';

  const linkClass = (base: string) =>
    isHomePage
      ? `${base} text-white/70 hover:text-white transition-colors`
      : `${base} text-muted-foreground hover:text-foreground transition-colors`;

  const headingClass = isHomePage
    ? 'text-sm font-semibold text-white'
    : 'text-sm font-semibold text-foreground';

  const taglineClass = isHomePage
    ? 'text-sm text-white/70 max-w-xs'
    : 'text-sm text-muted-foreground max-w-xs';

  const copyrightClass = isHomePage
    ? 'text-xs text-white/60 text-center'
    : 'text-xs text-muted-foreground text-center';

  const dividerClass = isHomePage ? 'border-white/10' : 'border-border/50';

  const logoClass = isHomePage
    ? 'font-semibold text-xl sm:text-2xl text-white hover:opacity-80 transition-opacity'
    : 'font-semibold text-xl sm:text-2xl text-foreground hover:opacity-80 transition-opacity';

  return (
    <footer className={footerClass}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link href="/" className={logoClass}>
              Stream ⭐
            </Link>
            <p className={taglineClass}>
              Generate, collaborate, and discover music powered by AI.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-4">
            <h3 className={headingClass}>Navigation</h3>
            <nav className="flex flex-col gap-2">
              <Link href="/discover" className={linkClass('text-sm')}>
                Discover
              </Link>
              <Link href="/artists" className={linkClass('text-sm')}>
                Artists
              </Link>
              <Link href="/create" className={linkClass('text-sm')}>
                Create
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div className="flex flex-col gap-4">
            <h3 className={headingClass}>Legal</h3>
            <nav className="flex flex-col gap-2">
              <Link href="/privacy" className={linkClass('text-sm')}>
                Privacy Policy
              </Link>
              <Link href="/terms" className={linkClass('text-sm')}>
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>

        <div className={`mt-8 pt-8 border-t ${dividerClass}`}>
          <p className={copyrightClass}>
            © {currentYear} Stream ⭐. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

