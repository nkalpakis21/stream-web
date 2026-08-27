import { redirect } from 'next/navigation';

interface RemixSongPageProps {
  params: {
    id: string;
  };
}

/**
 * Remix is deprecated. Old URLs redirect to the parent song instead of 404ing.
 */
export default function DeprecatedRemixSongPage({ params }: RemixSongPageProps) {
  redirect(`/songs/${params.id}`);
}
