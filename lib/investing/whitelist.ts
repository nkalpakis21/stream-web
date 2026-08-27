/**
 * Email whitelist for the gated /investing page.
 * Keep this list in sync with authorized investors only.
 */
export const INVESTOR_EMAIL_WHITELIST = [
  'nkalpakis21@gmail.com',
  'mshaffer13@msn.com',
  'jjketellapper@gmail.com',
  '',
];

export function isWhitelistedInvestorEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return INVESTOR_EMAIL_WHITELIST.includes(email.toLowerCase());
}
