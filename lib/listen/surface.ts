export function isCreatePath(pathname: string) {
  return pathname === '/create' || pathname.startsWith('/create/');
}

export function isStudioPath(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    isCreatePath(pathname)
  );
}
