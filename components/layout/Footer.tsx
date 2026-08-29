import Link from 'next/link';
import { Logo } from '@/components/branding/Logo';

const footerLinks = [
  { label: 'Discover', href: '/discover' },
  { label: 'Artists', href: '/artists' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-background py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6">
        <Logo className="self-start" />
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {footerLinks.map((link) => (
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
        </nav>
        <p className="text-xs text-muted-foreground">
          © {currentYear} Streamstar. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
