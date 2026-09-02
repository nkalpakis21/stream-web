'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Logo } from '@/components/branding/Logo';
import Link from 'next/link';
import { authHref, getSafeReturnTo } from '@/lib/auth/returnTo';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';

const MIN_PASSWORD_LENGTH = 8;

function AuthLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function SignUpPageContent() {
  const { user, loading: authLoading, signInWithGoogle, signUpWithEmail } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string; terms?: string }>({});

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(returnTo);
    }
  }, [user, authLoading, router, returnTo]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nextFields: { password?: string; confirm?: string; terms?: string } = {};

    if (!agreedToTerms) {
      nextFields.terms = 'Agree to the Terms to sign up.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      nextFields.password = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (password !== confirmPassword) {
      nextFields.confirm = 'Passwords do not match';
    }
    setFieldError(nextFields);
    if (nextFields.terms || nextFields.password || nextFields.confirm) {
      return;
    }

    setLoading(true);

    try {
      await signUpWithEmail(email, password);
      router.replace(returnTo);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service to create an account.');
      return;
    }
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
              Sign up
            </h1>
            <p className="text-lg text-muted-foreground">
              Create your Streamstar account
            </p>
          </div>

          <div className="bg-card p-8 lg:p-10 rounded-xl shadow-lg border border-border">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                {error}
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
                <label htmlFor="password" className="block text-sm font-medium mb-2 text-foreground">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="••••••••"
                  minLength={MIN_PASSWORD_LENGTH}
                />
                {fieldError.password ? (
                  <p className="mt-1.5 text-xs text-red-500">{fieldError.password}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Must be at least {MIN_PASSWORD_LENGTH} characters
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-foreground">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="••••••••"
                  minLength={MIN_PASSWORD_LENGTH}
                />
                {fieldError.confirm ? (
                  <p className="mt-1.5 text-xs text-red-500">{fieldError.confirm}</p>
                ) : null}
              </div>

              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={e => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  required
                />
                <span>
                  I agree to the{' '}
                  <Link href="/terms" className="text-accent hover:opacity-80 font-medium">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-accent hover:opacity-80 font-medium">
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {fieldError.terms ? (
                <p className="text-xs text-red-500">{fieldError.terms}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || !agreedToTerms}
                className="w-full px-6 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl mt-6"
              >
                {loading ? 'Signing up...' : 'Sign up'}
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
              <GoogleAuthButton
                onClick={handleGoogleAuth}
                disabled={loading || !agreedToTerms}
                loading={loading}
              />
            </div>

            <div className="text-center text-sm pt-4 border-t border-border">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link
                href={authHref('/signin', returnTo)}
                className="text-accent hover:opacity-80 transition-opacity font-medium"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignUpPageContent />
    </Suspense>
  );
}
