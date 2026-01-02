'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CreatePage() {
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
