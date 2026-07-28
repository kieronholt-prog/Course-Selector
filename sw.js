/* WSC Course Selector — service worker (shell + forecast/tide API cache) */
const SHELL_CACHE = 'wsc-shell-v3.51';
const DATA_CACHE = 'wsc-data-v3.51';
const SHELL_ASSETS = ['./', './index.html', './sw.js'];

const API_HOSTS = ['api.open-meteo.com', 'workers.dev'];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache){
      return cache.addAll(SHELL_ASSETS).catch(function(){});
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){
        return k !== SHELL_CACHE && k !== DATA_CACHE;
      }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isApiRequest(url){
  return API_HOSTS.some(function(h){ return url.hostname.indexOf(h) !== -1; });
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  if(isApiRequest(url)){
    event.respondWith(networkFirstData(req));
    return;
  }

  if(req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')){
    event.respondWith(networkFirstShell(req));
    return;
  }

  event.respondWith(
    caches.match(req).then(function(cached){
      return cached || fetch(req).then(function(res){
        if(res.ok){
          caches.open(SHELL_CACHE).then(function(c){ c.put(req, res.clone()); });
        }
        return res;
      }).catch(function(){ return cached; });
    })
  );
});

function networkFirstShell(req){
  return fetch(req).then(function(res){
    return caches.open(SHELL_CACHE).then(function(cache){
      cache.put(req, res.clone());
      return res;
    });
  }).catch(function(){
    return caches.match(req)
      .then(function(c){ return c || caches.match('./index.html'); })
      .then(function(c){ return c || caches.match('./'); });
  });
}

function networkFirstData(req){
  return caches.open(DATA_CACHE).then(function(cache){
    return fetch(req).then(function(res){
      if(res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function(){
      return cache.match(req).then(function(cached){
        if(cached) return cached;
        throw new Error('offline');
      });
    });
  });
}
