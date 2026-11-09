/**
 * Signed-in create milestones. POST /api/funnel rejects these without a
 * bearer token. face_set is only sent for upload or generate.
 */

import { auth } from '@/lib/firebase/config';
import { webPlatformHeaders } from '@/lib/funnel/platform';
import type { CreateSubmittedFace, FaceSetMethod } from '@/lib/server/funnel';

export async function reportCreateMilestone(
  event: 'create_started' | 'face_set' | 'create_submitted',
  props?: { method?: FaceSetMethod; face?: CreateSubmittedFace }
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  const response = await fetch('/api/funnel', {
    method: 'POST',
    keepalive: true,
    headers: webPlatformHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      event,
      ...(props?.method ? { method: props.method } : {}),
      ...(props?.face ? { face: props.face } : {}),
    }),
  });
  if (!response.ok) {
    console.error('[funnel]', event, response.status);
  }
}
