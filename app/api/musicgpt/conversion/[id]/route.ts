import { NextResponse } from 'next/server';
import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';

/**
 * API route to fetch MusicGPT conversion details by conversion ID.
 * 
 * This proxies the getConversionDataByConversionID function so it can be called
 * from client components without exposing API keys.
 * 
 * Used by the webhook simulator to fetch conversion_path URLs before
 * simulating webhook events.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const conversionId = params.id;
    
    if (!conversionId) {
      return NextResponse.json(
        { error: 'Conversion ID is required' },
        { status: 400 }
      );
    }

    const result = await getConversionDataByConversionID(conversionId);

    if (!result || !result.success) {
      return NextResponse.json(
        { error: 'Failed to fetch conversion details' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[MusicGPT Conversion API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

