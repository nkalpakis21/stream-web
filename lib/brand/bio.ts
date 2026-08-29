/**
 * Public artist bios. Hide empty copy and known create-form / X-sync templates.
 * Never invent a bio.
 */

const PLACEHOLDERS = new Set([
  'who they are, where they come from…',
  'who they are, where they come from...',
  'who they are, where they come from',
]);

export function isHonestBio(lore: string | null | undefined, artistName?: string): boolean {
  const text = (lore || '').trim();
  if (!text) return false;

  const collapsed = text.replace(/\s+/g, ' ');
  if (PLACEHOLDERS.has(collapsed.toLowerCase())) return false;

  const name = (artistName || '').trim();
  if (name && collapsed.toLowerCase() === name.toLowerCase()) return false;

  // composeProfileBio fallback: "{name} on Streamstar."
  if (/^[\w .'-]+ on streamstar\.?$/i.test(collapsed)) return false;

  return true;
}
