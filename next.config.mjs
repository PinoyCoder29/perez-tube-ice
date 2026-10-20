import crypto from 'crypto';
import withSerwistInit from '@serwist/next';

// PWA: service worker is generated at build time into public/sw.js (disabled in `next dev`).
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: false, // registered by components/pwa/PwaClient.tsx so updates never interrupt a sale
  cacheOnNavigation: false, // never cache visited (private) pages
  reloadOnOnline: false,
  additionalPrecacheEntries: [{ url: '/offline', revision: crypto.randomUUID() }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
      // API responses carry private business data: forbid any HTTP/browser/proxy caching.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      // The worker script itself must always be re-checked so updates are noticed.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};
export default withSerwist(nextConfig);
