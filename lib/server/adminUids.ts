/**
 * Comma-separated Firebase uids allowed to call non-production admin tools.
 * Set `ADMIN_UIDS` in stream-dev (and locally). Production routes that consult
 * this list are hidden before the check.
 */
export function adminUids(
  raw: string | undefined = process.env.ADMIN_UIDS
): string[] {
  return (raw ?? '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
}

export function isAdminUid(uid: string, raw?: string): boolean {
  return adminUids(raw).includes(uid);
}
