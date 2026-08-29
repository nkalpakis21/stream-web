'use client';

import Link from 'next/link';
import { BrandDeadEnd, listenPrimaryClass, listenSecondaryClass } from '@/components/states/BrandDeadEnd';

export function BrandError({ reset }: { reset: () => void }) {
  return (
    <BrandDeadEnd line="Couldn't load this.">
      <button type="button" onClick={reset} className={listenPrimaryClass}>
        Try again
      </button>
      <Link href="/discover" className={listenSecondaryClass}>
        Discover
      </Link>
    </BrandDeadEnd>
  );
}
