import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import {
  adminCreateConversation,
  adminGetUserConversations,
} from '@/lib/server/conversationsAdmin';

export const runtime = 'nodejs';

function serializeConversation<T extends {
  createdAt: { toMillis: () => number };
  updatedAt: { toMillis: () => number };
  lastMessageAt: { toMillis: () => number } | null;
}>(conv: T) {
  return {
    ...conv,
    createdAt: conv.createdAt.toMillis(),
    updatedAt: conv.updatedAt.toMillis(),
    lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toMillis() : null,
  };
}

/**
 * GET /api/conversations
 *
 * Conversations for the authenticated user. `userId` query is ignored.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser(request);
    const conversations = await adminGetUserConversations(userId);
    return NextResponse.json({
      conversations: conversations.map((conv) => serializeConversation(conv)),
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /conversations] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

/**
 * POST /api/conversations
 *
 * Body:
 * - participants: string[] (required, must include the authenticated user)
 * - type: 'direct' | 'group' (optional, default: 'direct')
 * - artistId: string (optional)
 * - artistIds: string[] (optional)
 *
 * `createdBy` and `x-user-id` are ignored. The creator is the token uid.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUser(request);
    const body = await request.json();
    const { participants, type = 'direct', artistId, artistIds } = body;

    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 participants are required' },
        { status: 400 }
      );
    }

    if (type !== 'direct' && type !== 'group') {
      return NextResponse.json(
        { error: 'type must be "direct" or "group"' },
        { status: 400 }
      );
    }

    const conversation = await adminCreateConversation(
      participants,
      type,
      artistId,
      userId,
      artistIds
    );

    return NextResponse.json({
      conversation: serializeConversation(conversation),
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error('[API /conversations] Error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
