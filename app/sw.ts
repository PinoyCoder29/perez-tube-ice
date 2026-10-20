/// <reference lib="webworker" />
/**
 * Service worker (built by @serwist/next, a maintained PWA toolkit for Next.js).
 *
 * Caching policy — deliberately narrow:
 *  - ONLY versioned static assets (/_next/static, icons) and the precached app shell files are cached.
 *  - /api/* and page navigations are NetworkOnly: customer data, payments, debts and sessions are never stored by the worker.
 *  - If a page can't be fetched (offline) the user sees the static /offline page. Nothing is ever "saved" offline.
 */
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // a new worker waits until the user taps "Update" (never swaps mid-sale)
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    { matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate', handler: new NetworkOnly() },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({ cacheName: 'perez-static', plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60 })] }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/icons/'),
      handler: new StaleWhileRevalidate({ cacheName: 'perez-icons' }),
    },
  ],
  fallbacks: { entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }] },
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

serwist.addEventListeners();
