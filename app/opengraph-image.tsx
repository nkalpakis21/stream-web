import { ImageResponse } from 'next/og';

export const alt = 'Stream ⭐ — AI-Native Music Platform';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'linear-gradient(135deg, #000000 0%, #1d1d1f 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Logo placeholder - replace with actual logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 200,
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 40,
            }}
          >
            <span style={{ fontSize: 120 }}>⭐</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              color: '#f5f5f7',
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            Stream ⭐
          </div>
          <div
            style={{
              color: '#86868b',
              fontSize: 32,
              fontWeight: 400,
            }}
          >
            AI-Native Music Platform
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}



