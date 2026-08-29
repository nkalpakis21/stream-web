'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authHref } from '@/lib/auth/returnTo';

interface AuthGateCardProps {
  headline: string;
  why: string;
  returnTo?: string;
}

export function AuthGateCard({ headline, why, returnTo }: AuthGateCardProps) {
  const pathname = usePathname();
  const dest = returnTo ?? pathname ?? '/discover';

  return (
    <div className="max-w-md mx-auto py-8 text-center">
      <h2 className="text-2xl font-bold tracking-tight mb-2 text-foreground">{headline}</h2>
      <p className="text-muted-foreground mb-6">{why}</p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href={authHref('/signin', dest)}
          className="inline-flex w-full sm:w-auto items-center justify-center px-6 py-3 bg-accent text-accent-foreground rounded-xl font-medium hover:opacity-90 transition-all shadow-lg"
        >
          Sign in
        </Link>
        <Link
          href={authHref('/signup', dest)}
          className="inline-flex w-full sm:w-auto items-center justify-center px-6 py-3 border border-border rounded-xl font-medium text-foreground hover:bg-muted transition-all"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
