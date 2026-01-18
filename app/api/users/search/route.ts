import { NextRequest, NextResponse } from 'next/server';
import { searchUsersByDisplayName } from '@/lib/services/users';
import type { UserDocument } from '@/types/firestore';

/**
 * GET /api/users/search
 * 
 * Search users by display name (prefix matching).
 * 
 * Query params:
 * - query: Display name search string (required, min 1 char)
 * - limit: Max results (default: 10, max: 50)
 * - excludeUserId: User ID to exclude from results (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const limitParam = searchParams.get('limit');
    const excludeUserId = searchParams.get('excludeUserId') || undefined;

    // Validate query
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter is required and must be at least 1 character' },
        { status: 400 }
      );
    }

    // Validate and parse limit
    let limitCount = 10;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 50) {
        return NextResponse.json(
          { error: 'Limit must be a number between 1 and 50' },
          { status: 400 }
        );
      }
      limitCount = parsed;
    }

    // Search users
    const users = await searchUsersByDisplayName(query.trim(), excludeUserId, limitCount);

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
    console.error('[API /users/search] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
}
