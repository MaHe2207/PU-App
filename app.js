import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const FALLBACK_IMAGE = "assets/placeholder.svg";

const TYPE_COLORS = {
  "Pflanze":["#47a86a","#eaf7ee"], "Feuer":["#f0554b","#fff0ee"], "Wasser":["#4b95d9","#edf6ff"],
  "Käfer":["#8aa83d","#f3f7e8"], "Flug":["#7d89cf","#f0f1fb"], "Normal":["#88939d","#f1f3f5"],
  "Gift":["#9b62bd","#f6effa"], "Elektro":["#e5b82e","#fff9df"], "Boden":["#b98a55","#f8f1e9"],
  "Kampf":["#d96a45","#fff1eb"], "Psycho":["#d96899","#fff0f6"], "Gestein":["#a9936a","#f6f2e9"],
  "Geist":["#645d9a","#f1eff8"], "Eis":["#62b6cf","#ecfafd"], "Drache":["#5967bd","#eef0fb"]
};

const app = {
  pokemon: [], players: [], player: null, state: {}, publishedState: {},
  filter: "all", type: "Alle", search: "", editMode: false,
  selectedId: null, activeTab: "info", user: null, isAdmin: false,
  saveTimer: null, saving: false, dirty: false
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = v => JSON.parse(JSON.stringify(v));
const pad = n => String(n).padStart(3,"0");
const initials = name => (name||"?").trim().split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
const playerKey = id => `pu-dex-cache-${id}`;
function typeVars(type){ const [a,b]=TYPE_COLORS[type]||["#8793a0","#f1f3f5"]; return `--type:${a};--type-soft:${b};`; }
function setImgFallback(img){ img.addEventListener("error",()=>{ if(!img.src.endsWith("placeholder.svg")) img.src=FALLBACK_IMAGE; },{once:true}); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2200); }

async function loadJson(url){ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }
function normalizeState(raw={}){
  const out={};
  for(const p of app.pokemon){
    const s=raw[p.name]||{};
    out[p.name]={
      owned:!!s.owned, favorite:!!s.favorite,
      level:Math.min(p.maxLevel,Math.max(p.minLevel,Number.isFinite(+s.level)?+s.level:p.minLevel)),
      ep:Math.min(9,Math.max(0,Number.isFinite(+s.ep)?+s.ep:0))
    };
  }
  return out;
}
function stateFor(p){ return app.state[p.name]||{owned:false,favorite:false,level:p.minLevel,ep:0}; }
function cacheState(){ if(app.player) localStorage.setItem(playerKey(app.player.id), JSON.stringify(app.state)); }

async function init(){
  try { app.pokemon=await loadJson("data/pokemon.json"); }
  catch(err){ document.body.innerHTML=`<main style="padding:24px"><h1>Dex konnte nicht geladen werden</h1><p>Bitte über GitHub Pages oder einen Webserver öffnen.</p><pre>${String(err)}</pre></main>`; return; }
  buildTypeStrip(); bindEvents();
  onAuthStateChanged(auth, async user=>{
    app.user=user||null; app.isAdmin=!!user && user.uid===ADMIN_UID;
    updateAuthUI();
    if(app.isAdmin) await loadAdminPlayers(); else app.players=[];
    const requested=new URLSearchParams(location.search).get("player");
    if(requested) await selectPlayer(requested,false);
    else if(app.isAdmin && app.players[0]) await selectPlayer(app.players[0].id,false);
    else showNoPlayer();
    render();
  });
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
}

async function loadAdminPlayers(){
  try {
    const snap=await getDocs(collection(db,"players"));
    app.players=snap.docs.map(d=>({id:d.id,name:d.data().name||"Spieler"})).sort((a,b)=>a.name.localeCompare(b.name,"de"));
  } catch(err){ console.error(err); toast("Spielerliste konnte nicht geladen werden"); }
}

async function selectPlayer(id,close=true){
  try {
    const snap=await getDoc(doc(db,"players",id));
    if(!snap.exists()) throw new Error("Spieler nicht gefunden");
    const data=snap.data();
    app.player={id,name:data.name||"Spieler"};
    app.publishedState=normalizeState(data.pokemon||{});
    app.state=clone(app.publishedState);
    localStorage.setItem(playerKey(id),JSON.stringify(app.state));
    app.selectedId=null; app.editMode=app.isAdmin && app.editMode;
    history.replaceState(null,"",`${location.pathname}?player=${encodeURIComponent(id)}`);
    $("#mainView").classList.remove("hidden"); $("#noPlayerView").classList.add("hidden");
    if(close) closeSheets();
  } catch(err){
    console.error(err);
    const cached=localStorage.getItem(playerKey(id));
    if(cached){
      app.player={id,name:"Offline-Spielstand"};
      app.state=normalizeState(JSON.parse(cached)); app.publishedState=clone(app.state);
      $("#mainView").classList.remove("hidden"); $("#noPlayerView").classList.add("hidden");
      toast("Offline-Kopie geladen");
    } else { showNoPlayer("Dieser Spieler-Link ist ungültig oder derzeit nicht erreichbar."); }
  }
  render();
}

