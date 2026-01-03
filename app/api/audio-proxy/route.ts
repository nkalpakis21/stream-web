/**
 * Audio Proxy API Route
 * 
 * Proxies audio files from S3 and adds proper cache headers.
 * This ensures browser caching even when S3 doesn't set cache headers.
 * 
 * Usage:
 * GET /api/audio-proxy?url=<BASE64_ENCODED_AUDIO_URL>
 * 
 * Example:
 * GET /api/audio-proxy?url=aHR0cHM6Ly9sYWxhbHMuczMuYW1hem9uYXdzLmNvbS9hdWRpby5tcDM=
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const encodedUrl = searchParams.get('url');

  if (!encodedUrl) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Decode the base64 URL
    const audioUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

    // Validate URL is from allowed S3 domains
    const allowedDomains = [
      'lalals.s3.amazonaws.com',
      'lalals.s3.us-east-1.amazonaws.com',
      's3.amazonaws.com',
      's3.us-east-1.amazonaws.com',
    ];

    const urlObj = new URL(audioUrl);
    const isAllowed = allowedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'URL domain not allowed' },
        { status: 403 }
      );
    }

    // Fetch the audio file from S3
    const response = await fetch(audioUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'StreamStar-Audio-Proxy/1.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch audio: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the content type from the response or infer from URL
    const contentType = response.headers.get('content-type') || 
      (audioUrl.endsWith('.mp3') ? 'audio/mpeg' : 
       audioUrl.endsWith('.wav') ? 'audio/wav' : 
       audioUrl.endsWith('.m4a') ? 'audio/mp4' : 
       'audio/mpeg');

    // Stream the response with proper cache headers
    const stream = response.body;
    if (!stream) {
      return NextResponse.json(
        { error: 'No response body' },
        { status: 500 }
      );
    }

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // s-maxage tells CDN/proxy caches (like Vercel Edge) to cache for 1 year
        // max-age tells browsers to cache for 1 year
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'Expires': new Date(Date.now() + 31536000 * 1000).toUTCString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '31536000',
        // Vercel-specific cache headers for Edge Network caching
        'CDN-Cache-Control': 'public, max-age=31536000, immutable',
        'Vercel-CDN-Cache-Control': 'public, max-age=31536000, immutable',
        // Pass through ETag and Last-Modified for validation
        ...(response.headers.get('etag') && { 'ETag': response.headers.get('etag')! }),
        ...(response.headers.get('last-modified') && { 'Last-Modified': response.headers.get('last-modified')! }),
      },
    });
  } catch (error) {
    console.error('[Audio Proxy] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to proxy audio',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Max-Age': '31536000',
    },
  });
}
