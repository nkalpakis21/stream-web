import { NextRequest, NextResponse } from 'next/server';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getSongPath } from '@/lib/firebase/collections';
import { deleteSong } from '@/lib/services/songs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id;
    const body = await request.json();
    const songRef = doc(db, getSongPath(songId));
    
    // Build updates object
    const updates: Record<string, unknown> = {};
    
    // Handle playCount increment specially (atomic operation)
    if (body.playCount !== undefined) {
      if (body.playCount === 'increment') {
        updates.playCount = increment(1);
      } else if (typeof body.playCount === 'number') {
        updates.playCount = body.playCount;
      }
    }
    
    // Handle other fields
    if (body.title !== undefined) {
      updates.title = body.title;
    }
    
    if (body.isPublic !== undefined) {
      updates.isPublic = body.isPublic;
    }
    
    // Add more fields as needed in the future
    
    // If no valid updates, return error
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }
    
    await updateDoc(songRef, updates);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating song:', error);
    return NextResponse.json(
      { error: 'Failed to update song' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const songId = params.id;
    const body = await request.json();
    
    // Get userId from request body (client will send this)
    const userId = body.userId;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Delete the song (includes ownership validation)
    await deleteSong(songId, userId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting song:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('already deleted')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      if (error.message.includes('owner')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to delete song' },
      { status: 500 }
    );
  }
}

