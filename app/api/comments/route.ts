import { NextRequest, NextResponse } from 'next/server';
import { createComment, getComments, updateComment, deleteComment } from '@/lib/services/comments';
import type { CommentDocument } from '@/types/firestore';

/**
 * GET /api/comments
 * 
 * Get paginated comments for a target.
 * 
 * Query params:
 * - targetType: 'artist' | 'song' (required)
 * - targetId: string (required)
 * - limit: number of comments per page (default: 50)
 * - cursor: last comment ID for pagination (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const targetType = searchParams.get('targetType') as 'artist' | 'song' | null;
    const targetId = searchParams.get('targetId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') || null;

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: 'targetType and targetId are required' },
        { status: 400 }
      );
    }

    if (targetType !== 'artist' && targetType !== 'song') {
      return NextResponse.json(
        { error: 'targetType must be "artist" or "song"' },
        { status: 400 }
      );
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    const result = await getComments(targetType, targetId, limit, cursor);

    // Serialize Timestamps for client
    const serializedComments = result.comments.map(comment => ({
      ...comment,
      createdAt: comment.createdAt.toMillis(),
      updatedAt: comment.updatedAt.toMillis(),
      deletedAt: comment.deletedAt ? comment.deletedAt.toMillis() : null,
    }));

    return NextResponse.json({
      comments: serializedComments,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API /comments] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comments
 * 
 * Create a new comment or reply.
 * 
 * Body:
 * - targetType: 'artist' | 'song' (required)
 * - targetId: string (required)
 * - authorId: string (required)
 * - content: string (required)
 * - parentCommentId: string | null (optional, for replies)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetType, targetId, authorId, content, parentCommentId = null } = body;

    if (!targetType || !targetId || !authorId || !content) {
      return NextResponse.json(
        { error: 'targetType, targetId, authorId, and content are required' },
        { status: 400 }
      );
    }

    if (targetType !== 'artist' && targetType !== 'song') {
      return NextResponse.json(
        { error: 'targetType must be "artist" or "song"' },
        { status: 400 }
      );
    }

    const comment = await createComment(targetType, targetId, authorId, content, parentCommentId);

    // Serialize Timestamps for client
    const serialized = {
      ...comment,
      createdAt: comment.createdAt.toMillis(),
      updatedAt: comment.updatedAt.toMillis(),
      deletedAt: comment.deletedAt ? comment.deletedAt.toMillis() : null,
    };

    return NextResponse.json({
      comment: serialized,
    });
  } catch (error) {
    console.error('[API /comments] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/comments
 * 
 * Update a comment.
 * 
 * Body:
 * - commentId: string (required)
 * - authorId: string (required)
 * - content: string (required)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { commentId, authorId, content } = body;

    if (!commentId || !authorId || !content) {
      return NextResponse.json(
        { error: 'commentId, authorId, and content are required' },
        { status: 400 }
      );
    }

    await updateComment(commentId, authorId, content);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /comments] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comments
 * 
 * Delete a comment.
 * 
 * Body:
 * - commentId: string (required)
 * - authorId: string (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { commentId, authorId } = body;

    if (!commentId || !authorId) {
      return NextResponse.json(
        { error: 'commentId and authorId are required' },
        { status: 400 }
      );
    }

    await deleteComment(commentId, authorId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /comments] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
