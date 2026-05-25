/* ================================================
   MERI DUKAAN v7.0 — SERVICE WORKER
   Offline-first caching strategy

   PHASE 4 FIXES vs v6:
   ✅ Version bumped to v7.0.0 — forces clean cache update
   ✅ Icons added to STATIC_ASSETS (were missing — broke
      PWA icon display in offline mode)
   ✅ style-additions.css added to STATIC_ASSETS
   ✅ email.js added to STATIC_ASSETS
   ✅ Install uses per-asset caching instead of addAll()
      — one missing file no longer breaks entire install
   ✅ cdnjs.cloudflare.com REMOVED from network-only list
      — Chart.js and jsPDF now cached dynamically on first
      load, enabling offline chart rendering and PDF export
   ✅ EmailJS CDN added to dynamic cache (not network-only)
   ✅ fonts.googleapis.com cached dynamically (was skipped)
   ✅ Offline fallback improved — returns index.html for
      all navigation requests including deep links
   ================================================ */

var CACHE_VERSION = 'meri-dukaan-v7.0.0';
var STATIC_CACHE  = 'md-static-'  + CACHE_VERSION;
var DYNAMIC_CACHE = 'md-dynamic-' + CACHE_VERSION;

// ---- Static assets: app shell (must all be local files) ----
// These are cached individually with per-asset error handling.
// One missing file will log a warning but NOT break the install.
var STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './style-additions.css',
    './manifest.json',
    './js/core.js',
    './js/auth.js',
    './js/data.js',
    './js/reports.js',
    './js/settings.js',
    './js/notebook.js',
    './js/analytics.js',
    './js/email.js',
    // Icons — were missing in v6, caused blank icon in offline mode
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png'
];

// ---- URLs that must ALWAYS use the network (never cache) ----
// Firestore and Firebase Auth are real-time — stale data is wrong.
// Google APIs that return user-specific tokens must always be fresh.
var ALWAYS_NETWORK = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'fcmregistrations.googleapis.com',
    'www.googleapis.com/identitytoolkit',
    'apis.google.com'
];

// ---- URLs to SKIP entirely (non-GET or chrome-extension etc.) ----
function shouldSkip(request, url) {
    if (request.method !== 'GET') return true;
    if (!url.startsWith('http'))   return true;  // chrome-extension://, etc.
    return false;
}

// ---- Check if a URL must always use network ----
function isAlwaysNetwork(url) {
    for (var i = 0; i < ALWAYS_NETWORK.length; i++) {
        if (url.indexOf(ALWAYS_NETWORK[i]) !== -1) return true;
    }
    return false;
}


// ============ INSTALL — cache shell assets individually ============
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(function(cache) {
            // Cache each asset independently.
            // If an icon is missing, the app still installs — just logs a warning.
            var promises = STATIC_ASSETS.map(function(url) {
                return cache.add(url).catch(function(err) {
                    console.warn('[SW] Could not cache asset:', url, err.message);
                    // Do NOT rethrow — one failure must not abort install
                });
            });
            return Promise.all(promises);
        }).then(function() {
            console.log('[SW] Static cache built — v7.0.0');
            return self.skipWaiting();
        })
    );
});


// ============ ACTIVATE — purge all stale caches ============
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) {
                    // Delete every cache that isn't the current version
                    return key !== STATIC_CACHE && key !== DYNAMIC_CACHE;
                }).map(function(key) {
                    console.log('[SW] Deleting old cache:', key);
                    return caches.delete(key);
                })
            );
        }).then(function() {
            console.log('[SW] Activated — all old caches cleared');
            return self.clients.claim();
        })
    );
});


// ============ FETCH — smart caching strategy ============
self.addEventListener('fetch', function(event) {
    var request = event.request;
    var url     = request.url;

    // Skip non-cacheable requests
    if (shouldSkip(request, url)) return;

    // Firebase/Google real-time APIs — always use network, never cache
    if (isAlwaysNetwork(url)) return;

    // ---- Navigation requests (HTML pages) ----
    // Cache-first, then network, fallback to index.html for SPA routing
    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html').then(function(cached) {
                if (cached) return cached;
                return fetch(request).catch(function() {
                    return new Response(
                        '<html><body><h2>You are offline</h2><p>Please reconnect and refresh.</p></body></html>',
                        { headers: { 'Content-Type': 'text/html' } }
                    );
                });
            })
        );
        return;
    }

    // ---- Static app shell (CSS, JS, icons) ----
    // Cache-first strategy: serve from cache, update in background
    event.respondWith(
        caches.match(request).then(function(cached) {
            if (cached) return cached;

            // Not in cache — fetch from network and store dynamically
            return fetch(request).then(function(response) {
                // Only cache successful, non-opaque responses
                if (!response || response.status !== 200) return response;

                // Cache CDN resources (Chart.js, jsPDF, EmailJS, fonts)
                // These were excluded in v6 — caused offline chart/PDF failures
                var shouldDynamicCache =
                    response.type === 'basic' ||     // Same-origin
                    response.type === 'cors';        // CDN (Chart.js, etc.) — NOW CACHED

                if (shouldDynamicCache) {
                    var responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(function(cache) {
                        cache.put(request, responseClone);
                    });
                }
                return response;

            }).catch(function() {
                // Offline and not cached — return graceful degradation
                // For image requests, return a transparent pixel
                if (request.destination === 'image') {
                    return new Response(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
                        { headers: { 'Content-Type': 'image/svg+xml' } }
                    );
                }
                // For scripts/styles — return empty (better than crash)
                return new Response('/* offline */', {
                    headers: { 'Content-Type': 'text/plain' }
                });
            });
        })
    );
});


// ============ MESSAGE — force cache refresh from app ============
// Called from app: navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});