function showNoPlayer(msg="Öffne deinen persönlichen Spieler-Link. Als Spielleiter kannst du dich über ☰ anmelden."){
  app.player=null; app.state={}; app.publishedState={}; app.selectedId=null;
  $("#detailView").classList.add("hidden"); $("#mainView").classList.add("hidden"); $("#noPlayerView").classList.remove("hidden");
  $("#noPlayerText").textContent=msg;
}

function buildTypeStrip(){
  const types=["Alle",...new Set(app.pokemon.map(p=>p.type))];
  $("#typeStrip").innerHTML=types.map(t=>`<button class="type-chip ${t==="Alle"?"active":""}" data-type="${t}">${t}</button>`).join("");
}
function filteredPokemon(){
  const q=app.search.trim().toLowerCase();
  return app.pokemon.filter(p=>{
    const s=stateFor(p);
    if(app.filter==="owned"&&!s.owned) return false;
    if(app.filter==="favorite"&&!s.favorite) return false;
    if(app.type!=="Alle"&&p.type!==app.type) return false;
    return !q||(`${p.name} ${pad(p.id)} ${p.type}`).toLowerCase().includes(q);
  });
}
function render(){
  if(app.player){
    $("#playerNameTop").textContent=app.player.name; $("#playerAvatar").textContent=initials(app.player.name); $("#welcomeLabel").textContent=`${app.player.name}s Dex`;
    renderStats(); renderGrid();
  } else { $("#playerNameTop").textContent=app.isAdmin?"Spieler wählen":"Dex"; $("#playerAvatar").textContent=app.isAdmin?"A":"?"; }
  renderPlayerList(); updateAuthUI();
  $("#editModeToggle").checked=app.editMode;
  if(app.selectedId) renderDetail();
}
function renderStats(){ const vals=app.pokemon.map(p=>stateFor(p)); $("#ownedCount").textContent=vals.filter(s=>s.owned).length; $("#favoriteCount").textContent=vals.filter(s=>s.favorite).length; $("#totalCount").textContent=app.pokemon.length; }
function renderGrid(){
  const list=filteredPokemon();
  $("#resultCount").textContent=`${list.length} ${list.length===1?"Eintrag":"Einträge"}`;
  $("#resultLabel").textContent=app.filter==="owned"?"Gefangen":app.filter==="favorite"?"Favoriten":"Alle Monster";
  $("#emptyState").classList.toggle("hidden",list.length!==0);
  $("#dexGrid").innerHTML=list.map(p=>{ const s=stateFor(p); return `<button class="dex-card ${s.owned?"":"not-owned"}" data-id="${p.id}" style="${typeVars(p.type)}"><div class="card-art"><span class="card-fav">${s.favorite?"★":"☆"}</span><img src="${p.image}" alt="${p.name}" loading="lazy"></div><div class="card-copy"><small>#${pad(p.id)}</small><strong>${p.name}</strong><div class="card-meta"><span class="card-type"><i class="type-dot"></i>${p.type}</span><span class="level-pill">Lvl ${s.level}</span></div></div></button>`; }).join("");
  $$("#dexGrid img").forEach(setImgFallback);
}
function renderPlayerList(){
  const wrap=$("#playerList");
  if(!app.isAdmin){ wrap.innerHTML=`<div class="notice notice-muted"><strong>Nur für Spielleiter</strong><p>Die Spielerliste ist geschützt und wird erst nach der Admin-Anmeldung geladen.</p></div>`; return; }
  wrap.innerHTML=app.players.map(p=>`<button class="player-option ${app.player?.id===p.id?"active":""}" data-player="${p.id}"><span class="player-avatar">${initials(p.name)}</span><span><strong>${p.name}</strong><small>${app.player?.id===p.id?"Aktuell ausgewählt":"Dex öffnen"}</small></span></button>`).join("")||`<div class="notice"><strong>Noch keine Spieler</strong><p>Importiere zuerst deine JSON-Spielstände über <code>admin-import.html</code>.</p></div>`;
}

