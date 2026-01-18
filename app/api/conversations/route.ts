import { NextRequest, NextResponse } from 'next/server';
import { createConversation, getUserConversations } from '@/lib/services/conversations';
import type { ConversationDocument } from '@/types/firestore';

/**
 * GET /api/conversations
 * 
 * Get all conversations for a user.
 * 
 * Query params:
 * - userId: User ID (required)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const conversations = await getUserConversations(userId);

    // Serialize Timestamps for client
    const serializedConversations = conversations.map(conv => ({
      ...conv,
      createdAt: conv.createdAt.toMillis(),
      updatedAt: conv.updatedAt.toMillis(),
      lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toMillis() : null,
      // artistIds is already an array of strings, no serialization needed
    }));

    return NextResponse.json({
      conversations: serializedConversations,
    });
  } catch (error) {
    console.error('[API /conversations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations
 * 
 * Create a new conversation.
 * 
 * Body:
 * - participants: string[] (required)
 * - type: 'direct' | 'group' (optional, default: 'direct')
 * - artistId: string (optional, required for artist conversations)
 * - artistIds: string[] (optional, for group chats with multiple artists)
 * - createdBy: string (optional, user ID of creator - will be extracted from auth if not provided)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { participants, type = 'direct', artistId, artistIds, createdBy } = body;

    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 participants are required' },
        { status: 400 }
      );
    }

    // Extract userId from header or use provided createdBy
    const userId = createdBy || request.headers.get('x-user-id') || request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required (createdBy or x-user-id header)' },
        { status: 400 }
      );
    }

    const conversation = await createConversation(participants, type, artistId, userId, artistIds);

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
    console.error('[API /conversations] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
