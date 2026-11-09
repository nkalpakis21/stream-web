import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageResponse } from 'next/og';
import {
  layoutShareArtist,
  layoutShareTitle,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_PADDING,
  SHARE_CARD_WIDTH,
  SHARE_COLUMN_WIDTH,
  SHARE_COVER_RADIUS,
  SHARE_COVER_SIZE,
  SHARE_FACE_SIZE,
  SHARE_LISTEN,
  shareImageContentType,
  type ShareArt,
} from '@/lib/songs/shareCard';

const ICE = '#E8E6F2';
const INK = '#0A0A10';
const INITIALS_BG = '#14141C';

type FontData = ArrayBuffer;

let fonts: { name: string; data: FontData; weight: 600; style: 'normal' }[] | null = null;
let wordmarkSrc: string | null = null;

function fontBuffer(file: string): FontData {
  const buf = readFileSync(join(process.cwd(), 'assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as FontData;
}

function shareFonts() {
  if (!fonts) {
    fonts = [
      { name: 'Figtree', data: fontBuffer('Figtree-600.woff'), weight: 600, style: 'normal' },
      {
        name: 'Playfair Display',
        data: fontBuffer('PlayfairDisplay-600.woff'),
        weight: 600,
        style: 'normal',
      },
    ];
  }
  return fonts;
}

/** Shipped mark. icon.svg is the Streamstar asset; the card does not draw a new logo. */
function wordmarkDataUri(): string {
  if (!wordmarkSrc) {
    const svg = readFileSync(join(process.cwd(), 'public/icon.svg'));
    wordmarkSrc = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  }
  return wordmarkSrc;
}

export function brandOgImageResponse(): Response {
  const bytes = readFileSync(join(process.cwd(), 'public/og-image.png'));
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

async function imageDataUri(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 8_000_000) return null;
    const type = shareImageContentType(response.headers.get('content-type'), bytes);
    if (!type) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

function initialsBlock(initials: string, fontSize: number) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: INITIALS_BG,
        color: ICE,
        fontFamily: 'Figtree',
        fontWeight: 600,
        fontSize,
      }}
    >
      {initials}
    </div>
  );
}

function photo(src: string, size: number) {
  return (
    // Satori paints this card. next/image cannot run inside ImageResponse.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'cover' }}
    />
  );
}

export async function renderSongShareCard(input: {
  title: string;
  artistName: string;
  art: Extract<ShareArt, { kind: 'card' }>;
  versionMs: number | null;
}): Promise<Response> {
  const squareSrc = input.art.square.type === 'image' ? await imageDataUri(input.art.square.url) : null;
  const faceSrc =
    input.art.face.type === 'image'
      ? input.art.square.type === 'image' && input.art.face.url === input.art.square.url
        ? squareSrc
        : await imageDataUri(input.art.face.url)
      : null;

  const squareFailed = input.art.square.type === 'image' && !squareSrc;
  const faceFailed = input.art.face.type === 'image' && !faceSrc;
  if (squareFailed && (input.art.face.type !== 'image' || faceFailed)) {
    return brandOgImageResponse();
  }

  const square = squareSrc
    ? photo(squareSrc, SHARE_COVER_SIZE)
    : faceSrc
      ? photo(faceSrc, SHARE_COVER_SIZE)
      : initialsBlock(input.art.face.type === 'initials' ? input.art.face.initials : '?', 160);
  const face = faceSrc
    ? photo(faceSrc, SHARE_FACE_SIZE)
    : initialsBlock(input.art.face.type === 'initials' ? input.art.face.initials : '?', 26);

  const title = layoutShareTitle(input.title);
  const artist = layoutShareArtist(input.artistName);
  const cache =
    input.versionMs == null
      ? 'public, max-age=3600'
      : 'public, max-age=604800';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: INK,
          padding: SHARE_CARD_PADDING,
        }}
      >
        <div
          style={{
            width: SHARE_COVER_SIZE,
            height: SHARE_COVER_SIZE,
            display: 'flex',
            borderRadius: SHARE_COVER_RADIUS,
            overflow: 'hidden',
            background: INITIALS_BG,
          }}
        >
          {square}
        </div>
        <div style={{ width: 60, height: SHARE_COVER_SIZE, display: 'flex' }} />
        <div
          style={{
            width: SHARE_COLUMN_WIDTH,
            height: SHARE_COVER_SIZE,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: SHARE_FACE_SIZE,
                height: SHARE_FACE_SIZE,
                borderRadius: SHARE_FACE_SIZE / 2,
                overflow: 'hidden',
                display: 'flex',
                background: INITIALS_BG,
                flexShrink: 0,
              }}
            >
              {face}
            </div>
            <div style={{ width: 16, display: 'flex' }} />
            <div
              style={{
                display: 'flex',
                fontFamily: 'Figtree',
                fontWeight: 600,
                fontSize: 30,
                color: 'rgba(232, 230, 242, 0.7)',
                lineHeight: 1.2,
              }}
            >
              {artist}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
            {title.lines.map((line, index) => (
              <div
                key={`${index}-${line}`}
                style={{
                  display: 'flex',
                  fontFamily: 'Playfair Display',
                  fontWeight: 600,
                  fontSize: title.fontSize,
                  color: ICE,
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                }}
              >
                {line}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: 'auto', alignItems: 'flex-end' }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                background: ICE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="34" height="34" viewBox="0 0 34 34" style={{ marginLeft: 4 }}>
                <polygon points="8,4 28,17 8,30" fill={INK} />
              </svg>
            </div>
            <div style={{ width: 16, display: 'flex' }} />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 96,
                fontFamily: 'Figtree',
                fontWeight: 600,
                fontSize: 24,
                color: 'rgba(232, 230, 242, 0.6)',
              }}
            >
              {SHARE_LISTEN}
            </div>
            <div style={{ display: 'flex', marginLeft: 'auto' }}>
              {/* Existing public/icon.svg. Satori needs a plain img. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wordmarkDataUri()} alt="" width={64} height={64} />
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: SHARE_CARD_WIDTH,
      height: SHARE_CARD_HEIGHT,
      fonts: shareFonts(),
      headers: { 'Cache-Control': cache },
    }
  );
}
