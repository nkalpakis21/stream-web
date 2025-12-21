/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

