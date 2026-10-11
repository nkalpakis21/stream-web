'use client';

import { useOwnerNotFoundRecovery } from '@/components/states/useOwnerNotFoundRecovery';

/**
 * The document is already a 404. A signed-in viewer posts /api/auth/viewer,
 * then reloads once if GET /api/songs/[id] is OK. Non-owners never reload.
 */
export function SongNotFoundRecovery() {
  useOwnerNotFoundRecovery('song', '/api/auth/viewer');
  return null;
}
