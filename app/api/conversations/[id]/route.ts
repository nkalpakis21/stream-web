import { NextRequest, NextResponse } from 'next/server';
import { getConversation, addParticipant, removeParticipant, updateConversationTitle } from '@/lib/services/conversations';

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
      // artistIds is already an array of strings, no serialization needed
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
 * Update a conversation (add/remove participants or update title).
 * 
 * Body:
 * - action: 'add_participant' | 'remove_participant' | 'update_title'
 * - userId: string (user to add/remove, required for add/remove actions)
 * - requesterId: string (user making the request)
 * - title: string (required for update_title action)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const body = await request.json();
    const { action, userId, requesterId, title } = body;

    // Extract requesterId from header if not provided
    const requestUserId = requesterId || request.headers.get('x-user-id') || request.nextUrl.searchParams.get('userId');
    
    if (!requestUserId) {
      return NextResponse.json(
        { error: 'User ID is required (requesterId or x-user-id header)' },
        { status: 400 }
      );
    }

    if (action === 'add_participant') {
      if (!userId) {
        return NextResponse.json(
          { error: 'userId is required for add_participant action' },
          { status: 400 }
        );
      }
      await addParticipant(conversationId, userId, requestUserId);
    } else if (action === 'remove_participant') {
      if (!userId) {
        return NextResponse.json(
          { error: 'userId is required for remove_participant action' },
          { status: 400 }
        );
      }
      await removeParticipant(conversationId, userId, requestUserId);
    } else if (action === 'update_title') {
      if (!title || typeof title !== 'string') {
        return NextResponse.json(
          { error: 'title is required and must be a string for update_title action' },
          { status: 400 }
        );
      }
      await updateConversationTitle(conversationId, title, requestUserId);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be add_participant, remove_participant, or update_title' },
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
