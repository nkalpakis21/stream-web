import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { adminUpdateStubGenerationStatus } from '@/lib/server/generationsAdmin';
import type { GenerationDocument } from '@/types/firestore';

export const runtime = 'nodejs';

/**
 * Stub-provider completion. The browser cannot update generations once
 * rules deny client writes. MusicGPT jobs are completed by the webhook.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUser(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Invalid body');
    }
    const record = body as Record<string, unknown>;
    if (typeof record.status !== 'string') {
      throw new HttpError(400, 'status is required');
    }

    const output =
      record.output === null || record.output === undefined
        ? null
        : (record.output as GenerationDocument['output']);
    const error = record.error == null ? null : String(record.error);
    const contentHash = Object.prototype.hasOwnProperty.call(record, 'contentHash')
      ? (record.contentHash as string | null)
      : undefined;

    await adminUpdateStubGenerationStatus(params.id, userId, {
      status: record.status,
      output,
      error,
      contentHash,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /generations/[id]/status] Error:', error);
    return NextResponse.json({ error: 'Failed to update generation' }, { status: 500 });
  }
}
