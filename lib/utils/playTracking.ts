/**
 * Play Tracking Utilities
 * 
 * Handles debounced play count tracking with session-based deduplication.
 */

/**
 * Check if a song has already been played in this session
 */
export function hasPlayedInSession(songId: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = `played_${songId}`;
  return sessionStorage.getItem(key) === 'true';
}

/**
 * Mark a song as played in this session
 */
export function markPlayedInSession(songId: string): void {
  if (typeof window === 'undefined') return;
  const key = `played_${songId}`;
  sessionStorage.setItem(key, 'true');
}

/**
 * Debounce function - handles both sync and async functions
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Track a play for a song
 * Uses debounce and session storage to prevent duplicate counts
 */
export async function trackPlay(songId: string): Promise<void> {
  // Check if already played in this session
  if (hasPlayedInSession(songId)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/songs/${songId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playCount: 'increment' }),
    });
    
    if (response.ok) {
      // Mark as played in session to prevent duplicate counts
      markPlayedInSession(songId);
    } else {
      console.error('Failed to track play:', await response.text());
    }
  } catch (error) {
    console.error('Error tracking play:', error);
  }
}

/**
 * Create a debounced play tracking function
 */
export function createDebouncedPlayTracker(waitMs: number = 500): (songId: string) => void {
  return debounce(trackPlay, waitMs);
}

