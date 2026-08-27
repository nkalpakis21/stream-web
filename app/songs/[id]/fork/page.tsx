import { redirect } from 'next/navigation';

interface ForkSongPageProps {
  params: {
    id: string;
  };
}

/**
 * Fork is deprecated. Old URLs redirect to the parent song instead of 404ing.
 */
export default function DeprecatedForkSongPage({ params }: ForkSongPageProps) {
  redirect(`/songs/${params.id}`);
}
