'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getFreshIdToken } from '@/lib/api/clientAuth';
import { ownerNoticeStatusAfterCall, type CoverModerationStatus } from '@/lib/covers/moderation';
import { CoverModerationNoticeView } from '@/components/songs/CoverModerationNoticeView';

/**
 * Owner-only. Flagged covers ask for another cover. A check error retries SafeSearch.
 * Fans do not render this.
 */
export function CoverModerationNotice({
  songId,
  message,
  action,
  buttonLabel,
  onResolved,
}: {
  songId: string;
  message: string;
  action: 'replace' | 'retry';
  buttonLabel: string;
  onResolved?: (status: CoverModerationStatus) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        const token = user ? await getFreshIdToken(user) : null;
        const response = await fetch(`/api/songs/${encodeURIComponent(songId)}/cover-moderation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action }),
        });
        const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
        const next = ownerNoticeStatusAfterCall(action, response.ok, body?.status);
        if (next) onResolved?.(next);
        if (response.ok) router.refresh();
      } catch (error) {
        console.error('[cover-moderation]', error instanceof Error ? error.message : 'error');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <CoverModerationNoticeView message={message} buttonLabel={buttonLabel} busy={busy} onClick={onClick} />
  );
}
