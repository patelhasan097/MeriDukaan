/* ================================================
   MERI DUKAAN v6.0 — SERVICE WORKER
   Offline-first caching strategy
   ================================================ */

var CACHE_VERSION = 'meri-dukaan-v6.0.0';
var STATIC_CACHE  = 'md-static-'  + CACHE_VERSION;
var DYNAMIC_CACHE = 'md-dynamic-' + CACHE_VERSION;

var STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/core.js',
    './js/auth.js',
    './js/data.js',
    './js/reports.js',
    './js/settings.js',
    './js/notebook.js',
    './js/analytics.js'
];

// Install — cache static assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(function(cache) {
            return cache.addAll(STATIC_ASSETS);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// Activate — delete old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) {
                    return key !== STATIC_CACHE && key !== DYNAMIC_CACHE;
                }).map(function(key) {
                    return caches.delete(key);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch — cache-first for static, network-first for Firebase
self.addEventListener('fetch', function(event) {
    var url = event.request.url;

    // Skip Firebase, Google APIs — always network
    if (url.indexOf('firestore.googleapis.com') !== -1 ||
        url.indexOf('firebase') !== -1 ||
        url.indexOf('googleapis.com') !== -1 ||
        url.indexOf('gstatic.com') !== -1 ||
        url.indexOf('cdnjs.cloudflare.com') !== -1 ||
        url.indexOf('fonts.googleapis.com') !== -1 ||
        event.request.method !== 'GET') {
        return;
    }

    // Cache-first for our app assets
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;

            return fetch(event.request).then(function(response) {
                // Cache valid responses dynamically
                if (response && response.status === 200 && response.type === 'basic') {
                    var responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                // Offline fallback — serve index.html for navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});