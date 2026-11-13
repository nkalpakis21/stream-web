import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getArtistCardContext } from '@/lib/server/artistDisplay';
import { formatDistanceToNow } from 'date-fns';
import {
  adminGetSong,
  adminGetSongGenerations,
  adminGetSongVersions,
} from '@/lib/server/songsAdmin';
import { verifiedViewerIdFromPage } from '@/lib/server/viewer';
import { rejectHiddenSong } from '@/lib/songs/visibility';
import { ClearOwnerRecovery } from '@/components/states/ClearOwnerRecovery';
import { toPlain, type Plain } from '@/lib/serialize/toPlain';
import { VersionCards } from '@/components/songs/VersionCards';
import { SongOwnerActions } from '@/components/songs/SongOwnerActions';
import { publicUrl } from '@/lib/brand/site';
import { isCoverModerationEnabled, resolveVisibleCover } from '@/lib/covers/moderation';
import { resolveCoverPoster } from '@/lib/covers/resolve';
import { LyricsSectionWrapper } from '@/components/lyrics/LyricsSectionWrapper';
import { SongStage } from '@/components/songs/SongStage';
import { SongStageSkeleton } from '@/components/songs/SongStageSkeleton';
import { getLyricsForSong } from '@/lib/services/lyrics';
import { CommentsSection } from '@/components/comments/CommentsSection';
import type { SongDocument, SongVersionDocument } from '@/types/firestore';
import { BeatFirstScreen } from '@/components/songs/BeatFirstScreen';
import { adminGetArtist } from '@/lib/server/artistsAdmin';
import { savedArtistVoice } from '@/lib/server/voiceChange';
import { publicStreamstarVoices } from '@/lib/voices/streamstarVoices';
import type { VoiceGenerationRef, VoiceVersionRef } from '@/lib/songs/voiceChange';
import { playableAudioUrl } from '@/lib/songs/audioAvailability';
import { beatFeelFromOptions, unfinishedBeat } from '@/lib/songs/beatFirst';
import { loadSongShareFacts } from '@/lib/server/songShareFacts';
import { metadataFromShareFacts, sharePageGate } from '@/lib/songs/shareCard';
import { SongTakesPanel } from '@/components/songs/SongTakesPanel';
import {
  buildTakeSlots,
  generationTakeInput,
  listenerVersions,
  shouldShowTakePicker,
  takeSeedFromParts,
} from '@/lib/songs/takes';

function primaryVersion(
  song: { currentVersionId?: string },
  versions: Array<{ id: string; audioURL?: string | null; isPrimary?: boolean }>
) {
  return (
    versions.find(version => version.isPrimary && version.audioURL) ||
    versions.find(version => version.id === song.currentVersionId && version.audioURL) ||
    versions.find(version => version.audioURL) ||
    versions.find(version => version.id === song.currentVersionId) ||
    versions[0]
  );
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface SongPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: SongPageProps): Promise<Metadata> {
  noStore();
  const viewerId = await verifiedViewerIdFromPage();
  const facts = await loadSongShareFacts(params.id, viewerId);
  const resolved = metadataFromShareFacts(facts);
  if (resolved.notFound) notFound();
  return resolved.metadata;
}

