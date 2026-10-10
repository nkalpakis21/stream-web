import { absoluteHttpBaseUrl } from '@/lib/webhooks/baseUrl';

export const REVALIDATE_BASE_URL_MISSING = 'revalidate_base_url_missing';

type FetchLike = (url: string, init?: RequestInit) => Promise<unknown>;

/**
 * POST /api/revalidate with `x-revalidate-secret`.
 * Skips the call when `NEXT_PUBLIC_APP_URL` is missing. No hardcoded host
 * and no request Host. The warning does not include the secret or a URL.
 * Returns true only when the request was sent.
 */
export async function revalidateHomepage(options?: {
  appUrl?: string | null;
  secret?: string;
  fetchImpl?: FetchLike;
  warn?: (message: string) => void;
  onError?: (error: unknown) => void;
}): Promise<boolean> {
  const raw = options && 'appUrl' in options ? options.appUrl : process.env.NEXT_PUBLIC_APP_URL;
  const base = absoluteHttpBaseUrl(raw);
  if (!base) {
    const warn = options?.warn ?? ((message: string) => console.warn(message));
    warn(REVALIDATE_BASE_URL_MISSING);
    return false;
  }

  const secret =
    options && 'secret' in options ? options.secret ?? '' : process.env.REVALIDATE_SECRET || '';
  const fetchImpl = options?.fetchImpl ?? fetch;

  try {
    await fetchImpl(`${base}/api/revalidate`, {
      method: 'POST',
      headers: {
        'x-revalidate-secret': secret,
      },
    });
    return true;
  } catch (error) {
    if (options?.onError) options.onError(error);
    else console.error('Failed to revalidate homepage:', error);
    return false;
  }
}
