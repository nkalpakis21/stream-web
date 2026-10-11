import { Lock } from 'lucide-react';
import '@/components/songs/private-song-tag.css';

/** Lock plus the word Private. Owner catalogs only. */
export function PrivateSongTag() {
  return (
    <span className="private-song-tag" aria-label="Private, only you can see this song">
      <Lock aria-hidden size={12} strokeWidth={2} />
      Private
    </span>
  );
}
