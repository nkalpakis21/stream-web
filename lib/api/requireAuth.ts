/**
 * Re-export of the server auth helper.
 * Canonical path for new routes, including account deletion: `@/lib/server/auth`.
 */
export {
  HttpError,
  requireUser,
  requireUserId,
  errorResponse,
} from '@/lib/server/auth';
