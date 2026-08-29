'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { currentReturnTo } from '@/lib/auth/returnTo';

function CreateRedirectSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function CreatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return;

    const step = searchParams.get('step');
    const artistId = searchParams.get('artistId');

    if (step === 'artist') {
      router.replace('/dashboard?tab=artists');
    } else if (step === 'song') {
      router.replace(`/dashboard?tab=songs${artistId ? `&artistId=${artistId}` : ''}`);
    } else {
      router.replace('/dashboard');
    }
  }, [authLoading, user, router, searchParams]);

  if (authLoading) {
    return <CreateRedirectSpinner />;
  }

  if (!user) {
    const returnTo = currentReturnTo('/create', searchParams.toString() ? `?${searchParams.toString()}` : '');
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="mb-8">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-2">Create</h1>
            <p className="text-lg text-muted-foreground">
              Sign in to create artists and songs.
            </p>
          </div>
          <AuthGateCard
            headline="Sign in to create"
            why="Create artists and generate songs after you sign in."
            returnTo={returnTo}
          />
        </main>
      </div>
    );
  }

  return <CreateRedirectSpinner />;
}

export default function CreatePage() {
  return (
    <Suspense fallback={<CreateRedirectSpinner />}>
      <CreatePageContent />
    </Suspense>
  );
}
