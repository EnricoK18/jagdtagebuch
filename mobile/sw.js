/**
 * Service worker: keeps the app files on the phone so the app starts without connection.
 * VERSION is bumped by tools/sync-mobile.php; a new version replaces the cached files.
 */

const VERSION = 'dev';
const APP_CACHE = 'jagddatenbank-app-' + VERSION;
const TILE_CACHE = 'jagddatenbank-tiles';
const MAX_TILES = 3000;

const APP_FILES = [
    './', 'index.html', 'seats.html', 'seat_details.html', 'manifest.webmanifest',
    'css/style.css', 'css/mobile.css',
    'js/db.js', 'js/api.js', 'js/ui.js', 'js/backup.js', 'js/pwa.js', 'js/weather.js', 'js/weather_ui.js',
    'js/advanced_filters.js', 'js/app.js', 'js/map.js', 'js/seats.js', 'js/utils.js',
    'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm',
    'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
    'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png',
    'vendor/leaflet/images/marker-shadow.png', 'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png',
    'vendor/fonts/ibm-plex-sans-latin-400-normal.woff2', 'vendor/fonts/ibm-plex-sans-latin-500-normal.woff2',
    'vendor/fonts/ibm-plex-sans-latin-600-normal.woff2',
    'img/autumn-forest.jpg', 'img/deer-mist.jpg', 'img/forest-edge.jpg',
    'img/icon.svg', 'img/favicon-32.png', 'img/apple-touch-icon.png', 'img/icon-192.png', 'img/icon-512.png',
    'img/icon-maskable-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(APP_CACHE)
            .then(cache => cache.addAll(APP_FILES.map(url => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('jagddatenbank-app-') && key !== APP_CACHE)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Map tiles: keep the ones already seen, so known areas also show without connection
    if (url.hostname.endsWith('tile.openstreetmap.org')) {
        event.respondWith(cachedTile(request));
        return;
    }

    // App files (seat_details.html?id=5 is the same file as seat_details.html)
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request))
        );
    }
    // Everything else (weather service) goes to the network as usual
});

async function cachedTile(request) {
    const cache = await caches.open(TILE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            await cache.put(request, response.clone());
            trimTiles(cache);
        }
        return response;
    } catch (error) {
        return new Response('', { status: 504 });
    }
}

async function trimTiles(cache) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) {
        await cache.delete(keys[i]);
    }
}
