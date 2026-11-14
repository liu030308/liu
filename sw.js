const CACHE_PREFIX = 'junwei-portfolio-';
const CACHE_NAME = `${CACHE_PREFIX}v28`;

// Core critical assets for Jun Wei Liu's portfolio shell (excludes heavy standalone tool libraries)
// Keep ?v= query strings in sync with index.html so offline pre-cache matches exact versioned requests
const CORE_ASSETS = [
    './',
    './index.html',
    './index.css?v=20261114_01',
    './script.js?v=20261114_01',
    './manifest.json',
    './assets/icon/logo-white-nav.webp',
    './assets/icon/logo-nav.webp',
    './assets/icon/pwa-192.png',
    './assets/icon/pwa-512.png',
    './assets/icon/github.webp',
    './assets/icon/instagram.webp'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Use Promise.allSettled so single asset failure does not abort installation
            const results = await Promise.allSettled(
                CORE_ASSETS.map((url) => cache.add(url))
            );
            results.forEach((res, index) => {
                if (res.status === 'rejected') {
                    console.warn(`[ServiceWorker] Pre-cache skipped for ${CORE_ASSETS[index]}:`, res.reason);
                }
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    // Safe cleanup: IMMEDIATELY remove older caches belonging to this portfolio
                    if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) {
                        console.log(`[ServiceWorker] Removing stale cache: ${name}`);
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
            fetch(request).catch(async () => {
                const cachedResponse = await caches.match(request);
                if (cachedResponse) return cachedResponse;
                return (await caches.match('./index.html')) || (await caches.match('./'));
            })
        );
        return;
    }

    // For versioned query assets (e.g. ?v=...), respect versioning by matching exact request first
    const hasVersionQuery = request.url.includes('?v=');
    const matchOptions = hasVersionQuery ? {} : { ignoreSearch: true };

    event.respondWith(
        caches.match(request, matchOptions).then((cachedResponse) => {
            if (cachedResponse) {
                // Keep SW alive until background cache update completes
                const updatePromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        return caches.open(CACHE_NAME).then((cache) => {
                            return cache.put(request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});

                event.waitUntil(updatePromise);
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
