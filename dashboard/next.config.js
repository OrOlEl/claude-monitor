/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static page caching in dev for instant updates
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        { key: 'Pragma', value: 'no-cache' },
      ],
    },
  ],
};
module.exports = nextConfig;
