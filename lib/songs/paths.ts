/** Public song page. Fork and remix stay on their own routes. */
export function isSongPagePath(pathname: string): boolean {
  return /^\/songs\/[^/]+$/.test(pathname);
}
