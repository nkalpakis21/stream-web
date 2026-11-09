import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import {
  postMusicGptGeneration,
  setMusicGptGenerationDepsForTests,
} from '../lib/server/musicgptGeneration';
import { gateSongGenerationRetry } from '../lib/server/songRetryGate';
import {
  GENERATION_RETRY_HARD_CAP_MS,
  decideSongRetry,
} from '../lib/songs/generationRetry';
import type { GenerationDocument, SongDocument } from '../types/firestore';

function shell(createdAtMs: number): SongDocument {
  const createdAt = Timestamp.fromMillis(createdAtMs);
  return {
    id: 'song-1',
    ownerId: 'owner',
    artistId: 'artist-1',
    artistVersionId: 'av-1',
    title: 'Mr hanky',
    isPublic: false,
    audioReady: false,
    createdAt: createdAt as unknown as SongDocument['createdAt'],
    updatedAt: createdAt as unknown as SongDocument['updatedAt'],
    deletedAt: null,
    currentVersionId: 'ver',
    parentSongId: null,
    collaborationType: null,
    albumCoverPath: null,
    albumCoverThumbnail: null,
  };
}

function generation(status: GenerationDocument['status'], taskId: string | null): GenerationDocument {
  return {
    id: 'gen-1',
    songId: 'song-1',
    artistVersionId: 'av-1',
    songVersionId: null,
    prompt: { structured: {}, freeText: 'a rainy chorus' },
    parameters: {},
    provider: 'musicgpt',
    status,
    providerTaskId: taskId,
    providerConversionIds: null,
    providerProcessedConversions: [],
    output: { audioURL: null, stems: null, metadata: {} },
    error: null,
    createdAt: Timestamp.fromMillis(0) as unknown as GenerationDocument['createdAt'],
    completedAt: null,
    contentHash: null,
  };
}

describe('song retry gate', () => {
  const now = 1_700_000_000_000;

  it('does not resubmit while the task is pending or processing', () => {
    assert.equal(
      decideSongRetry({
        nowMs: now,
        createdAtMs: now - 20 * 60 * 1000,
        generationStatus: 'pending',
        providerStatus: 'pending',
      }),
      'still_generating'
    );
    assert.equal(
      decideSongRetry({
        nowMs: now,
        createdAtMs: now - 20 * 60 * 1000,
        generationStatus: 'failed',
        providerStatus: 'processing',
      }),
      'still_generating'
    );
  });

  it('resubmits a confirmed failure, and a missing task only after 60 minutes', () => {
    assert.equal(
      decideSongRetry({
        nowMs: now,
        createdAtMs: now - 20 * 60 * 1000,
        generationStatus: 'pending',
        providerStatus: 'failed',
      }),
      'resubmit'
    );
    assert.equal(
      decideSongRetry({
        nowMs: now,
        createdAtMs: now - GENERATION_RETRY_HARD_CAP_MS + 1,
        generationStatus: 'missing',
        providerStatus: null,
      }),
      'still_generating'
    );
    assert.equal(
      decideSongRetry({
        nowMs: now,
        createdAtMs: now - GENERATION_RETRY_HARD_CAP_MS,
        generationStatus: 'missing',
        providerStatus: null,
      }),
      'resubmit'
    );
  });

  it('does not resubmit while the stored task is still pending', async () => {
    let statusReads = 0;
    const decision = await gateSongGenerationRetry('song-1', {
      nowMs: now,
      getSong: async () => shell(now - 20 * 60 * 1000),
      listGenerations: async () => [generation('pending', 'task-live')],
      readProviderStatus: async (taskId) => {
        statusReads += 1;
        assert.equal(taskId, 'task-live');
        return 'pending';
      },
    });
    assert.equal(decision, 'still_generating');
    assert.equal(statusReads, 1);
  });
});

describe('POST /api/generations/musicgpt retry gate', () => {
  const previous: Record<string, string | undefined> = {};

  function setEnv(name: string, value: string) {
    if (!(name in previous)) previous[name] = process.env[name];
    process.env[name] = value;
  }

  afterEach(() => {
    setMusicGptGenerationDepsForTests(null);
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('does not call MusicGPT when the existing task is still generating', async () => {
    setEnv('WEBHOOK_BASE_URL', 'https://configured.example');
    setEnv('MUSICGPT_WEBHOOK_SECRET', 'webhook-secret');
    let musicCalls = 0;
    setMusicGptGenerationDepsForTests({
      verifyToken: async () => ({ uid: 'owner' }),
      getSong: async () => shell(Date.now() - 20 * 60 * 1000),
      gateRetry: async () => 'still_generating',
      createMusic: async () => {
        musicCalls += 1;
        throw new Error('should not start a second paid generation');
      },
    });
    const response = await postMusicGptGeneration(
      new NextRequest('https://configured.example/api/generations/musicgpt', {
        method: 'POST',
        headers: {
          authorization: 'Bearer good-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'a rainy chorus', songId: 'song-1' }),
      })
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.stillGenerating, true);
    assert.equal(musicCalls, 0);
  });
});
