'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { OneFlowCreate } from '@/components/create/OneFlowCreate';
import { currentReturnTo } from '@/lib/auth/returnTo';
import type { PublicStreamstarVoice } from '@/lib/voices/streamstarVoices';

function CreatePageContent({ voices }: { voices: readonly PublicStreamstarVoice[] }) {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="min-h-[70vh]" />;
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
              why="You're one step from your first AI artist. After sign-in we'll bring you back here with your draft."
              returnTo={returnTo}
              primaryLabel="Continue with email"
              showCreateSteps
            />
          </div>
        </main>
      </div>
    );
  }

  return <OneFlowCreate voices={voices} />;
}

export function CreatePageClient({ voices }: { voices: readonly PublicStreamstarVoice[] }) {
  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <CreatePageContent voices={voices} />
    </Suspense>
  );
}
