/**
 * The listen player registers its element so a click can call play()
 * in the same turn. Waiting on a network read drops the user gesture.
 */

let boundAudio: HTMLAudioElement | null = null;

export function bindPlayerAudio(audio: HTMLAudioElement | null): void {
  boundAudio = audio;
}

export function startPlayerAudio(url: string): void {
  const audio = boundAudio;
  if (!audio || !url) return;
  try {
    if (audio.getAttribute('src') !== url) audio.src = url;
    const pending = audio.play();
    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => undefined);
    }
  } catch {
    // ListenPlayer retries when playing state commits.
  }
}
