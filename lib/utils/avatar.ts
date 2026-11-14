/**
 * Avatar Utilities
 * 
 * Helper functions for generating consistent avatar designs
 */

/**
 * Generate a consistent gradient background from a name
 */
export function getAvatarGradient(name: string): string {
  // Simple hash function to get consistent colors
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate hue from hash (0-360)
  const hue = Math.abs(hash) % 360;
  
  // Create gradient with complementary colors
  return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 60) % 360}, 70%, 40%))`;
}

/**
 * Face fallback. One word is a single initial ("Jimmy" → "J").
 * Two or more words use the first letter of the first and last words.
 * The create screen and the share card both use this.
 */
export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/).filter(Boolean);
  const first = words[0]?.[0];
  if (!first) return '?';
  if (words.length >= 2) {
    const last = words[words.length - 1]?.[0];
    return last ? (first + last).toUpperCase() : first.toUpperCase();
  }
  return first.toUpperCase();
}

/** Header chip label: first name, or "You" when none. */
export function headerChipLabel(displayName?: string | null): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || 'You';
}



