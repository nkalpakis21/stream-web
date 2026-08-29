'use client';

import { BrandError } from '@/components/states/BrandError';

export default function ArtistError({ reset }: { error: Error; reset: () => void }) {
  return <BrandError reset={reset} />;
}
