/**
 * Generate the owned preview clips for the ten Streamstar voices.
 *
 * Each clip sings the same line: "Hold the note and let it fall."
 * A file is written to public/voices/{slug}.mp3 only after MusicGPT returns
 * a real audio URL and the bytes download. This script does not write
 * silence, a tone, or a library preview.
 *
 * Requires MUSICGPT_BASE_URL and MUSICGPT_API_KEY. Without them it exits
 * and writes nothing.
 *
 *   npx tsx scripts/generate-voice-previews.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createMusicGPTSong, getConversionDataByTaskID } from '../lib/ai/providers/musicgpt';
import {
  STREAMSTAR_VOICES,
  VOICE_PREVIEW_LINE,
  voicedRequest,
} from '../lib/voices/streamstarVoices';

const OUT_DIR = path.join(process.cwd(), 'public', 'voices');

function audioUrlFrom(conversion: Record<string, unknown> | undefined): string {
  if (!conversion) return '';
  const candidates = [conversion.conversion_path, conversion.audio_url, conversion.audioUrl];
  for (const value of candidates) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  }
  return '';
}

async function waitForAudio(taskId: string): Promise<string> {
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const data = await getConversionDataByTaskID(taskId);
    const url = audioUrlFrom(data?.conversion);
    if (url) return url;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Preview for task ${taskId} did not return audio`);
}

async function main(): Promise<void> {
  if (!process.env.MUSICGPT_BASE_URL || !process.env.MUSICGPT_API_KEY) {
    console.error(
      'Preview clips were not generated. MUSICGPT_BASE_URL and MUSICGPT_API_KEY are not set, so this script wrote no audio.'
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  for (const voice of STREAMSTAR_VOICES) {
    const voiced = voicedRequest({ prompt: VOICE_PREVIEW_LINE, slug: voice.slug });
    const created = (await createMusicGPTSong({
      prompt: voiced.prompt,
      lyrics: VOICE_PREVIEW_LINE,
      gender: voiced.gender,
      make_instrumental: false,
      title: voice.name,
    })) as { task_id?: string; taskId?: string };
    const taskId = created.task_id || created.taskId || '';
    if (!taskId) throw new Error(`MusicGPT did not return a task for ${voice.slug}`);
    const remote = await waitForAudio(taskId);
    const response = await fetch(remote);
    if (!response.ok) throw new Error(`Download failed for ${voice.slug} (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength < 1000) throw new Error(`Preview for ${voice.slug} was too small to keep`);
    const file = path.join(OUT_DIR, `${voice.slug}.mp3`);
    await writeFile(file, bytes);
    console.log(`wrote ${file} (${bytes.byteLength} bytes)`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Preview generation failed');
  process.exitCode = 1;
});
