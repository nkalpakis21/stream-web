export function isStudioPath(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/create' ||
    pathname.startsWith('/create/')
  );
}
