import { NotFoundRecoveryShell } from '@/components/states/NotFoundRecoveryShell';
import { ArtistNotFoundRecovery } from '@/app/artists/[id]/ArtistNotFoundRecovery';

/**
 * Server not-found segment. notFound() in the page sets HTTP 404 before this
 * renders. Signed-out HTML is the dead-end copy. A signed-in hint swaps in a
 * spinner until the owner check fails.
 */
export default function ArtistNotFound() {
  return (
    <NotFoundRecoveryShell line="This artist isn't on Streamstar.">
      <ArtistNotFoundRecovery />
    </NotFoundRecoveryShell>
  );
}
