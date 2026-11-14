import { NotFoundRecoveryShell } from '@/components/states/NotFoundRecoveryShell';
import { SongNotFoundRecovery } from '@/app/songs/[id]/SongNotFoundRecovery';

/**
 * Server not-found segment. notFound() in the page sets HTTP 404 before this
 * renders. Signed-out HTML is the dead-end copy. A signed-in hint swaps in a
 * spinner until the owner check fails.
 */
export default function SongNotFound() {
  return (
    <NotFoundRecoveryShell line="This song isn't on Streamstar.">
      <SongNotFoundRecovery />
    </NotFoundRecoveryShell>
  );
}
