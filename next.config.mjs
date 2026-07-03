/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Next/Turbopack doesn't pick a stray
  // lockfile in a parent directory (e.g. C:\Users\HP\package-lock.json).
  turbopack: { root: import.meta.dirname },
  // Service worker + manifest are served from /public.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
