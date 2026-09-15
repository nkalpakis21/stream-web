'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authHref } from '@/lib/auth/returnTo';

const CREATE_STEPS = [
  { id: 'account', label: 'Account' },
  { id: 'artist', label: 'Artist' },
  { id: 'song', label: 'Song' },
] as const;

interface AuthGateCardProps {
  headline: string;
  why: string;
  returnTo?: string;
  primaryLabel?: string;
  showCreateSteps?: boolean;
}

export function AuthGateCard({
  headline,
  why,
  returnTo,
  primaryLabel = 'Sign in',
  showCreateSteps = false,
}: AuthGateCardProps) {
  const pathname = usePathname();
  const dest = returnTo ?? pathname ?? '/discover';

  return (
    <div className="mx-auto max-w-md py-8 text-center">
      <h2 className="mb-2 text-2xl font-bold tracking-tight text-foreground">{headline}</h2>
      <p className="mb-6 text-muted-foreground">{why}</p>
      {showCreateSteps ? (
        <ol className="mb-6 flex items-center justify-center gap-2 text-sm">
          {CREATE_STEPS.map((step, index) => {
            const active = index === 0;
            return (
              <li key={step.id} className="flex items-center gap-2">
                {index > 0 ? (
                  <span className="block h-px w-6 bg-border" aria-hidden />
                ) : null}
                <span className="flex items-center gap-2">
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--line)',
                    }}
                    aria-hidden
                  />
                  <span className={active ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                    {step.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={authHref('/signin', dest)}
          className="inline-flex w-full items-center justify-center rounded-xl bg-accent-cta px-6 py-3 font-medium text-accent-ink shadow-lg transition-all hover:opacity-90 sm:w-auto"
        >
          {primaryLabel}
        </Link>
        <Link
          href={authHref('/signup', dest)}
          className="inline-flex w-full items-center justify-center rounded-xl border border-border px-6 py-3 font-medium text-foreground transition-all hover:bg-muted sm:w-auto"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
