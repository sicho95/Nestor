self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('nestor-shell-v1').then((cache) => cache.addAll([
      '/',
      '/index.html',
      '/css/style.css',
    ])),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((resp) => resp || fetch(event.request)),
  );
});
