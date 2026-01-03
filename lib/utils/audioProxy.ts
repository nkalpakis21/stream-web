/**
 * Audio Proxy Utility
 * 
 * Converts S3 audio URLs to proxy URLs that include proper cache headers.
 * This ensures browser caching even when S3 doesn't set cache headers.
 */

/**
 * Base64 encode a string (works in both Node.js and browser)
 */
function base64Encode(str: string): string {
  // Check if Buffer is available (Node.js environment)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  }
  
  // Browser environment: use btoa with proper UTF-8 encoding
  // btoa only works with ASCII, so we need to encode UTF-8 first
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (error) {
    // Fallback: encodeURIComponent and manual base64
    const encoded = encodeURIComponent(str)
      .replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16)));
    return btoa(encoded);
  }
}

/**
 * Converts an audio URL to use the proxy endpoint
 * @param audioUrl - The original S3 audio URL
 * @returns The proxied URL, or null if the URL is invalid
 */
export function getProxiedAudioUrl(audioUrl: string | null | undefined): string | null {
  if (!audioUrl || !audioUrl.trim()) {
    return null;
  }

  // Only proxy S3 URLs (lalals.s3.amazonaws.com)
  const s3Domains = [
    'lalals.s3.amazonaws.com',
    'lalals.s3.us-east-1.amazonaws.com',
  ];

  const isS3Url = s3Domains.some(domain => audioUrl.includes(domain));

  if (!isS3Url) {
    // Return original URL if it's not from S3 (e.g., Firebase Storage)
    return audioUrl;
  }

  try {
    // Encode the URL in base64 to handle special characters
    const encodedUrl = base64Encode(audioUrl);
    return `/api/audio-proxy?url=${encodedUrl}`;
  } catch (error) {
    console.error('[Audio Proxy] Failed to encode URL:', error);
    // Fallback to original URL if encoding fails
    return audioUrl;
  }
}

/**
 * Checks if a URL should be proxied
 * @param audioUrl - The audio URL to check
 * @returns True if the URL should be proxied
 */
export function shouldProxyAudioUrl(audioUrl: string | null | undefined): boolean {
  if (!audioUrl) return false;
  
  const s3Domains = [
    'lalals.s3.amazonaws.com',
    'lalals.s3.us-east-1.amazonaws.com',
  ];

  return s3Domains.some(domain => audioUrl.includes(domain));
}
