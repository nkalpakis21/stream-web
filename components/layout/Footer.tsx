import Link from 'next/link';
import { Logo } from '@/components/branding/Logo';

const footerLinks = {
  Product: [
    { label: 'Discover', href: '/discover' },
    { label: 'Artists', href: '/artists' },
  ],
  Community: [
    { label: 'Feed', href: '/feed' },
    { label: 'Chat', href: '/chat' },
  ],
  Legal: [
    { label: 'Terms', href: '/terms' },
    { label: 'Privacy', href: '/privacy' },
  ],
};

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/50 bg-background py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-2">
            <Logo className="mb-4" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Listen, create, trade.
            </p>
          </div>

          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="mb-4 text-sm font-semibold text-foreground">{heading}</h4>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground/60">
            © {currentYear} Streamstar. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
