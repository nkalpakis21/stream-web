'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Logo } from '@/components/branding/Logo';
import Link from 'next/link';
import { authHref, getSafeReturnTo } from '@/lib/auth/returnTo';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';

function AuthLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function SignInPageContent() {
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail, resetPassword } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(returnTo);
    }
  }, [user, authLoading, router, returnTo]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      router.replace(returnTo);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setResetSent(false);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace(returnTo);
    } catch (err: any) {
      setError(err.message || 'Google authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setResetSent(false);
    if (!email.trim()) {
      setError('Enter your email to reset your password.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Could not send a reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <AuthLoading />;
  }

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="mb-6 flex justify-center">
              <Logo />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-3 text-foreground">
              Sign in
            </h1>
            <p className="text-lg text-muted-foreground">
              Sign in to Streamstar
            </p>
          </div>

          <div className="bg-card p-8 lg:p-10 rounded-xl shadow-lg border border-border">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                {error}
              </div>
            )}

            {resetSent && (
              <div className="mb-6 p-4 bg-accent/10 border border-accent/20 text-foreground rounded-xl text-sm">
                Check your email for a password reset link.
              </div>
            )}

            <form onSubmit={handleEmailAuth} noValidate className="mb-6 space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2 text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-sm text-accent hover:opacity-80 transition-opacity font-medium disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl mt-6"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-card text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="mb-6">
              <GoogleAuthButton onClick={handleGoogleAuth} disabled={loading} loading={loading} />
            </div>

            <div className="text-center text-sm pt-4 border-t border-border">
              <span className="text-muted-foreground">Don&apos;t have an account? </span>
              <Link
                href={authHref('/signup', returnTo)}
                className="text-accent hover:opacity-80 transition-opacity font-medium"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignInPageContent />
    </Suspense>
  );
}
