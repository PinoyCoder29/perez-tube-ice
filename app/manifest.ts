import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest and linked automatically by Next.js.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Perez Ice Business Management System',
    short_name: 'Perez Ice',
    description: 'Ice sales, deliveries, customer credit (utang), expenses and reports for Perez Ice — POS for Staff, management for Admin.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#0b2545',
    background_color: '#f3f6fa',
    lang: 'en-PH',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
