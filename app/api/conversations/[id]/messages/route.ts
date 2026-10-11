import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { adminGetMessages, adminSendMessage } from '@/lib/server/conversationsAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * GET /api/conversations/[id]/messages
 *
 * Participants only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUser(request);
    const conversationId = params.id;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') || null;

    if (limit < 1 || limit > 100) {
      return NextResponse.json({ error: 'Limit must be between 1 and 100' }, { status: 400 });
    }

    const result = await adminGetMessages(conversationId, userId, limit, cursor);
    const serializedMessages = result.messages.map((msg) => ({
      ...msg,
      createdAt: msg.createdAt.toMillis(),
    }));

    return NextResponse.json({
      messages: serializedMessages,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /conversations/[id]/messages] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

/**
 * POST /api/conversations/[id]/messages
 *
 * Body: { content: string }
 * The sender is the token uid. `senderId` in the body is ignored.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const senderId = await requireUser(request);
    const conversationId = params.id;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const message = await adminSendMessage(conversationId, senderId, content);
    return NextResponse.json({
      message: {
        ...message,
        createdAt: message.createdAt.toMillis(),
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /conversations/[id]/messages] Error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
