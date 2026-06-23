// Mission Control cache killer.
// This file intentionally does not cache dashboard assets. It exists to replace
// any older service worker at this path, clear stale browser caches, reload open
// dashboard clients once, and then unregister itself.

const CACHE_KILLER_ID = 'mission-control-cache-killer-20260624-3';

async function clearAllCaches() {
  if (!self.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function refreshDashboardClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if (client.url && client.url.includes('/mission-control-dashboard/')) {
      client.navigate(client.url).catch(() => undefined);
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.clients.claim();
    await refreshDashboardClients();
    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request, { cache: 'reload' }));
});
