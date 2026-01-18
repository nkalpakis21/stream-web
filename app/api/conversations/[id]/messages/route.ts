import { NextRequest, NextResponse } from 'next/server';
import { getMessages, sendMessage } from '@/lib/services/messages';
import type { MessageDocument } from '@/types/firestore';

/**
 * GET /api/conversations/[id]/messages
 * 
 * Get paginated messages for a conversation.
 * 
 * Query params:
 * - limit: number of messages per page (default: 50)
 * - cursor: last message ID for pagination (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') || null;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    const result = await getMessages(conversationId, limit, cursor);

    // Serialize Timestamps for client
    const serializedMessages = result.messages.map(msg => ({
      ...msg,
      createdAt: msg.createdAt.toMillis(),
    }));

    return NextResponse.json({
      messages: serializedMessages,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API /conversations/[id]/messages] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations/[id]/messages
 * 
 * Send a message in a conversation.
 * 
 * Body:
 * - senderId: string (required)
 * - content: string (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const body = await request.json();
    const { senderId, content } = body;

    if (!senderId || !content) {
      return NextResponse.json(
        { error: 'senderId and content are required' },
        { status: 400 }
      );
    }

    const message = await sendMessage(conversationId, senderId, content);

    // Serialize Timestamps for client
    const serialized = {
      ...message,
      createdAt: message.createdAt.toMillis(),
    };

    return NextResponse.json({
      message: serialized,
    });
  } catch (error) {
    console.error('[API /conversations/[id]/messages] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
