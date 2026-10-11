import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { commentClientPayload } from '@/lib/comments/author';
import {
  adminCountLiveComments,
  adminCreateComment,
  adminDeleteComment,
  adminListComments,
  adminListReplies,
  adminUpdateComment,
} from '@/lib/server/commentsAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

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

    if (searchParams.get('count') === '1') {
      const liveCount = await adminCountLiveComments(targetType, targetId);
      return NextResponse.json({ liveCount });
    }

    const parentCommentId = searchParams.get('parentCommentId');
    const result = parentCommentId
      ? await adminListReplies(parentCommentId, limit, cursor)
      : await adminListComments(targetType, targetId, limit, cursor);

    const serializedComments = result.comments.map(comment =>
      commentClientPayload({
        id: comment.id,
        targetType: comment.targetType,
        targetId: comment.targetId,
        authorId: comment.authorId,
        content: comment.content,
        parentCommentId: comment.parentCommentId,
        createdAt: comment.createdAt.toMillis(),
        updatedAt: comment.updatedAt.toMillis(),
        deletedAt: comment.deletedAt ? comment.deletedAt.toMillis() : null,
        deleted: comment.deleted === true,
      })
    );

    return NextResponse.json({
      comments: serializedComments,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      ...('liveCount' in result ? { liveCount: result.liveCount } : {}),
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
 * - content: string (required)
 * - parentCommentId: string | null (optional, for replies)
 *
 * The author is the verified Firebase uid. `authorId` in the body is ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const authorId = await requireUser(request);
    const body = await request.json();
    const { targetType, targetId, content, parentCommentId = null } = body;

    if (!targetType || !targetId || !content) {
      return NextResponse.json(
        { error: 'targetType, targetId, and content are required' },
        { status: 400 }
      );
    }

    if (targetType !== 'artist' && targetType !== 'song') {
      return NextResponse.json(
        { error: 'targetType must be "artist" or "song"' },
        { status: 400 }
      );
    }

    const comment = await adminCreateComment(targetType, targetId, authorId, content, parentCommentId);

    const serialized = commentClientPayload({
      id: comment.id,
      targetType: comment.targetType,
      targetId: comment.targetId,
      authorId: comment.authorId,
      content: comment.content,
      parentCommentId: comment.parentCommentId,
      createdAt: comment.createdAt.toMillis(),
      updatedAt: comment.updatedAt.toMillis(),
      deletedAt: comment.deletedAt ? comment.deletedAt.toMillis() : null,
      deleted: comment.deleted === true,
    });

    return NextResponse.json({
      comment: serialized,
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
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
 * - content: string (required)
 *
 * The author is the verified Firebase uid. `authorId` in the body is ignored.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authorId = await requireUser(request);
    const body = await request.json();
    const { commentId, content } = body;

    if (!commentId || !content) {
      return NextResponse.json(
        { error: 'commentId and content are required' },
        { status: 400 }
      );
    }

    await adminUpdateComment(commentId, authorId, content);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
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
 *
 * The author is the verified Firebase uid. `authorId` in the body is ignored.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authorId = await requireUser(request);
    const body = await request.json();
    const { commentId } = body;

    if (!commentId) {
      return NextResponse.json(
        { error: 'commentId is required' },
        { status: 400 }
      );
    }

    const outcome = await adminDeleteComment(commentId, authorId);

    return NextResponse.json({ outcome });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
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
