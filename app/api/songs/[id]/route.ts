import { NextRequest, NextResponse } from 'next/server';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getSongPath } from '@/lib/firebase/collections';

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

