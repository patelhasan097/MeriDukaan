/* MERI DUKAAN v8 — Service Worker */
var CACHE='md-v8-1';
var STATIC=[
  './', './index.html', './style.css', './manifest.json',
  './js/i18n.js','./js/state.js','./js/core.js','./js/config.js',
  './js/auth.js','./js/data.js','./js/analytics.js','./js/reports.js',
  './js/settings.js','./js/notebook.js','./js/fcm.js',
  './icons/icon-192.png','./icons/icon-512.png'
];
var ALWAYS_NETWORK=['firestore.googleapis.com','firebase.googleapis.com',
  'identitytoolkit.googleapis.com','securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com','apis.google.com'];

function isAlwaysNetwork(url){
  return ALWAYS_NETWORK.some(function(d){return url.indexOf(d)!==-1;});
}

self.addEventListener('install',function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(STATIC.map(function(url){
        return c.add(url).catch(function(err){console.warn('[SW] skip:',url);});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch',function(e){
  var req=e.request, url=req.url;
  if(req.method!=='GET') return;
  if(!url.startsWith('http')) return;
  if(isAlwaysNetwork(url)) return;
  if(req.mode==='navigate'){
    e.respondWith(
      caches.match('./index.html').then(function(cached){
        return cached||fetch(req).catch(function(){
          return new Response('<h2>Offline</h2><p>Please reconnect and refresh.</p>',{headers:{'Content-Type':'text/html'}});
        });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(!res||res.status!==200) return res;
        if(res.type==='basic'||res.type==='cors'){
          var clone=res.clone();
          caches.open(CACHE).then(function(c){ c.put(req,clone); });
        }
        return res;
      }).catch(function(){
        if(req.destination==='image') return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',{headers:{'Content-Type':'image/svg+xml'}});
        return new Response('',{headers:{'Content-Type':'text/plain'}});
      });
    })
  );
});

self.addEventListener('message',function(e){
  if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('push',function(e){
  var data=e.data?e.data.json():{};
  e.waitUntil(self.registration.showNotification(data.title||'Meri Dukaan',{body:data.body||'',icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',data:{url:data.url||'./'},vibrate:[100,50,100]}));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data&&e.notification.data.url?e.notification.data.url:'./'));
});
