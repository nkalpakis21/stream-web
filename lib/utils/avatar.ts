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
 * Get initials from a name (up to 2 letters)
 */
export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  
  const words = trimmed.split(/\s+/).filter(Boolean);
  
  if (words.length >= 2) {
    // First letter of first word + first letter of last word
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  
  // Single word: take first 2 characters
  return trimmed.substring(0, 2).toUpperCase();
}



