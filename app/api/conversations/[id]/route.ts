import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import {
  adminAddParticipant,
  adminGetConversation,
  adminRemoveParticipant,
  adminUpdateConversationTitle,
} from '@/lib/server/conversationsAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/conversations/[id]
 *
 * Participants only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUser(request);
    const conversation = await adminGetConversation(params.id);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (!conversation.participants.includes(userId)) {
      return NextResponse.json(
        { error: 'You are not a participant in this conversation' },
        { status: 403 }
      );
    }

    const serialized = {
      ...conversation,
      createdAt: conversation.createdAt.toMillis(),
      updatedAt: conversation.updatedAt.toMillis(),
      lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toMillis() : null,
    };

    return NextResponse.json({ conversation: serialized });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /conversations/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}

/**
 * PATCH /api/conversations/[id]
 *
 * Body:
 * - action: 'add_participant' | 'remove_participant' | 'update_title'
 * - userId: string (user to add/remove)
 * - title: string (update_title)
 *
 * The requester is the token uid. `requesterId` and `x-user-id` are ignored.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requestUserId = await requireUser(request);
    const conversationId = params.id;
    const body = await request.json();
    const { action, userId, title } = body;

    if (action === 'add_participant') {
      if (!userId) {
        return NextResponse.json(
          { error: 'userId is required for add_participant action' },
          { status: 400 }
        );
      }
      await adminAddParticipant(conversationId, userId, requestUserId);
    } else if (action === 'remove_participant') {
      if (!userId) {
        return NextResponse.json(
          { error: 'userId is required for remove_participant action' },
          { status: 400 }
        );
      }
      await adminRemoveParticipant(conversationId, userId, requestUserId);
    } else if (action === 'update_title') {
      if (!title || typeof title !== 'string') {
        return NextResponse.json(
          { error: 'title is required and must be a string for update_title action' },
          { status: 400 }
        );
      }
      await adminUpdateConversationTitle(conversationId, title, requestUserId);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be add_participant, remove_participant, or update_title' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /conversations/[id]] Error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}
