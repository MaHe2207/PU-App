const CACHE="pu-dex-v3-20260928";
const CORE=[
  "./","index.html","styles.css","app.js","firebase-config.js","manifest.webmanifest",
  "assets/placeholder.svg","data/pokemon.json","data/attacks.json","data/evolutions.json"
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

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET" || e.request.url.includes("firestore.googleapis.com") || e.request.url.includes("identitytoolkit.googleapis.com") || e.request.url.includes("firebase")) return;
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      if(r.ok&&new URL(e.request.url).origin===location.origin){
        const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return r;
    }))
  );
});
