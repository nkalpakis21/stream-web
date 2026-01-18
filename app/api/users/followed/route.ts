import { NextRequest, NextResponse } from 'next/server';
import { getUsersFromFollowedArtists } from '@/lib/services/users';
import type { UserDocument } from '@/types/firestore';

/**
 * GET /api/users/followed
 * 
 * Get users from artists that the current user is following.
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

    // Get users from followed artists
    const users = await getUsersFromFollowedArtists(userId);

    // Serialize Timestamps for client
    const serializedUsers = users.map(user => ({
      ...user,
      createdAt: user.createdAt.toMillis(),
      updatedAt: user.updatedAt.toMillis(),
      deletedAt: user.deletedAt ? user.deletedAt.toMillis() : null,
    }));

    return NextResponse.json({
      users: serializedUsers,
    });
  } catch (error) {
    console.error('[API /users/followed] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch followed users' },
      { status: 500 }
    );
  }
}
