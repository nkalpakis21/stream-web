#!/usr/bin/env tsx
/**
 * Print funnelEvents counts for one Firebase project and a UTC date range.
 * First-time events print unique users. play and song_shared print total
 * events and unique users. Each line also splits those numbers by platform
 * (web, ios, unknown). Play lines also split events and actors by source
 * (`share_page`, or `none`). Read-only: it only runs a query.
 *
 * Credentials must be for the project you name. A mismatched project_id
 * refuses to run.
 *
 *   tsx scripts/funnel-counts.ts --project stream-dev --from 2026-01-01 --to 2026-01-31
 *   tsx scripts/funnel-counts.ts --project stream-prod --from 2026-11-01 --to 2026-11-09
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
import { COLLECTIONS } from '../lib/firebase/collections';
import { countFunnelRows, formatFunnelCounts, parseFunnelRange } from '../lib/server/funnelCounts';
import {
  resolveSongAudioProject,
  SONG_AUDIO_PROJECTS,
  type SongAudioProjectName,
} from '../lib/server/songAudioProjects';

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function usage(): void {
  console.error(
    'Usage: tsx scripts/funnel-counts.ts --project <stream-dev|stream-prod> --from YYYY-MM-DD --to YYYY-MM-DD'
  );
}

function parseArgs(argv: string[]): {
  project: SongAudioProjectName;
  from: string;
  to: string;
} {
  let projectRaw = '';
  let from = '';
  let to = '';
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
    if (arg === '--from') {
      from = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--from=')) {
      from = arg.slice('--from='.length);
      continue;
    }
    if (arg === '--to') {
      to = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--to=')) {
      to = arg.slice('--to='.length);
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
    process.exit(1);
  }

  const project = resolveSongAudioProject(projectRaw);
  if (!project) {
    console.error('--project is required: stream-dev or stream-prod.');
    usage();
    process.exit(1);
  }
  if (!from || !to) {
    console.error('--from and --to are required (YYYY-MM-DD, UTC, inclusive).');
    usage();
    process.exit(1);
  }
  return { project, from, to };
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
    console.error(`Credentials: ${dedicatedEnv} (${account.project_id})`);
    return account;
  }

  const fromFile = readFileAccount(resolve(process.cwd(), dedicatedFile), dedicatedFile);
  if (fromFile) {
    assertAccount(fromFile, projectId, dedicatedFile);
    console.error(`Credentials: ${dedicatedFile} (${fromFile.project_id})`);
    return fromFile;
  }

  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (pathEnv) {
    const account = readFileAccount(resolve(process.cwd(), pathEnv), 'FIREBASE_SERVICE_ACCOUNT_PATH');
    if (account?.project_id === projectId) {
      assertAccount(account, projectId, 'FIREBASE_SERVICE_ACCOUNT_PATH');
      console.error(`Credentials: FIREBASE_SERVICE_ACCOUNT_PATH (${account.project_id})`);
      return account;
    }
  }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) {
    const account = readFileAccount(resolve(gac), 'GOOGLE_APPLICATION_CREDENTIALS');
    if (account?.project_id === projectId) {
      assertAccount(account, projectId, 'GOOGLE_APPLICATION_CREDENTIALS');
      console.error(`Credentials: GOOGLE_APPLICATION_CREDENTIALS (${account.project_id})`);
      return account;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const account = parseAccount(process.env.FIREBASE_SERVICE_ACCOUNT, 'FIREBASE_SERVICE_ACCOUNT');
    if (account.project_id === projectId) {
      assertAccount(account, projectId, 'FIREBASE_SERVICE_ACCOUNT');
      console.error(`Credentials: FIREBASE_SERVICE_ACCOUNT (${account.project_id})`);
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
  const range = parseFunnelRange(args.from, args.to);
  if (!range) {
    console.error('--from and --to must be real UTC days, with --from on or before --to.');
    process.exit(1);
  }

  const project = SONG_AUDIO_PROJECTS[args.project];
  const account = loadServiceAccount(args.project, project.projectId);
  const app = admin.initializeApp({
    credential: admin.credential.cert(account as admin.ServiceAccount),
    projectId: project.projectId,
  });
  if (app.options.projectId !== project.projectId) {
    console.error(
      `Initialized ${app.options.projectId ?? 'unknown'}, expected ${project.projectId}. Refusing to run.`
    );
    process.exit(1);
  }

  const snap = await admin
    .firestore()
    .collection(COLLECTIONS.funnelEvents)
    .where('at', '>=', admin.firestore.Timestamp.fromMillis(range.fromMs))
    .where('at', '<=', admin.firestore.Timestamp.fromMillis(range.toMs))
    .get();

  const rows = snap.docs.map(doc => {
    const at = doc.get('at') as { toMillis?: () => number } | undefined;
    const atMs = at && typeof at.toMillis === 'function' ? at.toMillis() : Number.NaN;
    return {
      event: doc.get('event'),
      atMs,
      uid: doc.get('uid'),
      platform: doc.get('platform'),
      source: doc.get('source'),
      visitorId: doc.get('visitorId'),
    };
  });
  const counts = countFunnelRows(rows, range.fromMs, range.toMs);
  console.log(
    formatFunnelCounts({
      projectId: project.projectId,
      from: args.from,
      to: args.to,
      counts,
    })
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
