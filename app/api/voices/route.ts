import { noStoreJson } from '@/lib/http/noStore';
import { publicStreamstarVoices } from '@/lib/voices/streamstarVoices';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/** Name, descriptor, gender, and preview path. Locked prompts are not included. */
export function GET() {
  return noStoreJson({ voices: publicStreamstarVoices() });
}
