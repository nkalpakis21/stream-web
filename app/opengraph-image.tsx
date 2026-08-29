import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const alt = 'Streamstar';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  let iconSrc: string | null = null;
  try {
    const bytes = await readFile(join(process.cwd(), 'public', 'icon-512x512.png'));
    iconSrc = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    iconSrc = null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0A0A10',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconSrc} width={180} height={180} alt="" />
        ) : null}
        <div
          style={{
            color: '#f5f5f7',
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: '-0.03em',
          }}
        >
          Streamstar
        </div>
      </div>
    ),
    { ...size }
  );
}
