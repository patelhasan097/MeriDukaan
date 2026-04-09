/* ================================================
   MERI DUKAAN v5.0 — SERVICE WORKER
   Enterprise Offline-First Cache Strategy
   ================================================ */

const CACHE_VERSION = 'meri-dukaan-v5.0.0';
const STATIC_CACHE = 'md-static-' + CACHE_VERSION;
const DYNAMIC_CACHE = 'md-dynamic-' + CACHE_VERSION;

// Updated Modules included
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/config.js',
    './js/utils.js',
    './js/db.js',
    './js/ui.js',
    './js/features/sales.js',
    './js/features/expenses.js',
    './js/features/customers.js',
    './js/features/reports.js',
    './js/app.js'
];

// Added New Libraries from Expert Blueprint
const CDN_ASSETS = [
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

const NEVER_CACHE = [
    'firestore.googleapis.com',
    'www.googleapis.com/identitytoolkit',
    'securetoken.googleapis.com',
    'accounts.google.com',
    'apis.google.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
            caches.open(DYNAMIC_CACHE).then(cache => {
                CDN_ASSETS.forEach(url => {
                    cache.add(url).catch(err => console.warn('[SW] CDN cache skip:', url));
                });
            })
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (NEVER_CACHE.some(domain => event.request.url.includes(domain))) return;

    if (event.request.url.includes('cdn') || event.request.url.includes('unpkg') || event.request.url.includes('fonts')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(res => {
                    const clone = res.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, clone));
                    return res;
                });
            })
        );
        return;
    }

    // Network First for local assets to ensure instant updates
    event.respondWith(
        fetch(event.request).then(response => {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
            return response;
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});