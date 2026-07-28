/* WSC Course Selector — service worker (shell + forecast/tide API cache) */
const SHELL_CACHE = 'wsc-shell-v3.54';
const DATA_CACHE = 'wsc-data-v3.54';
const FONT_CACHE = 'wsc-fonts-v3.54';
const SHELL_ASSETS = ['./', './index.html', './sw.js'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Barlow:wght@400;500&display=swap';

const API_HOSTS = ['api.open-meteo.com', 'workers.dev'];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache){
      return cache.addAll(SHELL_ASSETS).catch(function(){});
    }).then(function(){
      // Prefetch Google Fonts CSS + linked woff2 files so portrait text stays consistent offline
      return caches.open(FONT_CACHE).then(function(fcache){
        return fetch(FONT_CSS, {mode:'cors'}).then(function(res){
          if(!res.ok) return;
          fcache.put(FONT_CSS, res.clone());
          return res.text().then(function(css){
            var urls = css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || [];
            return Promise.all(urls.map(function(u){
              return fetch(u, {mode:'cors'}).then(function(fr){
                if(fr.ok) return fcache.put(u, fr);
              }).catch(function(){});
            }));
          });
        }).catch(function(){});
      });
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){
        return k !== SHELL_CACHE && k !== DATA_CACHE && k !== FONT_CACHE;
      }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isApiRequest(url){
  return API_HOSTS.some(function(h){ return url.hostname.indexOf(h) !== -1; });
}

function isFontRequest(url){
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  if(isFontRequest(url)){
    event.respondWith(cacheFirstFonts(req));
    return;
  }

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

function cacheFirstFonts(req){
  return caches.open(FONT_CACHE).then(function(cache){
    return cache.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res.ok) cache.put(req, res.clone());
        return res;
      });
    });
  });
}

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
  var reqUrl=new URL(req.url);
  return caches.open(DATA_CACHE).then(function(cache){
    return fetch(req).then(function(res){
      if(res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function(){
      return cache.match(req).then(function(cached){
        if(cached) return cached;
        // Ignore query-string variations: match by origin + pathname
        return cache.keys().then(function(keys){
          for(var i=0;i<keys.length;i++){
            try{
              var k=new URL(keys[i].url);
              if(k.origin===reqUrl.origin && k.pathname===reqUrl.pathname){
                return cache.match(keys[i]);
              }
            }catch(e){}
          }
          throw new Error('offline');
        });
      });
    });
  });
}
