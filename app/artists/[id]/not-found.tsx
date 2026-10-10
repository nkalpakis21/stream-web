import { BrandDeadEnd } from '@/components/states/BrandDeadEnd';
import { ArtistNotFoundRecovery } from '@/app/artists/[id]/ArtistNotFoundRecovery';

/**
 * Server not-found segment. notFound() in the page sets HTTP 404 before this
 * renders. The client child only refreshes after the owner token is verified.
 */
export default function ArtistNotFound() {
  return (
    <>
      <ArtistNotFoundRecovery />
      <BrandDeadEnd line="This artist isn't on Streamstar." />
    </>
  );
}
