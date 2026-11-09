import { NextRequest } from 'next/server';
import { songShareImageGET } from '@/lib/server/songShareImage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return songShareImageGET(request, params.id);
}
