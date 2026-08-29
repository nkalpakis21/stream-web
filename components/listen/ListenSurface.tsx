'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isStudioPath } from '@/lib/listen/surface';

/** Marks the document as listen (default) so Studio can opt out of listen tokens. */
export function ListenSurface() {
  const pathname = usePathname();
  const studio = isStudioPath(pathname);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('listen', !studio);
    root.dataset.surface = studio ? 'studio' : 'listen';
  }, [studio]);

  return null;
}
