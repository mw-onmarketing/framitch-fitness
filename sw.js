const CACHE_NAME = 'framitch-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './Mitch.png',
  './Fran.png',
  './logo.png',
  './favicon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Skip caching for API calls and Firebase
  const url = e.request.url;
  if (url.includes('/api/') || url.includes('firebaseio.com') || url.includes('googleapis.com/identitytoolkit') || url.includes('openfoodfacts.org') || e.request.method !== 'GET') {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
