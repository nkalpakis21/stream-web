'use client';

import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 bg-muted/30 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="font-semibold text-xl sm:text-2xl hover:opacity-80 transition-opacity">
              Stream ⭐
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Generate, collaborate, and discover music powered by AI.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-foreground">Navigation</h3>
            <nav className="flex flex-col gap-2">
              <Link
                href="/discover"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Discover
              </Link>
              <Link
                href="/artists"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Artists
              </Link>
              <Link
                href="/create"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Create
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <nav className="flex flex-col gap-2">
              <Link
                href="/privacy"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            © {currentYear} Stream ⭐. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