function openDetail(id){ app.selectedId=Number(id); app.activeTab="info"; $("#mainView").classList.add("hidden"); $("#detailView").classList.remove("hidden"); window.scrollTo({top:0,behavior:"instant"}); renderDetail(); }
function closeDetail(){ app.selectedId=null; $("#detailView").classList.add("hidden"); $("#mainView").classList.remove("hidden"); renderGrid(); }
function selectedPokemon(){ return app.pokemon.find(p=>p.id===app.selectedId); }
function renderDetail(){
  const p=selectedPokemon(); if(!p) return; const s=stateFor(p);
  $("#detailHero").style=typeVars(p.type); $("#detailNumber").textContent=`#${pad(p.id)}`; $("#detailName").textContent=p.name;
  $("#detailType").innerHTML=`<span class="type-badge" style="${typeVars(p.type)}"><span>●</span>${p.type}</span>`;
  const img=$("#detailImage"); img.src=p.image; img.alt=p.name; img.classList.toggle("not-owned",!s.owned); setImgFallback(img);
  $("#detailFavoriteBtn").textContent=s.favorite?"★":"☆"; $("#detailFavoriteBtn").classList.toggle("active",s.favorite);
  $("#infoStatus").textContent=s.owned?"Gefangen":"Nicht gefangen"; $("#infoType").textContent=p.type; $("#infoRange").textContent=`${p.minLevel}–${p.maxLevel}`;
  $("#currentLevel").textContent=s.level; $("#currentEP").textContent=`${s.ep} / 10`; $("#epBar").style.width=`${s.ep*10}%`;
  $("#valueMin").textContent=p.minLevel; $("#valueMax").textContent=p.maxLevel; $("#valueCurrent").textContent=s.level;
  $("#editPanel").classList.toggle("hidden",!(app.isAdmin&&app.editMode));
  $("#ownedToggle").checked=s.owned; $("#favoriteToggle").checked=s.favorite; $("#levelSlider").min=p.minLevel; $("#levelSlider").max=p.maxLevel; $("#levelSlider").value=s.level; $("#levelValue").textContent=s.level; $("#levelHelp").textContent=`Erlaubt: ${p.minLevel} bis ${p.maxLevel}`;
  $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===app.activeTab)); $$(".tab-panel").forEach(x=>x.classList.add("hidden")); $(`#tab-${app.activeTab}`).classList.remove("hidden");
}
function mutateSelected(mutator){
  if(!app.isAdmin||!app.editMode){ toast("Nur im Admin-Bearbeitungsmodus"); return; }
  const p=selectedPokemon(); if(!p) return; const s=stateFor(p); mutator(s,p); app.state[p.name]=s; cacheState(); app.dirty=true; renderStats(); renderDetail(); renderGrid(); scheduleSave();
}
function changeEP(delta){ mutateSelected((s,p)=>{ let ep=s.ep+delta; while(ep>=10){ if(s.level<p.maxLevel){s.level++;ep-=10;}else{ep=9;break;} } while(ep<0){ if(s.level>p.minLevel){s.level--;ep+=10;}else{ep=0;break;} } s.ep=Math.max(0,Math.min(9,ep)); }); }
function scheduleSave(){ clearTimeout(app.saveTimer); setSyncLabel("Änderungen…"); app.saveTimer=setTimeout(saveToFirebase,700); }
async function saveToFirebase(){
  if(!app.isAdmin||!app.player||!app.dirty||app.saving) return;
  app.saving=true; setSyncLabel("Speichert…");
  try { await setDoc(doc(db,"players",app.player.id),{name:app.player.name,version:1,pokemon:app.state,updatedAt:serverTimestamp()},{merge:true}); app.publishedState=clone(app.state); app.dirty=false; setSyncLabel("Gespeichert ✓"); }
  catch(err){ console.error(err); setSyncLabel("Speichern fehlgeschlagen"); toast("Firebase-Speichern fehlgeschlagen"); }
  finally { app.saving=false; }
}
function setSyncLabel(t){ const el=$("#syncStatus"); if(el) el.textContent=t; }

function updateAuthUI(){
  $("#adminControls").classList.toggle("hidden",!app.isAdmin);
  $("#loginBox").classList.toggle("hidden",!!app.user);
  $("#loggedInBox").classList.toggle("hidden",!app.user);
  $("#loggedInText").textContent=app.user?(app.isAdmin?`Admin angemeldet: ${app.user.email||""}`:"Angemeldet, aber kein Admin"):"";
  $("#playerBtn").classList.toggle("admin-only-list",!app.isAdmin);
  if(!app.isAdmin) app.editMode=false;
}
async function doLogin(){
  const email=$("#adminEmail").value.trim(), password=$("#adminPassword").value;
  if(!email||!password){ toast("E-Mail und Passwort eingeben"); return; }
  try { await signInWithEmailAndPassword(auth,email,password); $("#adminPassword").value=""; closeSheets(); toast("Admin angemeldet"); }
  catch(err){ console.error(err); toast("Anmeldung fehlgeschlagen"); }
}
async function doLogout(){ await saveToFirebase(); await signOut(auth); app.players=[]; app.editMode=false; closeSheets(); toast("Abgemeldet"); }

