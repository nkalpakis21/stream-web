'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  RECOVERY_REVEAL_MS,
  idFromNotFoundPath,
  readSignedInHint,
  recoveryDecision,
  recoveryStorageKey,
  syncSignedInHint,
  type NotFoundKind,
} from '@/lib/auth/notFoundRecovery';

function settleNotFound() {
  document.documentElement.setAttribute('data-ss-recover-settled', '');
}

function showSignedInPending() {
  document.documentElement.setAttribute('data-ss-signed-in', '');
  document.documentElement.removeAttribute('data-ss-recover-settled');
}

function markSignedIn() {
  document.documentElement.setAttribute('data-ss-signed-in', '');
}

function alreadyRecovered(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

function markRecovered(key: string): boolean {
  try {
    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * After the viewer cookie is stored, reload once if the Bearer read is OK.
 * Non-owners get a 404 from that read and never reload.
 */
export function useOwnerNotFoundRecovery(kind: NotFoundKind, viewerPath: string) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const started = useRef(false);

  useLayoutEffect(() => {
    if (readSignedInHint(window.localStorage)) showSignedInPending();
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    syncSignedInHint(window.localStorage, Boolean(user));
    if (!user) {
      document.documentElement.removeAttribute('data-ss-signed-in');
      settleNotFound();
      return;
    }
    markSignedIn();
  }, [loading, user]);

  useEffect(() => {
    const timer = window.setTimeout(settleNotFound, RECOVERY_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || !user || started.current) return;
    const id = idFromNotFoundPath(kind, pathname);
    if (!id) {
      settleNotFound();
      return;
    }
    started.current = true;
    let cancelled = false;

    const api =
      kind === 'song'
        ? `/api/songs/${encodeURIComponent(id)}`
        : `/api/artists/${encodeURIComponent(id)}`;

    void (async () => {
      try {
        const token = await user.getIdToken();
        const session = await fetch(viewerPath, {
          method: 'POST',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!session.ok) {
          if (!cancelled) settleNotFound();
          return;
        }
        const response = await fetch(api, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const key = recoveryStorageKey(kind, id);
        if (
          recoveryDecision({
            responseOk: response.ok,
            alreadyRecovered: alreadyRecovered(key),
          }) !== 'reload'
        ) {
          settleNotFound();
          return;
        }
        if (!markRecovered(key)) {
          settleNotFound();
          return;
        }
        window.location.reload();
      } catch {
        if (!cancelled) settleNotFound();
      }
    })();

    return () => {
      cancelled = true;
      started.current = false;
    };
  }, [kind, loading, pathname, user, viewerPath]);
}
