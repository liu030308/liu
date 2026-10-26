const CACHE_NAME = 'junwei-portfolio-v9';
const CORE_ASSETS = [
    './',
    './index.css',
    './script.js',
    './manifest.json',
    './assets/icon/logo-white-nav.webp',
    './assets/icon/logo-nav.webp',
    './assets/icon/pwa-192.png',
    './assets/icon/pwa-512.png',
    './assets/icon/github.webp',
    './assets/icon/instagram.webp',
    './shipping-calculator/',
    './shipping-calculator/style.css?v=9',
    './shipping-calculator/app.js?v=9',
    './shipping-calculator/vendor/xlsx.full.min.js',
    './shipping-calculator/vendor/opencc.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS).catch((err) => {
                console.warn('[ServiceWorker] Pre-cache error:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    
    // Skip browser-extension or non-http requests
    if (!request.url.startsWith('http')) return;

    // Cache-first for static assets, network-first for navigation
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match(request).then((cachedResponse) => {
                return cachedResponse || caches.match('./index.html');
            }))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to update cache (stale-while-revalidate)
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
