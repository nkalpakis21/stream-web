/**
 * Connect still succeeds without users.write. X has no supported OAuth 2.0
 * profile-write endpoint for this app, so name/bio/avatar sync is best-effort
 * and must not surface as a pink lastError.
 */
export function isProfileSyncUnavailableError(
  message: string | null | undefined
): boolean {
  if (!message) return false;
  const notes = message
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
  if (notes.length === 0) return false;
  return notes.every(
    note =>
      note.includes('name/bio sync unavailable') ||
      note.includes('avatar sync unavailable')
  );
}