async function SongPageBody({
  song,
  allVersions,
  viewerId,
}: {
  song: Plain<SongDocument>;
  allVersions: Plain<SongVersionDocument>[];
  viewerId: string | null;
}) {
  const [artistContext, generations] = await Promise.all([
    getArtistCardContext([song.artistId]),
    adminGetSongGenerations(song.id),
  ]);
  const artist = artistContext.displays.get(song.artistId) ?? null;
  const hasPendingGeneration = generations.some(
    generation => generation.status === 'pending' || generation.status === 'processing'
  );
  const createdAt = typeof song.createdAt === 'number' ? song.createdAt : 0;
  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });

  const artistName = artist?.name || 'Unknown Artist';
  const visible = resolveVisibleCover(song, {
    enabled: isCoverModerationEnabled(),
    faceUrl: artist?.photoUrl ?? null,
    artistName,
  });
  const coverImageUrl = (visible.fallback ? visible.fields.coverPosterUrl : resolveCoverPoster(visible.fields)) ?? null;
  const ownerView = viewerId != null && viewerId === song.ownerId;
  const ownerArtist = ownerView ? await adminGetArtist(song.artistId) : null;
  const artistVoice = ownerView ? await savedArtistVoice(song.artistId, song.artistVersionId) : null;
  const voiceCard = publicStreamstarVoices().find(voice => voice.slug === ownerArtist?.voiceSlug) ?? null;
  const ownerCoverNotice = ownerView ? visible.notice : null;
  const primaryAudioUrl = playableAudioUrl(allVersions);
  const lyrics = getLyricsForSong(generations);

  const shareUrl = publicUrl(`/songs/${song.id}`);
  const artistLinkable = artist?.isPublic === true;
  const takeSeed = takeSeedFromParts({
    currentVersionId: song.currentVersionId,
    versions: allVersions.map((version) => ({
      id: version.id,
      audioURL: version.audioURL,
      providerOutputId: version.providerOutputId,
      isPrimary: version.isPrimary,
      versionNumber: version.versionNumber,
    })),
    generations: generations.map((generation) => generationTakeInput(generation)),
  });
  const beatDraft = ownerView && unfinishedBeat(song);
  const beatFeel = beatFeelFromOptions(song);
  const showTakePicker =
    viewerId === song.ownerId && !beatDraft && shouldShowTakePicker(buildTakeSlots(takeSeed));
  const heardVersions = listenerVersions(allVersions, song.currentVersionId);

  return (
    <div className="min-h-screen bg-background">
      <ClearOwnerRecovery kind="song" id={song.id} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <SongStage
          songId={song.id}
          songTitle={song.title}
          artistId={song.artistId}
          artistLinkable={artistLinkable}
          artistPhotoUrl={artist?.photoUrl ?? null}
          artistName={artistName}
          albumCoverUrl={coverImageUrl}
          cover={visible.fields}
          emptyInitials={visible.initials}
          ownerCoverNotice={ownerCoverNotice}
          audioUrl={primaryAudioUrl}
          pending={hasPendingGeneration && !beatDraft}
          belowCover={
            beatDraft ? (
              <BeatFirstScreen
                songId={song.id}
                artistId={song.artistId}
                artistName={artistName}
                initialSeed={takeSeed}
                retriesUsed={song.beatFirst?.retriesUsed ?? 0}
                stage={song.beatFirst?.stage ?? 'generating'}
                prompt={song.createPrompt ?? ''}
                feel={beatFeel.feel}
                energy={beatFeel.energy}
                voiceDisplay={voiceCard ? { name: voiceCard.name, descriptor: voiceCard.descriptor } : null}
              />
            ) : null
          }
          durationSeconds={song.duration ?? null}
          shareUrl={shareUrl}
          versions={heardVersions.map(version => ({
            id: version.id,
            audioURL: version.audioURL,
            isPrimary: version.isPrimary,
            audioExpired: version.audioExpired === true,
            duration: song.duration ?? null,
          }))}
        >
          {lyrics && (
            <div className="mt-8">
              <LyricsSectionWrapper
                lyrics={lyrics}
                songTitle={song.title}
                artistName={artistName}
                albumCoverUrl={coverImageUrl}
                audioUrl={primaryAudioUrl}
              />
            </div>
          )}
        </SongStage>
        <div className="mt-6 mb-10 flex flex-col items-start gap-3">
          <SongOwnerActions
            songId={song.id}
            songTitle={song.title}
            ownerId={song.ownerId}
            artistVoice={artistVoice}
            voices={ownerView ? publicStreamstarVoices() : []}
            songVoiceSlug={ownerView ? song.voiceSlug ?? null : null}
            song={
              ownerView
                ? {
                    path: song.path ?? null,
                    currentVersionId: song.currentVersionId,
                    audioReady: song.audioReady ?? null,
                    duration: song.duration ?? null,
                    createOptions: song.createOptions ?? null,
                    beatFirst: song.beatFirst
                      ? { stage: song.beatFirst.stage, chosenVersionId: song.beatFirst.chosenVersionId ?? null }
                      : null,
                    voiceChange: song.voiceChange ?? null,
                  }
                : { currentVersionId: song.currentVersionId }
            }
            versions={
              ownerView
                ? allVersions.map(
                    (version): VoiceVersionRef => ({
                      id: version.id,
                      audioURL: version.audioURL,
                      providerOutputId: version.providerOutputId,
                      isPrimary: version.isPrimary,
                      versionNumber: version.versionNumber,
                    })
                  )
                : []
            }
            generations={
              ownerView
                ? generations.map(
                    (generation): VoiceGenerationRef => ({
                      id: generation.id,
                      status: generation.status,
                      createdAtMs:
                        generation.createdAt && typeof generation.createdAt.toMillis === 'function'
                          ? generation.createdAt.toMillis()
                          : null,
                      providerConversionIds: generation.providerConversionIds,
                      providerFailedConversions: generation.providerFailedConversions ?? null,
                      parameters: generation.parameters
                        ? {
                            job: generation.parameters.job,
                            purpose: generation.parameters.purpose,
                            sourceVersionId: generation.parameters.sourceVersionId,
                          }
                        : null,
                      output: { metadata: (generation.output?.metadata as Record<string, unknown> | null) ?? null },
                    })
                  )
                : []
            }
          />
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 sm:mt-3">
            Created {timeAgo}
          </p>
        </div>

        {showTakePicker && takeSeed ? (
          <SongTakesPanel songId={song.id} initial={takeSeed} />
        ) : (
          <VersionCards
            songTitle={song.title}
            artistName={artistName}
            artistId={artist?.id}
            albumCoverUrl={coverImageUrl}
            initialVersions={allVersions}
            hasPendingGeneration={hasPendingGeneration}
            songId={song.id}
            ownerId={song.ownerId}
          />
        )}

        <CommentsSection targetType="song" targetId={song.id} />
      </main>
    </div>
  );
}

export default async function SongPage({ params }: SongPageProps) {
  noStore();
  const [viewerId, song] = await Promise.all([
    verifiedViewerIdFromPage(),
    adminGetSong(params.id),
  ]);
  rejectHiddenSong(song, viewerId);
  if (sharePageGate(song, viewerId) === 'not-found') notFound();

  const allVersions = await adminGetSongVersions(song.id);
  if (!primaryVersion(song, allVersions)) {
    notFound();
  }

  return (
    <Suspense fallback={<SongStageSkeleton />}>
      <SongPageBody song={toPlain(song)} allVersions={toPlain(allVersions)} viewerId={viewerId} />
    </Suspense>
  );
}
