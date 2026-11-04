const CACHE="pu-dex-v13-6-type-stat-icons-20261104";
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
  "./assets/ui-icons/pflanze.png",
  "./assets/ui-icons/feuer.png",
  "./assets/ui-icons/wasser.png",
  "./assets/ui-icons/kaefer.png",
  "./assets/ui-icons/flug.png",
  "./assets/ui-icons/normal.png",
  "./assets/ui-icons/gift.png",
  "./assets/ui-icons/elektro.png",
  "./assets/ui-icons/boden.png",
  "./assets/ui-icons/kampf.png",
  "./assets/ui-icons/psycho.png",
  "./assets/ui-icons/gestein.png",
  "./assets/ui-icons/geist.png",
  "./assets/ui-icons/eis.png",
  "./assets/ui-icons/drache.png",
  "./assets/ui-icons/angriff.png",
  "./assets/ui-icons/verteidigung.png",
  "./assets/ui-icons/genauigkeit.png",
  "./assets/ui-icons/initiative.png",
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
