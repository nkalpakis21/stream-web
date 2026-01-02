'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CreatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Preserve step and artistId params if they exist
    const step = searchParams.get('step');
    const artistId = searchParams.get('artistId');
    
    if (step === 'artist') {
      router.replace('/dashboard?tab=artists');
    } else if (step === 'song') {
      router.replace(`/dashboard?tab=songs${artistId ? `&artistId=${artistId}` : ''}`);
    } else {
      router.replace('/dashboard');
    }
  }, [router, searchParams]);

  return null;
}

export default function CreatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CreatePageContent />
    </Suspense>
  );
}
