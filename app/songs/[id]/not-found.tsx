import { BrandDeadEnd } from '@/components/states/BrandDeadEnd';
import { SongNotFoundRecovery } from '@/app/songs/[id]/SongNotFoundRecovery';

/**
 * Server not-found segment. notFound() in the page sets HTTP 404 before this
 * renders. The client child only refreshes after the owner token is verified.
 */
export default function SongNotFound() {
  return (
    <>
      <SongNotFoundRecovery />
      <BrandDeadEnd line="This song isn't on Streamstar." />
    </>
  );
}