function openSheet(id){ $("#sheetBackdrop").classList.remove("hidden"); $(id).classList.remove("hidden"); }
function closeSheets(){ $("#sheetBackdrop").classList.add("hidden"); $$(".bottom-sheet").forEach(s=>s.classList.add("hidden")); }
function resetFilters(){ app.filter="all"; app.type="Alle"; app.search=""; $("#searchInput").value=""; $$(".segment").forEach(b=>b.classList.toggle("active",b.dataset.filter==="all")); $$(".type-chip").forEach(b=>b.classList.toggle("active",b.dataset.type==="Alle")); renderGrid(); }
function exportState(){ if(!app.player)return; const blob=new Blob([JSON.stringify(app.state,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${app.player.name}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
async function sharePlayer(){ if(!app.player)return; const url=new URL(location.href); url.searchParams.set("player",app.player.id); try{await navigator.clipboard.writeText(url.toString());toast("Spieler-Link kopiert");}catch{prompt("Link kopieren:",url.toString());} }

function bindEvents(){
  $("#searchInput").addEventListener("input",e=>{app.search=e.target.value;renderGrid();});
  $$(".segment").forEach(b=>b.addEventListener("click",()=>{app.filter=b.dataset.filter; $$(".segment").forEach(x=>x.classList.toggle("active",x===b));renderGrid();}));
  $("#typeStrip").addEventListener("click",e=>{const b=e.target.closest("[data-type]");if(!b)return;app.type=b.dataset.type;$$(".type-chip").forEach(x=>x.classList.toggle("active",x===b));renderGrid();});
  $("#clearFiltersBtn").addEventListener("click",resetFilters); $("#dexGrid").addEventListener("click",e=>{const c=e.target.closest(".dex-card");if(c)openDetail(c.dataset.id);});
  $("#backBtn").addEventListener("click",closeDetail); $("#homeBtn").addEventListener("click",()=>{if(app.selectedId)closeDetail();else if(app.player)resetFilters();});
  $("#prevBtn").addEventListener("click",()=>{app.selectedId=app.selectedId<=1?app.pokemon.length:app.selectedId-1;renderDetail();}); $("#nextBtn").addEventListener("click",()=>{app.selectedId=app.selectedId>=app.pokemon.length?1:app.selectedId+1;renderDetail();});
  $("#detailFavoriteBtn").addEventListener("click",()=>mutateSelected(s=>s.favorite=!s.favorite)); $$(".tab").forEach(b=>b.addEventListener("click",()=>{app.activeTab=b.dataset.tab;renderDetail();}));
  $("#ownedToggle").addEventListener("change",e=>mutateSelected(s=>s.owned=e.target.checked)); $("#favoriteToggle").addEventListener("change",e=>mutateSelected(s=>s.favorite=e.target.checked)); $("#levelSlider").addEventListener("input",e=>mutateSelected(s=>s.level=+e.target.value)); $$(".stepper [data-ep]").forEach(b=>b.addEventListener("click",()=>changeEP(+b.dataset.ep)));
  $("#playerBtn").addEventListener("click",()=>openSheet(app.isAdmin?"#playerSheet":"#settingsSheet")); $("#settingsBtn").addEventListener("click",()=>openSheet("#settingsSheet")); $("#sheetBackdrop").addEventListener("click",closeSheets); $$(".close-sheet").forEach(b=>b.addEventListener("click",closeSheets));
  $("#playerList").addEventListener("click",e=>{const b=e.target.closest("[data-player]");if(b)selectPlayer(b.dataset.player);});
  $("#editModeToggle").addEventListener("change",e=>{if(!app.isAdmin){e.target.checked=false;toast("Admin-Anmeldung erforderlich");return;}app.editMode=e.target.checked;renderDetail();toast(app.editMode?"Bearbeitungsmodus aktiv":"Ansichtsmodus aktiv");});
  $("#exportBtn").addEventListener("click",exportState); $("#shareBtn").addEventListener("click",sharePlayer); $("#saveNowBtn").addEventListener("click",saveToFirebase);
  $("#loginBtn").addEventListener("click",doLogin); $("#logoutBtn").addEventListener("click",doLogout); $("#adminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
  window.addEventListener("beforeunload",()=>{ if(app.dirty) cacheState(); });
}

init();
