/* ================================================
   MERI DUKAAN v5.0 — SERVICE WORKER
   Offline-first PWA with smart caching
   ================================================ */

var CACHE_VERSION = 'meri-dukaan-v5.0.0';
var STATIC_CACHE = 'md-static-' + CACHE_VERSION;
var DYNAMIC_CACHE = 'md-dynamic-' + CACHE_VERSION;
var FONT_CACHE = 'md-fonts-v2';

// ============ FILES TO PRE-CACHE ============
var STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

var FONT_URLS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

// CDN resources — cache but don't block install
var CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js'
];

// URLs to NEVER cache (Firebase, auth, analytics)
var NEVER_CACHE = [
    'firestore.googleapis.com',
    'www.googleapis.com/identitytoolkit',
    'securetoken.googleapis.com',
    'accounts.google.com',
    'apis.google.com',
    'www.gstatic.com/firebasejs',
    'firebase-settings.crashlytics',
    'google-analytics.com',
    'googletagmanager.com'
];


// ============ INSTALL ============
self.addEventListener('install', function(event) {
    console.log('[SW] Installing v' + CACHE_VERSION);

    event.waitUntil(
        Promise.all([
            // Cache static assets (critical — must succeed)
            caches.open(STATIC_CACHE).then(function(cache) {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),

            // Cache fonts (non-critical)
            caches.open(FONT_CACHE).then(function(cache) {
                return Promise.all(
                    FONT_URLS.map(function(url) {
                        return cache.add(url).catch(function() {
                            console.warn('[SW] Font cache skip:', url);
                        });
                    })
                );
            }),

            // Cache CDN assets (non-critical — don't block install)
            caches.open(DYNAMIC_CACHE).then(function(cache) {
                return Promise.all(
                    CDN_ASSETS.map(function(url) {
                        return cache.add(url).catch(function() {
                            console.warn('[SW] CDN cache skip:', url);
                        });
                    })
                );
            })
        ]).then(function() {
            console.log('[SW] Install complete');
            return self.skipWaiting();
        })
    );
});


// ============ ACTIVATE ============
self.addEventListener('activate', function(event) {
    console.log('[SW] Activating v' + CACHE_VERSION);

    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== STATIC_CACHE &&
                        cacheName !== DYNAMIC_CACHE &&
                        cacheName !== FONT_CACHE) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            console.log('[SW] Now controlling all clients');
            return self.clients.claim();
        })
    );
});


// ============ FETCH STRATEGY ============
self.addEventListener('fetch', function(event) {
    var url = event.request.url;
    var request = event.request;

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip chrome-extension and browser-internal URLs
    if (url.startsWith('chrome-extension') || url.startsWith('chrome://')) return;

    // NEVER cache Firebase/Auth/Analytics
    var shouldSkip = NEVER_CACHE.some(function(domain) {
        return url.indexOf(domain) !== -1;
    });
    if (shouldSkip) return;

    // STRATEGY 1: Google Fonts — Cache-first
    if (url.indexOf('fonts.googleapis.com') !== -1 ||
        url.indexOf('fonts.gstatic.com') !== -1) {
        event.respondWith(cacheFirst(request, FONT_CACHE));
        return;
    }

    // STRATEGY 2: CDN JS files — Cache-first with network update
    if (url.indexOf('cdn.jsdelivr.net') !== -1 ||
        url.indexOf('cdnjs.cloudflare.com') !== -1 ||
        url.indexOf('unpkg.com') !== -1) {
        event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
        return;
    }

    // STRATEGY 3: Static assets — Network-first
    if (url.indexOf(self.location.origin) !== -1) {
        event.respondWith(networkFirst(request, STATIC_CACHE));
        return;
    }

    // STRATEGY 4: Everything else — Network-first with cache fallback
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});


// ============ CACHING STRATEGIES ============
function cacheFirst(request, cacheName) {
    return caches.match(request).then(function(cachedResponse) {
        if (cachedResponse) {
            fetchAndCache(request, cacheName);
            return cachedResponse;
        }
        return fetchAndCache(request, cacheName);
    }).catch(function() {
        return fallbackResponse(request);
    });
}

function networkFirst(request, cacheName) {
    return fetch(request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(cacheName).then(function(cache) {
                cache.put(request, responseClone);
            });
        }
        return networkResponse;
    }).catch(function() {
        return caches.match(request).then(function(cachedResponse) {
            if (cachedResponse) return cachedResponse;
            return fallbackResponse(request);
        });
    });
}

function fetchAndCache(request, cacheName) {
    return fetch(request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(cacheName).then(function(cache) {
                cache.put(request, responseClone);
            });
        }
        return networkResponse;
    }).catch(function() {
        return caches.match(request).then(function(cachedResponse) {
            return cachedResponse || fallbackResponse(request);
        });
    });
}

function fallbackResponse(request) {
    var accept = '';
    try { accept = request.headers.get('accept') || ''; } catch(e) {}

    if (request.destination === 'document' || accept.indexOf('text/html') !== -1) {
        return caches.match('./index.html');
    }

    if (request.destination === 'image') {
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
            '<rect width="100" height="100" fill="#1e1e1e"/>' +
            '<text x="50" y="55" text-anchor="middle" fill="#666" font-size="12">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
        );
    }

    return new Response('Offline — Please check your connection.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
    });
}


// ============ BACKGROUND SYNC ============
self.addEventListener('sync', function(event) {
    if (event.tag === 'sync-data') {
        console.log('[SW] Background sync triggered');
    }
});


// ============ PUSH NOTIFICATIONS ============
self.addEventListener('push', function(event) {
    if (!event.data) return;
    var data = event.data.json();
    var options = {
        body: data.body || 'New update available',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || './' },
        actions: [
            { action: 'open', title: 'Open App' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };
    event.waitUntil(
        self.registration.showNotification(data.title || 'Meri Dukaan', options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    if (event.action === 'dismiss') return;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                if (clientList[i].url.indexOf('index.html') !== -1 && 'focus' in clientList[i]) {
                    return clientList[i].focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url || './');
            }
        })
    );
});


// ============ VERSION CHECK MESSAGE ============
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker loaded — v' + CACHE_VERSION);