#!/usr/bin/env tsx
/**
 * Copy song MP3s off MusicGPT and onto Firebase Storage.
 *
 * Dry-run is the default. It counts and HEAD/GET-checks. It does not write
 * Firestore or Storage. It does write a local unfetchable log under
 * backfill-logs/. --apply downloads, uploads, and rewrites audio URLs.
 * It never deletes. A 5xx or network error is counted as failed and is
 * left unmarked so a later run can retry. 404/410, 401/403, and other 4xx
 * keep the current URL and, only with --apply, set audioExpired.
 *
 * Credentials must be for the project you name. A mismatched project_id
 * refuses to run. This does not flip MUSICGPT_API_VERSION.
 *
 *   tsx scripts/backfill-song-audio.ts --project stream-dev --dry-run
 *   tsx scripts/backfill-song-audio.ts --project stream-dev --dry-run --limit 20
 *   tsx scripts/backfill-song-audio.ts --project stream-dev --apply
 *   tsx scripts/backfill-song-audio.ts --project stream-prod --dry-run
 *   tsx scripts/backfill-song-audio.ts --project stream-prod --apply
 *
 * stream-dev bucket: stream-dev-48098.firebasestorage.app
 * stream-prod bucket: stream-prod-864df.firebasestorage.app
 *
 * stream-dev creds: FIREBASE_SERVICE_ACCOUNT_STREAM_DEV, or
 * serviceAccountKey.dev.json, or FIREBASE_SERVICE_ACCOUNT whose project_id
 * is stream-dev-48098.
 * stream-prod creds: FIREBASE_SERVICE_ACCOUNT_PROD, or serviceAccountKey.json,
 * or FIREBASE_SERVICE_ACCOUNT whose project_id is stream-prod-864df.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as admin from 'firebase-admin';
import {
  backfillSongAudio,
  formatBackfillSummary,
  type AudioBackfillDb,
} from '../lib/server/backfillSongAudio';
import {
  resolveSongAudioProject,
  SONG_AUDIO_PROJECTS,
  type SongAudioProjectName,
} from '../lib/server/songAudioProjects';
import type { SongAudioBucket } from '../lib/server/songAudioStorage';

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseArgs(argv: string[]): {
  project: SongAudioProjectName;
  dryRun: boolean;
  limit: number | null;
} {
  let projectRaw = '';
  let limit: number | null = null;
  const dryRunFlag = argv.includes('--dry-run');
  const applyFlag = argv.includes('--apply');

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      projectRaw = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--project=')) {
      projectRaw = arg.slice('--project='.length);
      continue;
    }
    if (arg === '--limit') {
      limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      limit = Number(arg.slice('--limit='.length));
      continue;
    }
    if (arg === '--dry-run' || arg === '--apply') continue;
    console.error(`Unknown argument: ${arg}`);
    usage();
    process.exit(1);
  }

  if (dryRunFlag && applyFlag) {
    console.error('Pass only one of --dry-run or --apply.');
    process.exit(1);
  }
  const project = resolveSongAudioProject(projectRaw);
  if (!project) {
    console.error('--project is required: stream-dev or stream-prod.');
    usage();
    process.exit(1);
  }
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
    console.error('--limit must be a positive integer.');
    process.exit(1);
  }
  return { project, dryRun: !applyFlag, limit };
}

function usage(): void {
  console.error(
    'Usage: tsx scripts/backfill-song-audio.ts --project <stream-dev|stream-prod> [--dry-run] [--apply] [--limit N]'
  );
}

function parseAccount(text: string, label: string): ServiceAccount {
  try {
    const parsed = JSON.parse(text) as ServiceAccount;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch {
    console.error(`${label} is not valid JSON. Refusing to run.`);
    process.exit(1);
  }
}

function assertAccount(account: ServiceAccount, projectId: string, label: string): void {
  if (account.project_id !== projectId) {
    console.error(
      `${label} project_id is ${account.project_id ?? 'missing'}, expected ${projectId}. Refusing to run.`
    );
    process.exit(1);
  }
  if (!account.client_email || !account.private_key) {
    console.error(`${label} is missing client_email or private_key. Refusing to run.`);
    process.exit(1);
  }
}

function readFileAccount(path: string, label: string): ServiceAccount | null {
  if (!existsSync(path)) return null;
  return parseAccount(readFileSync(path, 'utf8'), label);
}

function loadServiceAccount(name: SongAudioProjectName, projectId: string): ServiceAccount {
  const dedicatedEnv =
    name === 'stream-dev' ? 'FIREBASE_SERVICE_ACCOUNT_STREAM_DEV' : 'FIREBASE_SERVICE_ACCOUNT_PROD';
  const dedicatedFile = name === 'stream-dev' ? 'serviceAccountKey.dev.json' : 'serviceAccountKey.json';

  if (process.env[dedicatedEnv]) {
    const account = parseAccount(process.env[dedicatedEnv] ?? '', dedicatedEnv);
    assertAccount(account, projectId, dedicatedEnv);
    console.log(`Credentials: ${dedicatedEnv} (${account.project_id})`);
    return account;
  }

  const dedicatedPath = resolve(process.cwd(), dedicatedFile);
  const fromFile = readFileAccount(dedicatedPath, dedicatedFile);
  if (fromFile) {
    assertAccount(fromFile, projectId, dedicatedFile);
    console.log(`Credentials: ${dedicatedFile} (${fromFile.project_id})`);
    return fromFile;
  }

  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (pathEnv) {
    const account = readFileAccount(resolve(process.cwd(), pathEnv), 'FIREBASE_SERVICE_ACCOUNT_PATH');
    if (account?.project_id === projectId) {
      assertAccount(account, projectId, 'FIREBASE_SERVICE_ACCOUNT_PATH');
      console.log(`Credentials: FIREBASE_SERVICE_ACCOUNT_PATH (${account.project_id})`);
      return account;
    }
  }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) {
    const account = readFileAccount(resolve(gac), 'GOOGLE_APPLICATION_CREDENTIALS');
    if (account?.project_id === projectId) {
      assertAccount(account, projectId, 'GOOGLE_APPLICATION_CREDENTIALS');
      console.log(`Credentials: GOOGLE_APPLICATION_CREDENTIALS (${account.project_id})`);
      return account;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const account = parseAccount(process.env.FIREBASE_SERVICE_ACCOUNT, 'FIREBASE_SERVICE_ACCOUNT');
    if (account.project_id === projectId) {
      assertAccount(account, projectId, 'FIREBASE_SERVICE_ACCOUNT');
      console.log(`Credentials: FIREBASE_SERVICE_ACCOUNT (${account.project_id})`);
      return account;
    }
    console.error(
      `FIREBASE_SERVICE_ACCOUNT is for ${account.project_id ?? 'unknown'}, not ${projectId}. Refusing to run.`
    );
    process.exit(1);
  }

  console.error(
    `No credentials for ${projectId}. Set ${dedicatedEnv}, or add ${dedicatedFile} with that project_id.`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const project = SONG_AUDIO_PROJECTS[args.project];
  const account = loadServiceAccount(args.project, project.projectId);

  process.env.FIREBASE_STORAGE_BUCKET = project.bucket;
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = project.bucket;

  const app = admin.initializeApp({
    credential: admin.credential.cert(account as admin.ServiceAccount),
    projectId: project.projectId,
    storageBucket: project.bucket,
  });
  if (app.options.projectId !== project.projectId) {
    console.error(
      `Initialized ${app.options.projectId ?? 'unknown'}, expected ${project.projectId}. Refusing to run.`
    );
    process.exit(1);
  }

  const bucket = app.storage().bucket(project.bucket);
  console.log(
    `project=${project.projectId} bucket=${project.bucket} mode=${args.dryRun ? 'dry-run' : 'apply'} limit=${args.limit ?? 'none'}`
  );
  if (!args.dryRun) {
    console.log('apply writes Storage objects and audio URL fields. It does not delete anything.');
  }

  const summary = await backfillSongAudio({
    db: admin.firestore() as unknown as AudioBackfillDb,
    bucket: bucket as unknown as SongAudioBucket,
    dryRun: args.dryRun,
    limit: args.limit,
    projectLabel: args.project,
    logDir: resolve(process.cwd(), 'backfill-logs'),
  });
  console.log(formatBackfillSummary(summary));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
