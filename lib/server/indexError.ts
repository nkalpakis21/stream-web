export function isMissingIndexError(error: unknown): boolean {
  const err = error as { code?: number | string; message?: string };
  return (
    err?.code === 9 ||
    err?.code === 'failed-precondition' ||
    (typeof err?.message === 'string' && err.message.includes('index'))
  );
}
