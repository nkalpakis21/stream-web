/**
 * Open the system share sheet for a song, or the same copy action ShareButton uses.
 * A cancelled sheet does not count as a share.
 */

export type SongShareResult = 'shared' | 'copied' | 'cancelled';

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** Clipboard copy, then the hidden textarea fallback ShareButton uses. */
export async function copyShareLink(url: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch {
      // Private mode and some browsers reject clipboard. Try the textarea.
    }
  }
  if (typeof document === 'undefined') {
    throw new Error('copy failed');
  }
  const textArea = document.createElement('textarea');
  textArea.value = url;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('copy failed');
  } finally {
    document.body.removeChild(textArea);
  }
}

export async function openSongShare(input: {
  url: string;
  title: string;
  songId?: string;
  artistId?: string;
  /** Pass null when the system sheet is unavailable. Omit to use navigator.share. */
  share?: ((data: { url: string; title?: string }) => Promise<void>) | null;
  copy?: (url: string) => Promise<void>;
  report?: (props: { songId?: string; artistId?: string }) => void;
}): Promise<SongShareResult> {
  const share =
    input.share !== undefined
      ? input.share
      : typeof navigator !== 'undefined' && typeof navigator.share === 'function'
        ? (data: { url: string; title?: string }) => navigator.share(data)
        : null;
  const report = () => {
    input.report?.({
      ...(input.songId ? { songId: input.songId } : {}),
      ...(input.artistId ? { artistId: input.artistId } : {}),
    });
  };

  if (share) {
    try {
      await share({ url: input.url, title: input.title });
      report();
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }

  await (input.copy ?? copyShareLink)(input.url);
  report();
  return 'copied';
}
