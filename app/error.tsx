'use client';

import { BrandError } from '@/components/states/BrandError';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <BrandError reset={reset} />;
}
