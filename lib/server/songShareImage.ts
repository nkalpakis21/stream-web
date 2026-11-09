import { NextRequest } from 'next/server';
import { brandOgImageResponse, renderSongShareCard } from '@/lib/songs/shareCardImage';
import { selectShareArt } from '@/lib/songs/shareCard';
import { loadSongShareFacts } from '@/lib/server/songShareFacts';

function notFoundImage(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** OG and Twitter image. Hidden songs 404. A public song with no card art uses the brand image. */
export async function songShareImageGET(
  _request: NextRequest,
  songId: string
): Promise<Response> {
  try {
    const id = songId?.trim();
    if (!id) return notFoundImage();
    const facts = await loadSongShareFacts(id, null);
    if (facts.gate !== 'public') return notFoundImage();
    const art = selectShareArt({
      shareable: facts.audioReady,
      coverUrl: facts.coverUrl,
      faceUrl: facts.faceUrl,
      artistName: facts.artistName,
    });
    if (art.kind === 'brand') return brandOgImageResponse();
    return renderSongShareCard({
      title: facts.title,
      artistName: facts.artistName,
      art,
      versionMs: facts.versionMs,
    });
  } catch (error) {
    console.error('[share-image]', error instanceof Error ? error.message : 'failed');
    return brandOgImageResponse();
  }
}
