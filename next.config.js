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
  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'lalals.s3.amazonaws.com',
      'lalals.s3.us-east-1.amazonaws.com',
      'lh3.googleusercontent.com',
    ],
  },
}

module.exports = nextConfig

