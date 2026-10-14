// アプリを更新したら必ずこの番号を上げる（上げないと各端末に新しい版が届かない）
const CACHE_NAME = 'memome-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // ブラウザのHTTPキャッシュに残った古いファイルを掴まないよう、サーバーから取り直す
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
      // 新しい版を待機させず、すぐに有効化する（次回起動時から新しい版で動く）
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  // Only cache GET requests (exclude API calls)
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('api.github.com')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          function (response) {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(function (cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
