/**
 * Content Hashing Utilities
 * 
 * Used for proof-ready ownership without blockchain.
 * These hashes can later be minted on-chain without migration.
 */

/**
 * Generate a hash from content for ownership proof
 */
export async function hashContent(content: string): Promise<string> {
  // Use Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generate content hash for a generation
 * Combines prompt and output references for immutable proof
 */
export async function hashGeneration(
  prompt: { structured: Record<string, unknown>; freeText: string },
  output: { audioURL: string | null; stems: string[] | null }
): Promise<string> {
  const content = JSON.stringify({
    prompt: {
      structured: prompt.structured,
      freeText: prompt.freeText,
    },
    output: {
      audioURL: output.audioURL,
      stems: output.stems || [],
    },
  });
  return hashContent(content);
}

