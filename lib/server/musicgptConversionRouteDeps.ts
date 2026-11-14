import { getConversionDataByConversionID } from '@/lib/ai/providers/musicgpt';

export type MusicGptConversionRouteDeps = {
  verifyToken?: (idToken: string) => Promise<{ uid: string }>;
  getConversion?: typeof getConversionDataByConversionID;
};

let depsForTests: MusicGptConversionRouteDeps | null = null;

/** Test-only. Production requests always use the real auth and MusicGPT clients. */
export function setMusicGptConversionRouteDepsForTests(
  deps: MusicGptConversionRouteDeps | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MusicGPT conversion route test hooks are disabled in production');
  }
  depsForTests = deps;
}

export function musicGptConversionRouteDeps(): MusicGptConversionRouteDeps {
  if (process.env.NODE_ENV === 'production') return {};
  return depsForTests ?? {};
}
