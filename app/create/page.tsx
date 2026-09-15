'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { currentReturnTo } from '@/lib/auth/returnTo';
import { studioHrefFromCreateSearch } from '@/lib/create/paths';

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

    router.replace(studioHrefFromCreateSearch(searchParams));
  }, [authLoading, user, router, searchParams]);

  if (authLoading) {
    return <CreateRedirectSpinner />;
  }

  if (!user) {
    const returnTo = currentReturnTo(
      '/create',
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    );
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-card/60 px-4 sm:px-6">
            <AuthGateCard
              headline="Sign in to create"
              why="You're one step from your first AI artist. After sign-in we'll take you straight to Create artist."
              returnTo={returnTo}
              primaryLabel="Continue with email"
              showCreateSteps
            />
          </div>
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
