'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { isWhitelistedInvestorEmail } from '@/lib/investing/whitelist';

const HOW_IT_WORKS = [
  'Create the artist (voice + look consistency is next)',
  'Generate the catalog',
  'Run the artist (share, follows, community)',
  'Optional: coin on pump.fun',
  'Later: X',
] as const;

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        {children}
      </div>
    </div>
  );
}

function LoadingGate() {
  return (
    <GateShell>
      <div
        className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin"
        aria-label="Loading"
      />
    </GateShell>
  );
}

function SignInGate({
  onSignIn,
}: {
  onSignIn: () => Promise<void>;
}) {
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await onSignIn();
    } catch (error) {
      console.error('Sign in failed:', error);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <GateShell>
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Investor Access</h1>
        <p className="text-muted-foreground mb-6">
          Please sign in to continue
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <GoogleMark />
          {signingIn ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    </GateShell>
  );
}

function DeniedGate() {
  return (
    <GateShell>
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-2">
          This page is restricted to authorized investors only.
        </p>
        <p className="text-sm text-muted-foreground">
          If you believe you should have access, please contact us.
        </p>
      </div>
    </GateShell>
  );
}

function GoogleMark() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary mb-4">
      {children}
    </p>
  );
}

function InvestingMemo() {
  return (
    <div className="min-h-screen bg-background">
      <main className="relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:py-24 space-y-24 md:space-y-32">
          <section className="text-center space-y-6">
            <h1 className="font-playfair text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-balance leading-[1.1]">
              Manage AI artists. Own the catalog.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed text-pretty max-w-2xl mx-auto">
              Suno generates a track. Streamstar is where you build and run an
              AI artist — consistent voice, consistent look, a real catalog.
            </p>
            <p className="text-sm md:text-base text-muted-foreground/80">
              Optional coin on pump.fun. X comes later.
            </p>
          </section>

          <section>
            <SectionLabel>Category</SectionLabel>
            <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                AI music today is a prompt box. You get a song, then nothing: no
                artist, no identity, no catalog, no manager.
              </p>
              <p>
                Suno and Udio optimized for one-shot generation. That is not a
                company around an artist.
              </p>
            </div>
          </section>

          <section>
            <SectionLabel>Product</SectionLabel>
            <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                You create an AI artist and generate songs into that
                artist&apos;s catalog. You are the manager — identity, releases,
                audience. Consistent voice and look is the loop we&apos;re
                building, not what&apos;s live today.
              </p>
              <p>
                Optional: launch a pump.fun coin for the artist. Distribution on
                X is next, not live.
              </p>
            </div>
          </section>

          <section>
            <SectionLabel>How it works</SectionLabel>
            <ol className="space-y-3">
              {HOW_IT_WORKS.map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-4 rounded-2xl border border-border/50 bg-card/40 px-5 py-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-foreground leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <SectionLabel>Live vs not</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-6">
                <p className="text-sm font-semibold text-primary mb-3">Live</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  AI artists, generation, catalogs, social (comments, follows,
                  chat). Pump.fun opt-in on create; launch is not live.
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
                <p className="text-sm font-semibold text-foreground mb-3">
                  Not live
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Consistent voice + look. Pump.fun launch. X.
                </p>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>Why this vs Suno</SectionLabel>
            <div className="space-y-3">
              {[
                {
                  label: 'Suno / Udio',
                  text: 'a song, no artist to manage.',
                },
                {
                  label: 'Spotify',
                  text: 'listen, you do not create.',
                },
                {
                  label: 'We sit in the gap',
                  text: 'persistent AI artists you manage.',
                },
              ].map(row => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-border/50 bg-card/40 px-5 py-4"
                >
                  <p className="text-sm font-semibold text-foreground mb-1">
                    {row.label}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {row.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel>Traction</SectionLabel>
            <p className="text-lg text-muted-foreground">
              Live at streamstar.xyz.
            </p>
          </section>

          <section>
            <SectionLabel>Team</SectionLabel>
            <div className="rounded-2xl border border-border/50 bg-card/40 px-5 py-6">
              <p className="text-xl font-semibold text-foreground">
                Nick Kalpakis
              </p>
              <p className="text-muted-foreground mt-1">Founder</p>
            </div>
          </section>

          <section>
            <SectionLabel>The ask</SectionLabel>
            <div className="rounded-2xl border border-border/50 bg-card/40 p-6 md:p-8 space-y-6">
              <div>
                <p className="text-4xl md:text-5xl font-semibold tracking-tight">
                  $500k pre-seed
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Working ask
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  Use of funds
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Product (artist-manager loop + optional coin), then growth.
                </p>
              </div>
            </div>
          </section>

          <section className="text-center pb-8">
            <a
              href="https://streamstar.xyz"
              className="text-xl md:text-2xl font-medium text-foreground hover:text-primary transition-colors"
            >
              streamstar.xyz
            </a>
          </section>
        </div>
      </main>
    </div>
  );
}

export function InvestingPageClient() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAuthorized(false);
      return;
    }

    setAuthorized(isWhitelistedInvestorEmail(user.email));
  }, [user, authLoading]);

  if (authLoading || authorized === null) {
    return <LoadingGate />;
  }

  if (!user) {
    return <SignInGate onSignIn={signInWithGoogle} />;
  }

  if (authorized === false) {
    return <DeniedGate />;
  }

  return <InvestingMemo />;
}
