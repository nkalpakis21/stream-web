import type { Metadata } from 'next';
import Link from 'next/link';
import { PRIVACY_EMAIL } from '@/lib/brand/site';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: { absolute: 'Support | Streamstar' },
  description:
    'Contact Streamstar support. How to sign in, create a song, and delete your account.',
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <h1 className="listen-h1 mb-4">Support</h1>
        <p className="mb-10 leading-relaxed text-muted-foreground">
          Email us and we will get back to you.
        </p>

        <div className="space-y-8 text-foreground">
          <section>
            <h2 className="mb-4 text-2xl font-semibold">Contact</h2>
            <p className="leading-relaxed text-muted-foreground">
              <a
                href={`mailto:${PRIVACY_EMAIL}`}
                className="font-medium text-accent hover:opacity-80"
              >
                {PRIVACY_EMAIL}
              </a>
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">How to create a song</h2>
            <p className="leading-relaxed text-muted-foreground">
              Sign in, open Studio, and go to Songs. Pick an artist you own, then add a title and a prompt. Create an artist first if you do not have one yet.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">How to sign in</h2>
            <p className="leading-relaxed text-muted-foreground">
              Open Sign in and continue with Apple, Google, or your email and password. New accounts use the same choices on Sign up.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">How to delete your account</h2>
            <p className="leading-relaxed text-muted-foreground">
              In the app, open You, then Delete account. Sign in again when asked. Deletion is permanent and removes your account, profile, artists, and songs.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold">Privacy</h2>
            <p className="leading-relaxed text-muted-foreground">
              Read the{' '}
              <Link href="/privacy" className="font-medium text-accent hover:opacity-80">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
