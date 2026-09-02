/**
 * POST /api/artists/pump-fun/metadata
 *
 * Hosts pump.fun coin metadata JSON on Firebase Storage (image = locked look URL).
 * Returns a short Streamstar HTTPS URI (`/c/{id}`) for create_v2 — never a
 * firebasestorage.googleapis.com download URL (those exceed the 200-char cap).
 * Never takes a wallet private key.
 */

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireUserId } from '@/lib/api/requireAuth';
import { getAdminBucket } from '@/lib/firebase/admin';
import {
  MAX_COIN_NAME_LENGTH,
  MAX_TICKER_LENGTH,
  METADATA_URI_TOO_LONG_NOTICE,
  MIN_TICKER_LENGTH,
  isHttpsUrl,
  isMetadataUriTooLong,
  isValidTicker,
  normalizeTicker,
  pumpFunMetadataObjectPath,
  pumpFunMetadataPublicUri,
} from '@/lib/solana/pumpFun';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_COIN_NAME_LENGTH),
  symbol: z.string().trim().min(MIN_TICKER_LENGTH).max(MAX_TICKER_LENGTH),
  description: z.string().trim().max(500).optional().default(''),
  image: z.string().trim().url(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request, {
      unavailableMessage: 'Coin metadata upload is temporarily unavailable',
    });

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(400, 'Coin name, ticker, and look image are required.');
    }

    const name = parsed.data.name.trim();
    const symbol = normalizeTicker(parsed.data.symbol);
    if (!isValidTicker(symbol)) {
      throw new HttpError(400, 'Ticker must be 2–10 letters or numbers.');
    }
    if (!isHttpsUrl(parsed.data.image)) {
      throw new HttpError(400, 'Coin image must be an https look URL.');
    }

    let bucket;
    try {
      bucket = getAdminBucket();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/bucket name not specified/i.test(message)) {
        throw new HttpError(
          503,
          'Storage is temporarily unavailable. Your artist can still be created without a token.'
        );
      }
      throw err;
    }
    if (!bucket.name) {
      throw new HttpError(
        503,
        'Storage is temporarily unavailable. Your artist can still be created without a token.'
      );
    }

    const metadata = {
      name,
      symbol,
      description: parsed.data.description || `${name} on Streamstar`,
      image: parsed.data.image,
      showName: true,
      createdOn: 'https://pump.fun',
      website: process.env.NEXT_PUBLIC_APP_URL || 'https://streamstar.xyz',
    };

    const id = randomUUID().replace(/-/g, '');
    const uri = pumpFunMetadataPublicUri(id);
    if (isMetadataUriTooLong(uri)) {
      throw new HttpError(400, METADATA_URI_TOO_LONG_NOTICE);
    }

    const objectPath = pumpFunMetadataObjectPath(id);
    const objectFile = bucket.file(objectPath);
    const body = Buffer.from(JSON.stringify(metadata), 'utf8');

    try {
      await objectFile.save(body, {
        resumable: false,
        metadata: {
          contentType: 'application/json',
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            uploadedBy: userId,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/bucket name not specified/i.test(message)) {
        throw new HttpError(
          503,
          'Storage is temporarily unavailable. Your artist can still be created without a token.'
        );
      }
      throw err;
    }

    return NextResponse.json({ uri });
  } catch (error) {
    return errorResponse(error);
  }
}
