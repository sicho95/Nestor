const CACHE = 'nestor-v3';
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './src/app.js',
  './src/api/backends.js',
  './src/api/backends.json',
  './src/storage/agents-db.js',
  './src/core/default-agents.js',
  './src/core/gardener.js',
  './src/ui/dashboard.js',
];

// Installation : mise en cache forcée de tous les modules
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activation : supprimer les anciens caches (vide le cache iOS stale)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : cache-first pour les assets, network-first pour l'API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Laisser passer les appels API LLM sans cache
  if (url.hostname !== location.hostname) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
