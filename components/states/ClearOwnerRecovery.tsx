'use client';

import { useEffect } from 'react';
import { recoveryStorageKey, type NotFoundKind } from '@/lib/auth/notFoundRecovery';

/** The real page rendered, so a later stale cookie can recover again. */
export function ClearOwnerRecovery({ kind, id }: { kind: NotFoundKind; id: string }) {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(recoveryStorageKey(kind, id));
    } catch {
      // Private mode can reject storage. The reload guard simply stays.
    }
  }, [kind, id]);

  return null;
}
