const CACHE_NAME = 'primelogic-v21';
const ASSETS = [
    'index.html',
    'manifest.json',
    'css/style.css',
    'css/login.css',
    'css/landing.css',
    'js/app.js',
    'js/data.js',
    'js/fileStorage.js',
    'js/vouchers.js',
    'js/vouchersUI.js',
    'js/ai_assistant.js',
    'icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Service workers don't support caching over file://
                if (location.protocol === 'file:') {
                    console.log('Running locally: Service worker caching bypassed.');
                    return Promise.resolve();
                }
                return cache.addAll(ASSETS);
            })
            .catch(err => console.log('Service Worker caching skipped:', err))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Simple network-first strategy for dynamic data, cache-first for assets
    if (event.request.url.includes('firebaseio.com') || event.request.url.includes('googleapis.com')) {
        return; // Let Firebase SDK handle cloud data
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
