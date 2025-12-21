import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');
  const origin = request.headers.get('origin') || request.headers.get('referer');
  
  // Verify secret OR allow same-origin requests (for client-side calls)
  const isSameOrigin = origin && (
    origin.includes('streamstar.xyz') || 
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  );
  
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    // Allow same-origin requests without secret (for client-side calls)
    if (!isSameOrigin) {
      return NextResponse.json({ message: 'Invalid secret or origin' }, { status: 401 });
    }
  }

  try {
    // Revalidate the homepage
    revalidatePath('/');
    return NextResponse.json({ revalidated: true, now: Date.now() });
  } catch (err) {
    return NextResponse.json({ message: 'Error revalidating' }, { status: 500 });
  }
}

