/**
 * Owner recovery for a private song or artist 404.
 * The hint is a presence flag only. Never store a uid or token in it.
 */

export const SIGNED_IN_HINT_KEY = 'ss_signed_in';
export const SIGNED_IN_HINT_VALUE = '1';

/** Show the not-found copy if the owner check is still running after this. */
export const RECOVERY_REVEAL_MS = 2000;

export type NotFoundKind = 'song' | 'artist';

export type RecoveryDecision = 'reload' | 'show-not-found';

export function recoveryStorageKey(kind: NotFoundKind, id: string): string {
  return `ss_recover:${kind}:${id}`;
}

export function readSignedInHint(
  storage: Pick<Storage, 'getItem'> | null | undefined
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SIGNED_IN_HINT_KEY) === SIGNED_IN_HINT_VALUE;
  } catch {
    return false;
  }
}

export function syncSignedInHint(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined,
  signedIn: boolean
): void {
  if (!storage) return;
  try {
    if (signedIn) storage.setItem(SIGNED_IN_HINT_KEY, SIGNED_IN_HINT_VALUE);
    else storage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Private mode can reject storage. The 404 copy stays visible.
  }
}

/**
 * Reload only after the Bearer read returns OK, and only once per id.
 * A non-owner's check is not OK, so they never reload.
 */
export function recoveryDecision(input: {
  responseOk: boolean;
  alreadyRecovered: boolean;
}): RecoveryDecision {
  if (input.responseOk && !input.alreadyRecovered) return 'reload';
  return 'show-not-found';
}

export function idFromNotFoundPath(kind: NotFoundKind, pathname: string): string | null {
  const pattern = kind === 'song' ? /^\/songs\/([^/]+)/ : /^\/artists\/([^/]+)/;
  const id = pathname.match(pattern)?.[1];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/** Runs before paint. Sets a document flag when a session exists. No uid, no token. */
export const SIGNED_IN_HINT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  SIGNED_IN_HINT_KEY
)})===${JSON.stringify(
  SIGNED_IN_HINT_VALUE
)}){document.documentElement.setAttribute('data-ss-signed-in','')}}catch(e){}})();`;
