const CACHE_NAME = 'primelogic-v1';
const ASSETS = [
    'index.html',
    'manifest.json',
    'css/style.css',
    'css/login.css',
    'css/landing.css',
    'js/app.js',
    'js/data.js',
    'js/fileStorage.js',
    'js/firebaseConfig.js',
    'icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
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
