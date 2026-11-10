import Link from 'next/link';
import { ADD_VOCALS_LABEL } from '@/lib/songs/beatFirst';

/**
 * Mute line on the studio card. Only "Add vocals" is a link.
 * Not a second pill.
 */
export function BeatReadyTag({ songId }: { songId: string }) {
  return (
    <p className="mt-1 text-xs text-[#8B8896]" data-beat-ready>
      Beat ready ·{' '}
      <Link href={`/songs/${songId}`} className="font-semibold text-[#E8E6F2]">
        {ADD_VOCALS_LABEL}
      </Link>
    </p>
  );
}
