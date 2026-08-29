'use client';

import { BrandError } from '@/components/states/BrandError';

export default function SongError({ reset }: { error: Error; reset: () => void }) {
  return <BrandError reset={reset} />;
}
