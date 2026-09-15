'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isCreatePath, isStudioPath } from '@/lib/listen/surface';

/** Marks the document as listen (default) so Studio can opt out of listen tokens. */
export function ListenSurface() {
  const pathname = usePathname();
  const studio = isStudioPath(pathname);
  const listen = !studio || isCreatePath(pathname);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('listen', listen);
    root.dataset.surface = listen ? 'listen' : 'studio';
  }, [listen]);

  return null;
}
