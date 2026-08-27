/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
    };
    return config;
  },
  async redirects() {
    return [
      {
        source: '/investors',
        destination: '/investing',
        permanent: true,
      },
      {
        source: '/songs/:id/fork',
        destination: '/songs/:id',
        permanent: false,
      },
      {
        source: '/songs/:id/remix',
        destination: '/songs/:id',
        permanent: false,
      },
    ];
  },
  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'lalals.s3.amazonaws.com',
      'lalals.s3.us-east-1.amazonaws.com',
      'lh3.googleusercontent.com',
      'fal.media',
      'v3.fal.media',
    ],
    remotePatterns: [
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '*.fal.media' },
    ],
  },
}

module.exports = nextConfig

