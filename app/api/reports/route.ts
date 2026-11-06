/**
 * POST /api/reports
 *
 * Authorization: Bearer <Firebase ID token>
 * Body for a song or artist: {
 *   targetType: 'song' | 'artist',
 *   targetId: string,
 *   reason, note?
 * }
 * Body for a comment: {
 *   targetType: 'comment',
 *   songId: string,
 *   commentId: string,
 *   reason, note?
 * }
 * reason is sexual | hate_harassment | violence_self_harm
 *   | copyright_impersonation | spam_scam | other.
 * note is optional and at most 500 characters.
 *
 * reporterUid comes from the token. The target must exist or the response
 * is 404. A comment must be on that song; targetOwnerId is the author's uid.
 * 201 { id }. More than 20 reports from one user in an hour returns 429.
 */

import { NextRequest } from 'next/server';
import { errorResponse, HttpError, requireUser } from '@/lib/api/requireAuth';
import { noStoreJson } from '@/lib/http/noStore';
import {
  createContentReport,
  parseReportRequest,
  reportAuthVerifier,
} from '@/lib/server/reports';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const reporterUid = await requireUser(request, {
      verifyToken: reportAuthVerifier(),
    });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
    const input = parseReportRequest(body);
    const id = await createContentReport(reporterUid, input);
    return noStoreJson({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
