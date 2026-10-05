const CACHE="pu-dex-v13-session-pool-20261005";
const CORE=[
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-config.js",
  "./assets/placeholder.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./data/pokemon.json",
  "./data/attacks.json",
  "./data/attack-cards.json",
  "./data/pokemon-cards.json",
  "./data/evolutions.json",
  "./data/encounters.json",
  "./data/map.json",
  "./data/goals.json",
  "./data/battle-rules.json"
];

self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});

self.addEventListener("activate",e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

async function networkFirst(request){
  try{
    const response=await fetch(request);
    if(response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone());
    }
    return response;
  }catch(err){
    const hit=await caches.match(request,{ignoreSearch:true});
    if(hit) return hit;
    if(request.mode==="navigate") return caches.match("./index.html");
    throw err;
  }
}

self.addEventListener("fetch",e=>{
  const request=e.request;
  if(request.method!=="GET") return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;

  const freshShell=request.mode==="navigate" || /\/(?:app\.js|styles\.css|manifest\.webmanifest|firebase-config\.js)$/.test(url.pathname);
  if(freshShell){ e.respondWith(networkFirst(request)); return; }

  e.respondWith(caches.match(request,{ignoreSearch:true}).then(hit=>hit||fetch(request).then(response=>{
    if(response.ok){ caches.open(CACHE).then(c=>c.put(request,response.clone())); }
    return response;
  })));
});
