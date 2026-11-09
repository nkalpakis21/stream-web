import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  firebaseAudioDownloadUrl,
  persistConversionAudio,
  probeRemoteAudio,
  setSongAudioStorageDepsForTests,
  songAudioObjectPath,
  type SongAudioBucket,
  type SongAudioFile,
} from '../lib/server/songAudioStorage';

const BUCKET = 'stream-dev-48098.firebasestorage.app';
const SOURCE = 'https://cdn1.musicgpt.com/conversions/api/standard/conv-1/conv-1.mp3';

type Stored = {
  bytes: Buffer;
  token: string;
  contentType?: string;
};

function createBucket(): SongAudioBucket & { files: Map<string, Stored>; saves: string[] } {
  const files = new Map<string, Stored>();
  const saves: string[] = [];
  return {
    name: BUCKET,
    files,
    saves,
    file(objectPath: string): SongAudioFile {
      return {
        async exists() {
          return [files.has(objectPath)];
        },
        async getMetadata() {
          const row = files.get(objectPath);
          if (!row) {
            const error = new Error('missing') as Error & { code: number };
            error.code = 404;
            throw error;
          }
          return [{ metadata: { firebaseStorageDownloadTokens: row.token } }];
        },
        async save(data, options) {
          saves.push(objectPath);
          files.set(objectPath, {
            bytes: Buffer.from(data),
            token: options.metadata?.metadata?.firebaseStorageDownloadTokens ?? '',
            contentType: options.metadata?.contentType,
          });
        },
        async setMetadata(metadata) {
          const row = files.get(objectPath);
          if (!row) throw new Error('missing');
          row.token = metadata.metadata?.firebaseStorageDownloadTokens ?? row.token;
        },
      };
    },
  };
}

function jsonResponse(status: number, body = ''): Response {
  return new Response(body, { status });
}

afterEach(() => {
  setSongAudioStorageDepsForTests(null);
});

describe('persistConversionAudio', () => {
  it('uploads the MP3 and returns a tokenized download URL', async () => {
    const bucket = createBucket();
    const fetches: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetches.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return jsonResponse(200, 'mp3');
    }) as typeof fetch;

    const result = await persistConversionAudio({
      songId: 'song-1',
      conversionId: 'conv-1',
      sourceUrl: SOURCE,
      bucket,
      fetchImpl,
    });

    const objectPath = songAudioObjectPath('song-1', 'conv-1');
    assert.equal(objectPath, 'songs/song-1/audio/conv-1.mp3');
    assert.equal(result.audioPersisted, true);
    assert.equal(result.musicgptAudioUrl, SOURCE);
    assert.equal(result.reason, 'ok');
    const stored = bucket.files.get(objectPath);
    assert.equal(stored?.contentType, 'audio/mpeg');
    assert.ok(stored?.token);
    assert.equal(
      result.audioURL,
      firebaseAudioDownloadUrl(BUCKET, objectPath, stored?.token ?? '')
    );
    assert.deepEqual(fetches, [`GET ${SOURCE}`]);
  });

  it('reuses the existing object and does not download again', async () => {
    const bucket = createBucket();
    const objectPath = songAudioObjectPath('song-1', 'conv-1');
    bucket.files.set(objectPath, {
      bytes: Buffer.from('already'),
      token: 'token-kept',
      contentType: 'audio/mpeg',
    });
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      throw new Error('fetch should not run');
    }) as typeof fetch;

    const result = await persistConversionAudio({
      songId: 'song-1',
      conversionId: 'conv-1',
      sourceUrl: SOURCE,
      bucket,
      fetchImpl,
    });

    assert.equal(fetched, 0);
    assert.equal(bucket.saves.length, 0);
    assert.equal(result.audioPersisted, true);
    assert.equal(result.musicgptAudioUrl, SOURCE);
    assert.equal(result.audioURL, firebaseAudioDownloadUrl(BUCKET, objectPath, 'token-kept'));
  });

  it('keeps the MusicGPT URL when the download fails', async () => {
    const bucket = createBucket();
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    try {
      const fetchImpl = (async () => jsonResponse(404, 'gone')) as typeof fetch;
      const result = await persistConversionAudio({
        songId: 'song-1',
        conversionId: 'conv-1',
        sourceUrl: SOURCE,
        bucket,
        fetchImpl,
      });
      assert.equal(result.audioPersisted, false);
      assert.equal(result.audioURL, SOURCE);
      assert.equal(result.musicgptAudioUrl, SOURCE);
      assert.equal(result.httpStatus, 404);
      assert.equal(result.reason, 'not_found');
      assert.equal(bucket.saves.length, 0);
      assert.equal(errors.some((line) => line.includes('song_audio_persist_failed')), true);
      assert.equal(errors.some((line) => line.includes('status=404')), true);
    } finally {
      console.error = original;
    }
  });

  it('does not upload a URL that is already in our bucket', async () => {
    const bucket = createBucket();
    const stored = firebaseAudioDownloadUrl(BUCKET, 'songs/song-1/audio/conv-1.mp3', 't');
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      return jsonResponse(200, 'mp3');
    }) as typeof fetch;
    const result = await persistConversionAudio({
      songId: 'song-1',
      conversionId: 'conv-1',
      sourceUrl: stored,
      bucket,
      fetchImpl,
    });
    assert.equal(fetched, 0);
    assert.equal(result.audioPersisted, true);
    assert.equal(result.audioURL, stored);
  });
});

describe('probeRemoteAudio', () => {
  it('stops after a successful HEAD', async () => {
    const methods: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const result = await probeRemoteAudio(SOURCE, fetchImpl);
    assert.equal(result.reason, 'ok');
    assert.deepEqual(methods, ['HEAD']);
  });

  it('GETs when HEAD is forbidden and trusts the GET status', async () => {
    const methods: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      methods.push(method);
      return new Response(method === 'HEAD' ? null : 'ok', { status: method === 'HEAD' ? 403 : 200 });
    }) as typeof fetch;
    const result = await probeRemoteAudio(SOURCE, fetchImpl);
    assert.equal(result.reason, 'ok');
    assert.equal(result.httpStatus, 200);
    assert.deepEqual(methods, ['HEAD', 'GET']);
  });

  it('reports 404 after HEAD and GET both miss', async () => {
    const fetchImpl = (async () => new Response('gone', { status: 404 })) as typeof fetch;
    const result = await probeRemoteAudio(SOURCE, fetchImpl);
    assert.equal(result.reason, 'not_found');
    assert.equal(result.httpStatus, 404);
  });
});
