import { NextRequest, NextResponse } from 'next/server';
import { getConversation, addParticipant, removeParticipant } from '@/lib/services/conversations';

/**
 * GET /api/conversations/[id]
 * 
 * Get a conversation by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const conversation = await getConversation(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Serialize Timestamps for client
    const serialized = {
      ...conversation,
      createdAt: conversation.createdAt.toMillis(),
      updatedAt: conversation.updatedAt.toMillis(),
      lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toMillis() : null,
    };

    return NextResponse.json({
      conversation: serialized,
    });
  } catch (error) {
    console.error('[API /conversations/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/conversations/[id]
 * 
 * Update a conversation (add/remove participants).
 * 
 * Body:
 * - action: 'add_participant' | 'remove_participant'
 * - userId: string (user to add/remove)
 * - requesterId: string (user making the request)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const body = await request.json();
    const { action, userId, requesterId } = body;

    if (!action || !userId || !requesterId) {
      return NextResponse.json(
        { error: 'action, userId, and requesterId are required' },
        { status: 400 }
      );
    }

    if (action === 'add_participant') {
      await addParticipant(conversationId, userId, requesterId);
    } else if (action === 'remove_participant') {
      await removeParticipant(conversationId, userId, requesterId);
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /conversations/[id]] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    );
  }
}
