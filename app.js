import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, updateDoc, onSnapshot, serverTimestamp
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
  pokemon: [], goals: [], attacks: {}, attackCards: [], attackCardMap: new Map(), pokemonCards: [], pokemonCardMap: new Map(), evolutionGroups: [], players: [], adminPlayerData: [], player: null,
  state: {}, publishedState: {}, profile: {trainerLevel:0,activeGoals:[]}, publishedProfile: {trainerLevel:0,activeGoals:[]}, filter: "all", type: "Alle", search: "", editMode: false,
  selectedId: null, activeTab: "info", user: null, isAdmin: false,
  saveTimer: null, saving: false, dirty: false,
  view: "dashboard", fightSource: "owned", fightRole: "own", fightSelectedId: null,
  fightSelectedLevel: 1, fightTeam: [], fightBaseline: {},
  encounterData: null, encounterField: null, encounterTS: 3, encounterResult: null,
  mapData: null, mapActiveArea: null, mapSymbolLayers: new Set(), mapSelectedField: null, mapLayerSearch: "",
  mapTrainerMoveId: null,
  librarySearch: "", libraryKind: "all", libraryType: "Alle", librarySection: "attacks", selectedCardName: null,
  directorSearch: "", directorSort: "name",
  battleRules: null, activeBattle: null, battleUnsub: null, battleSelectedFighter: null,
  battleCalc: {attacker:null,defender:null,attackCard:null,defenseCard:"",result:null}
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = v => JSON.parse(JSON.stringify(v));
const pad = n => String(n).padStart(3,"0");
const initials = name => (name||"?").trim().split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
const playerKey = id => `pu-dex-cache-${id}`;
const profileKey = id => `pu-profile-cache-${id}`;
const fightKey = id => `pu-fight-v4-${id}`;
const LAST_PLAYER_KEY = "pu-last-player";
let deferredInstallPrompt = null;
const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
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
function normalizeProfile(raw={}){
  const validGoalIds=new Set((app.goals||[]).map(g=>g.id));
  const activeGoals=Array.isArray(raw.activeGoals)?raw.activeGoals.filter(id=>validGoalIds.has(id)).slice(0,3):[];
  return {
    trainerLevel: Math.max(0,Math.min(13,Number.isFinite(+raw.trainerLevel)?Math.round(+raw.trainerLevel):0)),
    activeGoals
  };
}
function cacheProfile(){ if(app.player) localStorage.setItem(profileKey(app.player.id),JSON.stringify(app.profile)); }
function normalizeName(value){ return String(value||"").trim().toLocaleLowerCase("de").replace(/[^a-z0-9äöüß]/g,""); }
function trainerEntryForName(name){
  const key=normalizeName(name);
  return trainerEntries().find(t=>normalizeName(t.name)===key) || null;
}
function currentTrainerEntry(){
  return app.player ? trainerEntryForName(app.player.name) : null;
}

function goalById(id){ return (app.goals||[]).find(g=>g.id===id)||null; }
function goalOwnedCount(goal){ return goal ? app.pokemon.filter(p=>p.type===goal.type && stateFor(p).owned).length : 0; }
function goalProgress(goal){
  const count=goalOwnedCount(goal), target=Math.max(1,+goal.target||1);
  return {count,target,done:count>=target,pct:Math.min(100,Math.round(count/target*100))};
}
function activeGoals(){ return (app.profile.activeGoals||[]).map(goalById).filter(Boolean); }

function cacheState(){ if(app.player) localStorage.setItem(playerKey(app.player.id), JSON.stringify(app.state)); }
function attacksFor(p){ return app.attacks[p.name]||[]; }
const CARD_KIND_LABELS={attack:"Angriff",defense:"Verteidigung",versatile:"Vielseitig",scheme:"Planung"};
const CARD_KIND_ICONS={attack:"⚔",defense:"◆",versatile:"◈",scheme:"⚡"};
const TIMING_LABELS={immediately:"IMMEDIATELY",duringCombat:"DURING COMBAT",afterCombat:"AFTER COMBAT",scheme:"PLANUNG",text:"EFFEKT"};
function attackCard(name){ return app.attackCardMap.get(name)||null; }
function pokemonCharacterCard(pOrId){
  const id=typeof pOrId==="object"?pOrId?.id:+pOrId;
  return app.pokemonCardMap.get(+id)||null;
}
function cardSetSize(name){ const c=attackCard(name); return c?.detailsAvailable!==false && Number.isFinite(+c?.setSize) ? +c.setSize : 1; }
function cardLearners(name){
  const out=[];
  for(const p of app.pokemon){
    const hit=attacksFor(p).find(m=>m.name===name);
    if(hit) out.push({pokemon:p,level:+hit.level});
  }
  return out.sort((a,b)=>a.level-b.level||a.pokemon.id-b.pokemon.id);
}
function cardTypeVars(type){ return typeVars(type||"Normal"); }
function evolutionGroupFor(id){
  return app.evolutionGroups.find(g=>{
    if(g.kind==="branch") return g.root===id || (g.branches||[]).includes(id);
    return (g.stages||[]).includes(id);
  }) || null;
}


const TYPE_CODE_NAMES = {
  NOR:"Normal", PFL:"Pflanze", FEU:"Feuer", WAS:"Wasser", ELE:"Elektro",
  PSY:"Psycho", KAM:"Kampf", GIF:"Gift", FLU:"Flug", KAF:"Käfer",
  BOD:"Boden", GES:"Gestein", GEI:"Geist", EIS:"Eis", DRA:"Drache"
};
function rand(arr){ return arr?.length ? arr[Math.floor(Math.random()*arr.length)] : null; }
function pad2(n){ return String(n).padStart(2,"0"); }
function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function encounterPokemonByName(name){ return app.pokemon.find(p=>p.name===name) || null; }
function normalizeEncounterLevelPool(pool=[]){
  return pool.map(v=>String(v).padStart(2,"0")).filter(v=>{
    const n=parseInt(v,10); return Number.isFinite(n)&&n>=1&&n<=10;
  });
}
function generateEncounter(){
  const data=app.encounterData;
  if(!data){ toast("Zufallsdaten konnten nicht geladen werden"); return; }
  const feld=app.encounterField;
  const ts=String(app.encounterTS);
  const opponentOptions=data.opponents?.[ts]||[];
  if(!feld || !opponentOptions.length){ toast("Für diese Auswahl fehlen Daten"); return; }

  const chosen=rand(opponentOptions);
  const isTrainer=/trainer/i.test(chosen||"");
  const freiwillig=/freiw/i.test(chosen||"");
  const isTwo=/\b2\b/.test(chosen||"");
  app.encounterResult=isTrainer
    ? runTrainerEncounter(ts,feld,freiwillig,chosen)
    : runWildEncounter(ts,feld,freiwillig,isTwo?2:1,chosen);
  renderEncounter();
}
function runWildEncounter(ts,feld,freiwillig,anzahl,opponentRoll){
  const data=app.encounterData;
  const levelPool=normalizeEncounterLevelPool(data.wildLevels?.[ts]||[]);
  const results=[]; const usedCodes=new Set();
  for(let i=0;i<anzahl;i++){
    let found=null;
    for(let attempt=0;attempt<60 && !found;attempt++){
      const level=rand(levelPool);
      const code=`${feld}${level}${pad2(randomInt(1,20))}`;
      if(usedCodes.has(code)) continue;
      const hit=data.wildLookup?.[code];
      if(hit) found={code,name:hit.name,image:hit.image,level,typeCode:null};
    }
    if(!found){
      const level=rand(levelPool)||"01";
      found={code:`${feld}${level}00`,name:"(nicht gefunden)",image:null,level,typeCode:null};
    }
    usedCodes.add(found.code); results.push(found);
  }
  return {
    kind:"wild", freiwillig, feld, ts, opponentRoll, items:results,
    steps:[
      {step:"1.0 Gegner",value:opponentRoll},
      {step:"W2.0 Level Wildes Pok",value:results.map(x=>`Lvl ${parseInt(x.level,10)}`).join(" · ")},
      {step:"W3.0 Auswahl Wildes Pok",value:results.map(x=>`${x.code} → ${x.name}`).join(" · ")}
    ]
  };
}
function runTrainerEncounter(ts,feld,freiwillig,opponentRoll){
  const data=app.encounterData;
  const teamSize=rand(data.trainerCounts||[]);
  if(!teamSize) return {kind:"trainer",freiwillig,feld,ts,opponentRoll,items:[],steps:[{step:"1.0 Gegner",value:opponentRoll}]};

  let typeCount=null, safety=0;
  while(safety<200){
    const cand=rand(data.trainerTypeCounts||[]);
    if(cand>=1 && cand<=teamSize){ typeCount=cand; break; }
    safety++;
  }
  if(typeCount===null) typeCount=Math.min(1,teamSize);

  const typePool=data.trainerTypesByField?.[feld]||[];
  const types=Array.from({length:typeCount},()=>rand(typePool)).filter(Boolean);
  const levelPool=normalizeEncounterLevelPool(data.trainerLevels?.[ts]||[]);
  const levelCodes=types.map(()=>rand(levelPool)||"01");

  const base=Math.floor(teamSize/types.length);
  let remainder=teamSize%types.length;
  const distribution=types.map(()=>{
    const v=base+(remainder>0?1:0);
    if(remainder>0) remainder--;
    return v;
  });

  const results=[]; const usedCodes=new Set();
  for(let i=0;i<types.length;i++){
    const typ=types[i];
    const level=levelCodes[i]||levelCodes[0]||"01";
    const reps=Math.max(1,distribution[i]||1);
    for(let r=0;r<reps;r++){
      let found=null;
      for(let attempt=0;attempt<80 && !found;attempt++){
        const code=`${typ}${level}${pad2(randomInt(1,20))}`;
        if(usedCodes.has(code)) continue;
        const hit=data.trainerLookup?.[code];
        if(hit) found={code,name:hit.name,image:hit.image,typeCode:typ,level};
      }
      if(!found) found={code:`${typ}${level}00`,name:"(nicht gefunden)",image:null,typeCode:typ,level};
      usedCodes.add(found.code); results.push(found);
    }
  }
  if(results.length>teamSize) results.splice(teamSize);
  while(results.length<teamSize) results.push({code:"",name:"(fehlend)",image:null,typeCode:types[0]||"",level:levelCodes[0]||""});

  return {
    kind:"trainer", freiwillig, feld, ts, opponentRoll, items:results,
    steps:[
      {step:"1.0 Gegner",value:opponentRoll},
      {step:"T2.0 Anzahl Trainer Pok",value:String(teamSize)},
      {step:"T3.0 Anz Typen Trainer Pok",value:String(typeCount)},
      {step:"T4.0 Typen Trainer Pok",value:types.map(t=>`${t} (${TYPE_CODE_NAMES[t]||t})`).join(" · ")},
      {step:"T5.0 Level Trainer Pok",value:levelCodes.map(v=>`Lvl ${parseInt(v,10)}`).join(" · ")},
      {step:"T6.0 Auswahl Trainer Pok",value:results.map(x=>`${x.code} → ${x.name}`).join(" · ")}
    ]
  };
}
function renderEncounter(){
  const data=app.encounterData;
  if(!data) return;
  if(!app.encounterField) app.encounterField=data.fieldCodes?.[0]||"";
  const select=$("#encounterFieldSelect");
  if(select){
    select.innerHTML=(data.fieldCodes||[]).map(code=>`<option value="${escapeHtml(code)}" ${code===app.encounterField?"selected":""}>${escapeHtml(code)}</option>`).join("");
    select.value=app.encounterField;
  }
  $("#encounterTSValue").textContent=app.encounterTS;
  $("#encounterTSButtons").innerHTML=Array.from({length:14},(_,i)=>`<button type="button" data-encounter-ts="${i}" class="${i===app.encounterTS?"active":""}">${i}</button>`).join("");

  const result=app.encounterResult;
  const wrap=$("#encounterResult");
  wrap.classList.toggle("hidden",!result);
  if(!result) return;

  $("#encounterResultEyebrow").textContent=result.kind==="trainer"?"Trainer-Kampf":"Wilde Begegnung";
  $("#encounterResultTitle").textContent=result.kind==="trainer"?"Trainer-Kampf":"Wilde Begegnung";
  $("#encounterResultMeta").textContent=`Feld ${result.feld} · TS ${result.ts} · ${result.items.length} Pokémon`;
  $("#encounterVoluntary").classList.toggle("hidden",!result.freiwillig);

  $("#encounterPokemonList").innerHTML=result.items.map((item,index)=>{
    const p=encounterPokemonByName(item.name);
    const type=p?.type || TYPE_CODE_NAMES[item.typeCode] || "Unbekannt";
    return `<article class="encounter-mon" style="${typeVars(type)}">
      <div class="encounter-mon-art"><img src="${p?.image||FALLBACK_IMAGE}" alt="${escapeHtml(item.name)}" loading="lazy"></div>
      <div class="encounter-mon-copy">
        <small>${result.kind==="trainer"?"Trainer":"Wild"} · ${escapeHtml(item.code||"")}</small>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(type)} · Level ${parseInt(item.level,10)||"—"}</span>
      </div>
      <div class="encounter-level-badge">Lvl ${parseInt(item.level,10)||"—"}</div>
    </article>`;
  }).join("");
  $$("#encounterPokemonList img").forEach(setImgFallback);

  $("#encounterStepList").innerHTML=result.steps.map((s,i)=>`<div class="encounter-step-row"><span>${i+1}</span><div><strong>${escapeHtml(s.step)}</strong><small>${escapeHtml(s.value)}</small></div></div>`).join("");
}
function transferEncounterToFight(){
  const result=app.encounterResult;
  if(!result?.items?.length){ toast("Noch keine Begegnung ausgewürfelt"); return; }
  let added=0;
  for(const item of result.items){
    const p=encounterPokemonByName(item.name); if(!p) continue;
    const level=Math.min(10,Math.max(1,parseInt(item.level,10)||p.minLevel));
    app.fightTeam.push({uid:newFightUid(),id:p.id,level,role:"opponent",freeLevel:true});
    added++;
  }
  saveFightState();
  if(!added){ toast("Keine Pokémon konnten übernommen werden"); return; }
  showModule("fight");
  toast(`${added} ${added===1?"Pokémon":"Pokémon"} als Gegner übernommen`);
}


/* ---------- Weltkarte ---------- */
const mapRuntime = {
  ctx:null, width:0, height:0, dpr:1, baseCell:28, offsetX:0, offsetY:0,
  zoom:1, panX:0, panY:0, minZoom:.75, maxZoom:5.5,
  pointers:new Map(), moved:false, pinching:false, lastPinchDist:0
};
function mapFieldById(id){ return app.mapData?.fields?.find(f=>f.id===id) || null; }
function trainerLayer(){ return app.mapData?.layers?.Trainer || null; }
function trainerEntries(){ return trainerLayer()?.entries || []; }
function trainerById(id){ return trainerEntries().find(t=>t.symbolId===id) || null; }
const MAP_CONFIG_DOC = "pu_map_config";
const MAP_CONFIG_CACHE = "pu-map-trainer-locations-v1";
function applyTrainerLocations(locations={}){
  for(const trainer of trainerEntries()){
    const fieldId=locations[trainer.symbolId];
    if(fieldId && mapFieldById(fieldId)) trainer.fieldId=fieldId;
  }
}
async function loadMapTrainerConfig(){
  if(!app.mapData) return;
  try { applyTrainerLocations(JSON.parse(localStorage.getItem(MAP_CONFIG_CACHE)||"{}")); } catch{}
  try {
    const snap=await getDoc(doc(db,"players",MAP_CONFIG_DOC));
    if(!snap.exists()) return;
    const locations=snap.data()?.trainerLocations || {};
    applyTrainerLocations(locations);
    localStorage.setItem(MAP_CONFIG_CACHE,JSON.stringify(locations));
  } catch(err){ console.warn("Trainerpositionen konnten nicht geladen werden",err); }
}
async function saveMapTrainerConfig(){
  if(!app.isAdmin) return false;
  const trainerLocations=Object.fromEntries(trainerEntries().map(t=>[t.symbolId,t.fieldId]));
  try {
    await setDoc(doc(db,"players",MAP_CONFIG_DOC),{
      name:"PU Kartenkonfiguration", kind:"map-config", trainerLocations, updatedAt:serverTimestamp()
    },{merge:true});
    localStorage.setItem(MAP_CONFIG_CACHE,JSON.stringify(trainerLocations));
    return true;
  } catch(err){
    console.error("Trainerpositionen konnten nicht gespeichert werden",err);
    return false;
  }
}
function mapEncounterCode(field){
  const code=String(field?.id||"").slice(0,3);
  return app.encounterData?.fieldCodes?.includes(code) ? code : null;
}
function mapWorldRect(field){
  const grid=app.mapData?.grid||{width:1,height:1};
  return {
    x:mapRuntime.offsetX + field.x*mapRuntime.baseCell,
    y:mapRuntime.offsetY + (grid.height-field.y-1)*mapRuntime.baseCell,
    w:mapRuntime.baseCell, h:mapRuntime.baseCell
  };
}
function resizeMapCanvas(reset=false){
  const canvas=$("#mapCanvas");
  if(!canvas || !app.mapData) return;
  const rect=canvas.getBoundingClientRect();
  if(rect.width<20 || rect.height<20) return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  mapRuntime.width=rect.width; mapRuntime.height=rect.height; mapRuntime.dpr=dpr;
  canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr);
  const grid=app.mapData.grid;
  const margin=Math.max(12,Math.min(rect.width,rect.height)*.04);
  mapRuntime.baseCell=Math.max(8,Math.min((rect.width-margin*2)/grid.width,(rect.height-margin*2)/grid.height));
  mapRuntime.offsetX=(rect.width-grid.width*mapRuntime.baseCell)/2;
  mapRuntime.offsetY=(rect.height-grid.height*mapRuntime.baseCell)/2;
  if(reset){ mapRuntime.zoom=1; mapRuntime.panX=0; mapRuntime.panY=0; }
  drawMap();
}
function resetMapViewport(){ resizeMapCanvas(true); toast("Karte zentriert"); }
function drawMapSymbol(ctx,cx,cy,bw,bh,s){
  ctx.save();
  ctx.fillStyle=s.color||"#000"; ctx.strokeStyle="rgba(20,32,43,.72)"; ctx.lineWidth=1/Math.max(.001,mapRuntime.zoom);
  const typ=String(s.shape||"").toLowerCase();
  if(typ.includes("sech")||typ.includes("hex")){
    ctx.beginPath();
    for(let i=0;i<6;i++){ const a=Math.PI/3*i-Math.PI/6; const x=cx+(bw/2)*Math.cos(a), y=cy+(bh/2)*Math.sin(a); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(typ.includes("kreis")||typ.includes("circle")||typ.includes("rund")){
    ctx.beginPath(); ctx.arc(cx,cy,Math.max(1,Math.min(bw,bh)/2),0,Math.PI*2); ctx.fill(); ctx.stroke();
  } else if(typ.includes("drei")||typ.includes("tri")){
    ctx.beginPath(); ctx.moveTo(cx,cy-bh/2); ctx.lineTo(cx-bw/2,cy+bh/2); ctx.lineTo(cx+bw/2,cy+bh/2); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else { ctx.fillRect(cx-bw/2,cy-bh/2,bw,bh); ctx.strokeRect(cx-bw/2,cy-bh/2,bw,bh); }
  ctx.restore();
}
function drawMap(){
  const canvas=$("#mapCanvas"); if(!canvas || !app.mapData) return;
  const ctx=mapRuntime.ctx || (mapRuntime.ctx=canvas.getContext("2d"));
  const dpr=mapRuntime.dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,mapRuntime.width,mapRuntime.height);
  ctx.fillStyle="#eef2f6"; ctx.fillRect(0,0,mapRuntime.width,mapRuntime.height);
  ctx.setTransform(dpr*mapRuntime.zoom,0,0,dpr*mapRuntime.zoom,dpr*mapRuntime.panX,dpr*mapRuntime.panY);

  const area=app.mapActiveArea ? app.mapData.layers?.[app.mapActiveArea] : null;
  const areaColors=new Map((area?.entries||[]).map(e=>[e.fieldId,e.color]));
  for(const f of app.mapData.fields){
    const r=mapWorldRect(f); const fill=areaColors.get(f.id)||f.color||"#fff";
    ctx.fillStyle=fill; ctx.fillRect(r.x,r.y,r.w,r.h);
  }
  ctx.strokeStyle="rgba(89,101,116,.42)"; ctx.lineWidth=1/Math.max(.001,mapRuntime.zoom);
  for(const f of app.mapData.fields){ const r=mapWorldRect(f); ctx.strokeRect(r.x+.5/mapRuntime.zoom,r.y+.5/mapRuntime.zoom,r.w,r.h); }

  if(mapRuntime.zoom>=1.35){
    ctx.textBaseline="top"; ctx.fillStyle="rgba(31,45,58,.72)"; ctx.font=`${Math.max(4.7,7/mapRuntime.zoom)}px system-ui,sans-serif`;
    for(const f of app.mapData.fields){ const r=mapWorldRect(f); ctx.fillText(f.id,r.x+2/mapRuntime.zoom,r.y+2/mapRuntime.zoom); }
  }
  if(mapRuntime.zoom>=2.65){
    ctx.textBaseline="bottom"; ctx.fillStyle="rgba(20,32,43,.88)"; ctx.font=`600 ${Math.max(4.8,7.6/mapRuntime.zoom)}px system-ui,sans-serif`;
    for(const f of app.mapData.fields){ const r=mapWorldRect(f); const label=String(f.name||"").slice(0,20); ctx.fillText(label,r.x+2/mapRuntime.zoom,r.y+r.h-2/mapRuntime.zoom); }
  }

  for(const layerName of app.mapSymbolLayers){
    const layer=app.mapData.layers?.[layerName]; if(!layer) continue;
    for(const sym of layer.entries||[]){
      const f=mapFieldById(sym.fieldId); if(!f) continue; const r=mapWorldRect(f);
      const cx=r.x+(Number(sym.posX)||0)/100*r.w, cy=r.y+(Number(sym.posY)||0)/100*r.h;
      const bw=(Number(sym.width)||0)/100*r.w, bh=(Number(sym.height)||0)/100*r.h;
      if(bw>0&&bh>0) drawMapSymbol(ctx,cx,cy,bw,bh,sym);
    }
  }

  if(app.mapSelectedField){
    const r=mapWorldRect(app.mapSelectedField);
    ctx.strokeStyle="#ff4b48"; ctx.lineWidth=3/Math.max(.001,mapRuntime.zoom); ctx.strokeRect(r.x+1.5/mapRuntime.zoom,r.y+1.5/mapRuntime.zoom,r.w-3/mapRuntime.zoom,r.h-3/mapRuntime.zoom);
  }
  ctx.setTransform(1,0,0,1,0,0);
}
function mapLocalPoint(clientX,clientY){ const r=$("#mapCanvas").getBoundingClientRect(); return {x:clientX-r.left,y:clientY-r.top}; }
function mapScreenToWorld(localX,localY){ return {x:(localX-mapRuntime.panX)/mapRuntime.zoom,y:(localY-mapRuntime.panY)/mapRuntime.zoom}; }
function mapFieldAt(clientX,clientY){
  const p=mapLocalPoint(clientX,clientY), w=mapScreenToWorld(p.x,p.y);
  for(const f of app.mapData?.fields||[]){ const r=mapWorldRect(f); if(w.x>=r.x&&w.x<=r.x+r.w&&w.y>=r.y&&w.y<=r.y+r.h) return f; }
  return null;
}
function mapFieldTags(field){
  const tags=[];
  for(const [name,layer] of Object.entries(app.mapData?.layers||{})){
    if(layer.type!=="symbol") continue;
    for(const e of layer.entries||[]) if(e.fieldId===field.id && e.name) tags.push(e.name);
  }
  if(app.mapActiveArea){
    const layer=app.mapData.layers?.[app.mapActiveArea];
    if(layer?.entries?.some(e=>e.fieldId===field.id)) tags.unshift(`${app.mapActiveArea} · Vorkommen`);
  }
  return [...new Set(tags)];
}
function updateMapFieldCard(){
  const f=app.mapSelectedField, card=$("#mapFieldCard"); if(!card) return;
  card.classList.toggle("hidden",!f); if(!f) return;
  $("#mapFieldId").textContent=f.id; $("#mapFieldName").textContent=f.name||f.id; $("#mapFieldDescription").textContent=f.description||"Keine Beschreibung hinterlegt.";
  const code=mapEncounterCode(f); $("#mapFieldEncounterCode").textContent=code?`Generator: ${code}`:"Kein Generator";
  const tags=mapFieldTags(f); $("#mapFieldTags").innerHTML=tags.map(t=>`<span>${escapeHtml(t)}</span>`).join("");
  $("#mapToEncounterBtn").classList.toggle("hidden",!code);
}
function openMapField(field){ app.mapSelectedField=field; updateMapFieldCard(); drawMap(); }
function closeMapField(){ app.mapSelectedField=null; updateMapFieldCard(); drawMap(); }
function renderTrainerEditList(){
  const wrap=$("#trainerEditList"); if(!wrap) return;
  const rows=trainerEntries();
  wrap.innerHTML=rows.length?rows.map(t=>{
    const f=mapFieldById(t.fieldId);
    return `<button type="button" class="trainer-edit-row ${app.mapTrainerMoveId===t.symbolId?"active":""}" data-trainer-move="${escapeHtml(t.symbolId)}"><span class="trainer-dot"></span><span><strong>${escapeHtml(t.name||t.symbolId)}</strong><small>${escapeHtml(t.fieldId)}${f?.name?` · ${escapeHtml(f.name)}`:""}</small></span><b>${app.mapTrainerMoveId===t.symbolId?"Ausgewählt":"Verschieben"}</b></button>`;
  }).join(""):`<div class="diff-empty">Keine Trainer hinterlegt.</div>`;
}
function renderMapTrainerEditUi(){
  const allowed=app.isAdmin && app.editMode;
  const btn=$("#mapTrainerEditBtn"), banner=$("#mapTrainerMoveBanner"), text=$("#mapTrainerMoveText");
  if(btn) btn.classList.toggle("hidden",!allowed);
  if(!allowed && app.mapTrainerMoveId) app.mapTrainerMoveId=null;
  const trainer=allowed && app.mapTrainerMoveId ? trainerById(app.mapTrainerMoveId) : null;
  if(banner) banner.classList.toggle("hidden",!trainer);
  if(text && trainer){
    const f=mapFieldById(trainer.fieldId);
    text.textContent=`${trainer.name||trainer.symbolId} verschieben · aktuell ${trainer.fieldId}${f?.name?` (${f.name})`:""} · Zielfeld antippen`;
  }
  renderTrainerEditList();
}
function startTrainerMove(symbolId){
  if(!app.isAdmin || !app.editMode){ toast("Bearbeitungsmodus erforderlich"); return; }
  const trainer=trainerById(symbolId); if(!trainer) return;
  app.mapTrainerMoveId=symbolId;
  app.mapSymbolLayers.add("Trainer");
  closeSheets(); updateMapLayerStatus(); renderMapLayerMenu(); renderMapTrainerEditUi(); drawMap();
  toast(`${trainer.name||"Trainer"}: Zielfeld antippen`);
}
function cancelTrainerMove(){
  if(!app.mapTrainerMoveId) return;
  app.mapTrainerMoveId=null; renderMapTrainerEditUi(); drawMap(); toast("Verschieben abgebrochen");
}
async function moveSelectedTrainerToField(field){
  const trainer=trainerById(app.mapTrainerMoveId);
  if(!trainer || !field || !app.isAdmin || !app.editMode) return;
  const oldFieldId=trainer.fieldId;
  if(oldFieldId===field.id){ app.mapTrainerMoveId=null; app.mapSelectedField=field; renderMap(); toast(`${trainer.name||"Trainer"} steht bereits hier`); return; }
  trainer.fieldId=field.id;
  app.mapTrainerMoveId=null; app.mapSelectedField=field;
  renderMap();
  const ok=await saveMapTrainerConfig();
  if(ok) toast(`${trainer.name||"Trainer"} → ${field.id}`);
  else { trainer.fieldId=oldFieldId; renderMap(); toast("Trainerposition konnte nicht gespeichert werden"); }
}
function updateMapLayerStatus(){
  const parts=[]; if(app.mapActiveArea) parts.push(app.mapActiveArea); parts.push(...app.mapSymbolLayers);
  const el=$("#mapLayerStatus"); if(el) el.textContent=parts.length?parts.join(" + "):"Basis-Karte";
}
function renderMapLayerMenu(){
  const wrap=$("#mapLayerGroups"); if(!wrap||!app.mapData) return;
  const q=app.mapLayerSearch.trim().toLowerCase();
  const html=[];
  for(const group of app.mapData.groups||[]){
    const items=(group.items||[]).filter(i=>!q || `${i.name} ${group.name}`.toLowerCase().includes(q));
    if(!items.length) continue;
    html.push(`<details class="map-layer-group" ${q||group.name==="Allgemein"?"open":""}><summary><span>${escapeHtml(group.name)}</span><small>${items.length}</small></summary><div class="map-layer-items">${items.map(i=>{
      const active=i.type==="area"?app.mapActiveArea===i.layer:app.mapSymbolLayers.has(i.layer);
      return `<button type="button" class="map-layer-item ${active?"active":""}" data-map-layer="${escapeHtml(i.layer)}" data-map-layer-type="${i.type}"><span class="map-layer-swatch" style="${i.type==="symbol"?"":"--swatch:"+(app.mapData.layers?.[i.layer]?.entries?.[0]?.color||"#ccd3da")}">${i.type==="symbol"?(active?"✓":"○"):""}</span><span>${escapeHtml(i.name)}</span><b>${active?"Aktiv":""}</b></button>`;
    }).join("")}</div></details>`);
  }
  wrap.innerHTML=html.join("")||`<div class="diff-empty">Kein Layer gefunden.</div>`;
}
function setMapLayer(name,type){
  if(type==="area") app.mapActiveArea=app.mapActiveArea===name?null:name;
  else { if(app.mapSymbolLayers.has(name)) app.mapSymbolLayers.delete(name); else app.mapSymbolLayers.add(name); }
  updateMapLayerStatus(); renderMapLayerMenu(); updateMapFieldCard(); drawMap();
}
function clearMapLayers(){ app.mapActiveArea=null; app.mapSymbolLayers.clear(); updateMapLayerStatus(); renderMapLayerMenu(); updateMapFieldCard(); drawMap(); toast("Alle Layer ausgeschaltet"); }
function renderMap(){
  if(!app.mapData) return;
  updateMapLayerStatus(); renderMapLayerMenu(); updateMapFieldCard(); renderMapTrainerEditUi();
  requestAnimationFrame(()=>resizeMapCanvas(false));
}
function setupMapCanvas(){
  const canvas=$("#mapCanvas"); if(!canvas) return;
  canvas.addEventListener("pointerdown",e=>{
    canvas.setPointerCapture?.(e.pointerId);
    mapRuntime.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
    if(mapRuntime.pointers.size===1){ mapRuntime.moved=false; mapRuntime.pinching=false; }
    if(mapRuntime.pointers.size>=2){
      mapRuntime.pinching=true; mapRuntime.moved=true;
      const pts=[...mapRuntime.pointers.values()]; mapRuntime.lastPinchDist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
    }
  });
  canvas.addEventListener("pointermove",e=>{
    const prev=mapRuntime.pointers.get(e.pointerId); if(!prev) return;
    const dx=e.clientX-prev.x, dy=e.clientY-prev.y;
    mapRuntime.pointers.set(e.pointerId,{...prev,x:e.clientX,y:e.clientY});
    if(mapRuntime.pointers.size===1 && !mapRuntime.pinching){
      const p=mapRuntime.pointers.get(e.pointerId); if(Math.hypot(p.x-p.startX,p.y-p.startY)>5) mapRuntime.moved=true;
      mapRuntime.panX+=dx; mapRuntime.panY+=dy; drawMap();
    } else if(mapRuntime.pointers.size>=2){
      mapRuntime.pinching=true; mapRuntime.moved=true;
      const pts=[...mapRuntime.pointers.values()];
      const dist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
      const centerClient={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}; const center=mapLocalPoint(centerClient.x,centerClient.y);
      if(mapRuntime.lastPinchDist>0 && dist>0){
        const world=mapScreenToWorld(center.x,center.y); const next=Math.max(mapRuntime.minZoom,Math.min(mapRuntime.maxZoom,mapRuntime.zoom*(dist/mapRuntime.lastPinchDist)));
        mapRuntime.zoom=next; mapRuntime.panX=center.x-world.x*next; mapRuntime.panY=center.y-world.y*next; drawMap();
      }
      mapRuntime.lastPinchDist=dist;
    }
  });
  canvas.addEventListener("pointerup",e=>{
    const before=mapRuntime.pointers.size; const wasPinching=mapRuntime.pinching; const moved=mapRuntime.moved;
    mapRuntime.pointers.delete(e.pointerId); canvas.releasePointerCapture?.(e.pointerId);
    if(before===1 && !wasPinching && !moved){
      const f=mapFieldAt(e.clientX,e.clientY);
      if(f && app.mapTrainerMoveId) moveSelectedTrainerToField(f);
      else if(f) openMapField(f);
      else closeMapField();
    }
    if(mapRuntime.pointers.size<2){ mapRuntime.pinching=false; mapRuntime.lastPinchDist=0; }
    if(mapRuntime.pointers.size===0) mapRuntime.moved=false;
  });
  canvas.addEventListener("pointercancel",e=>{ mapRuntime.pointers.delete(e.pointerId); if(mapRuntime.pointers.size<2) mapRuntime.pinching=false; });
  canvas.addEventListener("wheel",e=>{
    e.preventDefault(); const local=mapLocalPoint(e.clientX,e.clientY), world=mapScreenToWorld(local.x,local.y); const factor=e.deltaY<0?1.12:.9;
    const next=Math.max(mapRuntime.minZoom,Math.min(mapRuntime.maxZoom,mapRuntime.zoom*factor)); mapRuntime.zoom=next; mapRuntime.panX=local.x-world.x*next; mapRuntime.panY=local.y-world.y*next; drawMap();
  },{passive:false});
  window.addEventListener("resize",()=>{ if(app.view==="map") resizeMapCanvas(false); });
}

function fightPokemon(id){ return app.pokemon.find(p=>p.id===Number(id)) || null; }
function newFightUid(){ return (globalThis.crypto?.randomUUID?.() || `fight-${Date.now()}-${Math.random().toString(36).slice(2)}`); }
function loadFightState(id){
  app.fightTeam=[]; app.fightBaseline={}; app.fightSelectedId=null; app.fightSelectedLevel=1; app.fightSource="owned"; app.fightRole="own";
  try {
    const raw=JSON.parse(localStorage.getItem(fightKey(id))||"{}");
    if(Array.isArray(raw.team)) app.fightTeam=raw.team.map(m=>({uid:m.uid||newFightUid(),id:+m.id,level:+m.level,role:m.role==="opponent"?"opponent":"own",freeLevel:!!m.freeLevel,startActive:!!m.startActive,turnOrder:Number.isFinite(+m.turnOrder)?+m.turnOrder:null})).filter(m=>fightPokemon(m.id));
    normalizeFightTurnOrder();
    if(raw.baseline&&typeof raw.baseline==="object") app.fightBaseline=Object.fromEntries(Object.entries(raw.baseline).filter(([,v])=>Number.isFinite(+v)&&+v>0).map(([k,v])=>[k,(raw.version>=7?+v:+v*cardSetSize(k))]));
  } catch(err){ console.warn("Kampfstand konnte nicht geladen werden",err); }
  ensureFightSelection(true);
}
function saveFightState(){
  if(!app.player) return;
  localStorage.setItem(fightKey(app.player.id),JSON.stringify({version:12.2,team:app.fightTeam,baseline:app.fightBaseline}));
}
function fightChoices(){
  if(app.fightSource==="favorite") return app.pokemon.filter(p=>stateFor(p).owned && stateFor(p).favorite);
  if(app.fightSource==="owned") return app.pokemon.filter(p=>stateFor(p).owned);
  return app.pokemon;
}
function isOwnFightSource(){ return app.fightSource==="owned" || app.fightSource==="favorite"; }
function defaultFightLevel(p){ return isOwnFightSource()&&stateFor(p).owned ? stateFor(p).level : p.minLevel; }
function ensureFightSelection(resetLevel=false){
  const choices=fightChoices();
  if(!choices.length){ app.fightSelectedId=null; app.fightSelectedLevel=1; return; }
  let p=choices.find(x=>x.id===app.fightSelectedId);
  if(!p){ p=choices[0]; app.fightSelectedId=p.id; resetLevel=true; }
  if(resetLevel) app.fightSelectedLevel=defaultFightLevel(p);
  app.fightSelectedLevel=Math.min(p.maxLevel,Math.max(p.minLevel,+app.fightSelectedLevel||p.minLevel));
}
function fightActiveMembers(team=app.fightTeam){ return team.filter(m=>m.startActive); }
function normalizeFightTurnOrder(){
  const active=fightActiveMembers();
  active.sort((a,b)=>{
    const ao=Number.isFinite(+a.turnOrder)?+a.turnOrder:999, bo=Number.isFinite(+b.turnOrder)?+b.turnOrder:999;
    if(ao!==bo) return ao-bo;
    return app.fightTeam.indexOf(a)-app.fightTeam.indexOf(b);
  });
  active.forEach((m,i)=>m.turnOrder=i+1);
  app.fightTeam.filter(m=>!m.startActive).forEach(m=>m.turnOrder=null);
}
function moveFightTurnOrder(uid,delta){
  normalizeFightTurnOrder();
  const active=fightActiveMembers().sort((a,b)=>a.turnOrder-b.turnOrder);
  const idx=active.findIndex(m=>m.uid===uid); if(idx<0) return;
  const target=Math.max(0,Math.min(active.length-1,idx+delta)); if(target===idx) return;
  const a=active[idx], b=active[target], tmp=a.turnOrder; a.turnOrder=b.turnOrder; b.turnOrder=tmp;
  normalizeFightTurnOrder(); saveFightState(); renderFight();
}
function fightCardDemand(team=app.fightTeam){
  const users={};
  for(const member of team){
    const p=fightPokemon(member.id); if(!p) continue;
    for(const move of attacksFor(p)){
      if(move.level>member.level) continue;
      users[move.name]=(users[move.name]||0)+1;
    }
  }
  return users;
}
function cardsForFightTeam(team=app.fightTeam){
  const demand=fightCardDemand(team), counts={};
  for(const [name,userCount] of Object.entries(demand)){
    // Reserve-Pokémon zählen zur Vorbereitung mit. Da aber maximal vier Pokémon
    // gleichzeitig auf dem Feld stehen, werden pro Attacke höchstens vier
    // vollständige Kartensets benötigt. Sets besiegter Pokémon werden für
    // nachrückende Reserve-Pokémon wiederverwendet.
    counts[name]=Math.min(4,userCount)*cardSetSize(name);
  }
  return counts;
}
function fightCardUsers(name,team=app.fightTeam){
  return team.reduce((sum,member)=>{ const p=fightPokemon(member.id); return sum+(p&&attacksFor(p).some(m=>m.name===name&&m.level<=member.level)?1:0); },0);
}
function totalCopies(counts){ return Object.values(counts).reduce((sum,n)=>sum+(+n||0),0); }
function sortedCardEntries(counts){ return Object.entries(counts).filter(([,n])=>n>0).sort((a,b)=>a[0].localeCompare(b[0],"de")); }
function diffFightCards(current,previous){
  const names=[...new Set([...Object.keys(current),...Object.keys(previous)])].sort((a,b)=>a.localeCompare(b,"de"));
  const add={},keep={},remove={};
  for(const name of names){
    const now=current[name]||0, before=previous[name]||0;
    if(now>before) add[name]=now-before;
    if(now&&before) keep[name]=Math.min(now,before);
    if(before>now) remove[name]=before-now;
  }
  return {add,keep,remove};
}
function renderDiffList(target,counts,emptyText){
  const rows=sortedCardEntries(counts);
  target.innerHTML=rows.length?rows.map(([name,count])=>`<button class="diff-row card-open-row" data-card-open="${escapeHtml(name)}" type="button"><span>${escapeHtml(name)}</span><strong>×${count}</strong></button>`).join(""):`<div class="diff-empty">${emptyText}</div>`;
}
function showModule(view){
  if(view==="director"){
    if(!app.isAdmin){ toast("Admin-Anmeldung erforderlich"); return; }
    app.view="director"; app.selectedId=null;
    $("#detailView").classList.add("hidden");
    $("#dashboardView").classList.add("hidden");
    $("#mainView").classList.add("hidden");
    $("#mapView").classList.add("hidden");
    $("#encounterView").classList.add("hidden");
    $("#fightView").classList.add("hidden");
    $("#battleView").classList.add("hidden");
    $("#libraryView").classList.add("hidden");
    $("#noPlayerView").classList.add("hidden");
    $("#directorView").classList.remove("hidden");
    if(app.player) $("#moduleNav").classList.remove("hidden");
    $("#brandLabel").textContent="Spielleitung";
    $$("#moduleNav [data-module]").forEach(b=>b.classList.remove("active"));
    renderDirector(); closeSheets(); window.scrollTo({top:0,behavior:"instant"}); return;
  }
  if(!app.player){ showNoPlayer(); return; }
  app.view=["dashboard","dex","map","encounter","fight","library"].includes(view)?view:"dashboard";
  app.selectedId=null;
  $("#directorView").classList.add("hidden");
  $("#detailView").classList.add("hidden");
  $("#dashboardView").classList.toggle("hidden",app.view!=="dashboard");
  $("#mainView").classList.toggle("hidden",app.view!=="dex");
  $("#mapView").classList.toggle("hidden",app.view!=="map");
  $("#encounterView").classList.toggle("hidden",app.view!=="encounter");
  $("#fightView").classList.toggle("hidden",app.view!=="fight");
  $("#battleView").classList.add("hidden");
  $("#libraryView").classList.toggle("hidden",app.view!=="library");
  $("#brandLabel").textContent=app.view==="dashboard"?"PU":app.view==="fight"?"Kampf":app.view==="encounter"?"Begegnung":app.view==="map"?"Karte":app.view==="library"?"Bibliothek":"Dex";
  $$("#moduleNav [data-module]").forEach(b=>b.classList.toggle("active",b.dataset.module===app.view));
  if(app.view==="dashboard") renderDashboard();
  else if(app.view==="fight") renderFight();
  else if(app.view==="encounter") renderEncounter();
  else if(app.view==="map") renderMap();
  else if(app.view==="library") renderLibrary();
  else renderGrid();
  window.scrollTo({top:0,behavior:"instant"});
}

function renderFight(){
  if(!app.player) return;
  ensureFightSelection(false);
  const choices=fightChoices();
  const ownedCount=app.pokemon.filter(p=>stateFor(p).owned).length;
  const favoriteCount=app.pokemon.filter(p=>stateFor(p).owned && stateFor(p).favorite).length;
  const ownedBtn=document.querySelector('[data-fight-source="owned"]');
  const favoriteBtn=document.querySelector('[data-fight-source="favorite"]');
  const allBtn=document.querySelector('[data-fight-source="all"]');
  if(ownedBtn) ownedBtn.textContent=`Mein Dex (${ownedCount})`;
  if(favoriteBtn) favoriteBtn.textContent=`Favoriten (${favoriteCount})`;
  if(allBtn) allBtn.textContent=`Alle 151`;
  const sourceHint=$("#fightSourceHint");
  if(sourceHint){
    if(app.fightSource==="favorite" && favoriteCount===ownedCount && ownedCount>0) sourceHint.textContent=`Bei ${app.player.name} sind aktuell alle ${ownedCount} gefangenen Pokémon Favoriten – deshalb ist die Liste identisch mit „Mein Dex“.`;
    else if(app.fightSource==="favorite") sourceHint.textContent=`${favoriteCount} gefangene Favoriten werden angezeigt.`;
    else if(app.fightSource==="owned") sourceHint.textContent=`${ownedCount} gefangene Pokémon werden angezeigt.`;
    else sourceHint.textContent="Alle 151 Pokémon stehen zur Auswahl; Level und Seite kannst du frei festlegen.";
  }
  const select=$("#fightPokemonSelect");
  select.disabled=!choices.length;
  select.innerHTML=choices.length?choices.map(p=>`<option value="${p.id}" ${p.id===app.fightSelectedId?"selected":""}>#${pad(p.id)} · ${escapeHtml(p.name)}${isOwnFightSource()?` · Lv ${stateFor(p).level}`:""}</option>`).join(""):`<option>${app.fightSource==="favorite"?"Keine gefangenen Favoriten":"Keine gefangenen Pokémon"}</option>`;
  const p=fightPokemon(app.fightSelectedId);
  $$("[data-fight-source]").forEach(b=>b.classList.toggle("active",b.dataset.fightSource===app.fightSource));
  $$("[data-fight-role]").forEach(b=>b.classList.toggle("active",b.dataset.fightRole===app.fightRole));
  $("#fightAddBtn").disabled=!p;
  if(p){
    $("#fightLevelValue").textContent=app.fightSelectedLevel;
    $("#fightLevelNote").textContent=isOwnFightSource()&&stateFor(p).owned?`Dex-Level: ${stateFor(p).level} · Erlaubt für ${p.name}: ${p.minLevel}–${p.maxLevel}`:`Erlaubt für ${p.name}: ${p.minLevel}–${p.maxLevel}`;
    $("#fightLevelButtons").innerHTML=Array.from({length:10},(_,i)=>i+1).map(level=>`<button type="button" data-fight-level="${level}" class="${level===app.fightSelectedLevel?"active":""}" ${level<p.minLevel||level>p.maxLevel?"disabled":""}>${level}</button>`).join("");
  } else {
    $("#fightLevelValue").textContent="—"; $("#fightLevelNote").textContent="Markiere zuerst ein Pokémon als gefangen oder wähle ‚Alle 151‘."; $("#fightLevelButtons").innerHTML="";
  }

  const team=$("#fightTeamList");
  const ownTeam=app.fightTeam.filter(m=>m.role!=="opponent"), oppTeam=app.fightTeam.filter(m=>m.role==="opponent");
  $("#fightTeamHeading").textContent=app.fightTeam.length?`${ownTeam.length} eigenes · ${oppTeam.length} Gegner`:"Noch kein Pokémon";
  team.innerHTML=app.fightTeam.length?app.fightTeam.map((m,index)=>{
    const mon=fightPokemon(m.id); const type=mon?.type||"Normal"; const learnedMoves=mon?attacksFor(mon).filter(a=>a.level<=m.level):[]; const copies=learnedMoves.reduce((sum,a)=>sum+cardSetSize(a.name),0);
    return `<article class="fight-member ${m.startActive?"fight-start-active":""}" style="${typeVars(type)}"><div class="fight-member-art"><img src="${mon?.image||FALLBACK_IMAGE}" alt="${escapeHtml(mon?.name||"Pokémon")}" loading="lazy"></div><div class="fight-member-copy"><small>${m.role==="opponent"?"Gegner":"Mein Team"} · #${pad(mon?.id||0)}</small><strong>${escapeHtml(mon?.name||"Pokémon")}</strong><span>Lvl ${m.level} · ${learnedMoves.length} Attacken · ${copies} Karten</span><button class="fight-start-toggle ${m.startActive?"active":""}" data-fight-start="${m.uid}" type="button">${m.startActive?"✓ Startfeld":"Startfeld"}</button>${m.startActive?`<div class="fight-turn-order"><small>Reihenfolge</small><button data-fight-order="-1" data-fight-uid="${m.uid}" type="button" aria-label="Früher">↑</button><b>${m.turnOrder||"–"}</b><button data-fight-order="1" data-fight-uid="${m.uid}" type="button" aria-label="Später">↓</button></div>`:""}</div><div class="fight-member-actions"><div class="mini-level"><button data-fight-step="-1" data-fight-uid="${m.uid}" type="button">−</button><b>${m.level}</b><button data-fight-step="1" data-fight-uid="${m.uid}" type="button">＋</button></div><button class="fight-remove" data-fight-remove="${m.uid}" type="button" aria-label="${escapeHtml(mon?.name||"Pokémon")} entfernen">×</button></div></article>`;
  }).join(""):`<div class="fight-empty"><span>⚔</span><strong>Team noch leer</strong><p>Füge oben Pokémon hinzu. Pro Seite sind bis zu 6 Pokémon möglich, davon starten 1 oder 2 gleichzeitig auf dem Feld.</p></div>`;
  $$("#fightTeamList img").forEach(setImgFallback);
  renderFightLaunchState();

  const current=cardsForFightTeam(); const diff=diffFightCards(current,app.fightBaseline);
  $("#fightTeamCount").textContent=app.fightTeam.length; $("#fightUniqueCount").textContent=Object.keys(current).length; $("#fightCopyCount").textContent=totalCopies(current);
  const summaries=[["#fightAddSummary",diff.add],["#fightKeepSummary",diff.keep],["#fightRemoveSummary",diff.remove]];
  for(const [sel,counts] of summaries){ const n=totalCopies(counts); $(sel).textContent=`${n} ${n===1?"Karte":"Karten"}`; }
  renderDiffList($("#fightAddList"),diff.add,"Nichts Neues holen"); renderDiffList($("#fightKeepList"),diff.keep,"Keine Karten bleiben"); renderDiffList($("#fightRemoveList"),diff.remove,"Nichts zurücklegen");
  const currentEntries=sortedCardEntries(current); const currentTotal=totalCopies(current); $("#fightCurrentBadge").textContent=`${currentTotal} ${currentTotal===1?"Karte":"Karten"}`;
  $("#fightCurrentList").innerHTML=currentEntries.length?currentEntries.map(([name,count])=>{
    const users=fightCardUsers(name), setSize=cardSetSize(name);
    const usedSets=Math.min(4,users);
    const detail=users>0?(users>4?`${users} Pokémon · gedeckelt auf ${usedSets} Sets × x${setSize}`:`${users} Pokémon × Satz x${setSize}`):`Kartensatz x${setSize}`;
    return `<button class="current-card-row card-open-row" data-card-open="${escapeHtml(name)}" type="button"><span><b>${escapeHtml(name)}</b><small>${detail}</small></span><strong>×${count}</strong></button>`;
  }).join(""):`<div class="diff-empty">Noch keine Attackenkarten benötigt.</div>`;
  saveFightState();
}
function addFightPokemon(){
  const p=fightPokemon(app.fightSelectedId); if(!p) return;
  const sideCount=app.fightTeam.filter(m=>m.role===app.fightRole).length;
  if(sideCount>=6){ toast("Pro Seite sind maximal 6 Pokémon möglich"); return; }
  const sideStarts=app.fightTeam.filter(m=>m.role===app.fightRole && m.startActive).length;
  const starts=sideStarts===0;
  app.fightTeam.push({uid:newFightUid(),id:p.id,level:app.fightSelectedLevel,role:app.fightRole,startActive:starts,turnOrder:starts?fightActiveMembers().length+1:null});
  normalizeFightTurnOrder(); renderFight(); toast(`${p.name} hinzugefügt`);
}
function toggleFightStart(uid){
  const m=app.fightTeam.find(x=>x.uid===uid); if(!m) return;
  if(!m.startActive){
    const n=app.fightTeam.filter(x=>x.role===m.role&&x.startActive).length;
    if(n>=2){ toast("Maximal 2 Pokémon pro Seite können gleichzeitig starten"); return; }
    m.startActive=true; m.turnOrder=fightActiveMembers().length;
  } else { m.startActive=false; m.turnOrder=null; }
  normalizeFightTurnOrder(); saveFightState(); renderFight();
}
function renderFightLaunchState(){
  const el=$("#fightLaunchInfo"), btn=$("#fightStartLiveBtn"); if(!el||!btn) return;
  const own=app.fightTeam.filter(m=>m.role!=="opponent"), opp=app.fightTeam.filter(m=>m.role==="opponent");
  const ownStart=own.filter(m=>m.startActive).length, oppStart=opp.filter(m=>m.startActive).length;
  const ready=own.length>=1&&opp.length>=1&&own.length<=6&&opp.length<=6&&ownStart>=1&&ownStart<=2&&ownStart===oppStart;
  const activeText=app.activeBattle?" · aktuell läuft bereits ein synchronisierter Kampf":"";
  normalizeFightTurnOrder();
  const order=fightActiveMembers().sort((a,b)=>a.turnOrder-b.turnOrder).map(m=>`${m.turnOrder}. ${fightPokemon(m.id)?.name||"Pokémon"}`).join(" · ");
  el.innerHTML=`<strong>${own.length} vs ${opp.length} Pokémon</strong><span>Startfeld: ${ownStart} vs ${oppStart}${activeText}</span>${order?`<small>Zugreihenfolge: ${escapeHtml(order)}</small>`:""}`;
  btn.disabled=!ready;
  btn.textContent=app.activeBattle?"Laufenden Kampf ersetzen":"Kampf starten";
  $("#fightLaunchHint").textContent=ready?`Start mit ${ownStart} gegen ${oppStart}. Alle Team- und Reserve-Pokémon zählen zur Kartenliste. Pro Attacke werden jedoch höchstens 4 Kartensets eingeplant, weil maximal 4 Pokémon gleichzeitig kämpfen und Sets nach einem K. o. weiterverwendet werden. Reserve-Pokémon können nur nachrücken, wenn ein aktives Pokémon besiegt wurde.`:"Wähle auf beiden Seiten gleich viele Start-Pokémon (1 oder 2), lege ihre Reihenfolge fest und mindestens ein Pokémon pro Team.";
}
function stepFightMember(uid,delta){
  const m=app.fightTeam.find(x=>x.uid===uid); if(!m)return; const p=fightPokemon(m.id); if(!p)return;
  const min=m.freeLevel?1:p.minLevel, max=m.freeLevel?10:p.maxLevel;
  m.level=Math.min(max,Math.max(min,m.level+delta)); renderFight();
}
function startNextFight(){
  const current=cardsForFightTeam();
  if(!app.fightTeam.length && !Object.keys(current).length){ toast("Stelle zuerst einen Kampf zusammen"); return; }
  app.fightBaseline=current; app.fightTeam=[]; saveFightState(); renderFight(); toast("Kartenstand gemerkt · neues Team wählen");
}

const ACTIVE_BATTLE_DOC="active";
const BATTLE_STATUS_KEYS=["paralyzed","confused","poisoned","burned","sleeping","frozen"];
const BATTLE_STATUS_ICONS={paralyzed:"⚡",confused:"?",poisoned:"☠",burned:"🔥",sleeping:"Zz",frozen:"❄"};
const BATTLE_STAT_LABELS={attack:"Angriff",defense:"Verteidigung",accuracy:"Genauigkeit",initiative:"Initiative"};
const BATTLE_STAT_LIMITS={attack:[-1,2],defense:[-2,1],accuracy:[-2,2],initiative:[-2,2]};
function clampBattleStat(key,value){ const [min,max]=BATTLE_STAT_LIMITS[key]||[-99,99]; return Math.max(min,Math.min(max,+value||0)); }

function battleDocRef(){ return doc(db,"battles",ACTIVE_BATTLE_DOC); }
function battleStatusTemplate(){ return Object.fromEntries(BATTLE_STATUS_KEYS.map(k=>[k,{active:false,actions:0}])); }
function battleFighterFromMember(m){
  const p=fightPokemon(m.id), c=pokemonCharacterCard(m.id);
  const maxHp=Math.max(1,(+c?.baseHp||10)+(+m.level||1));
  return {
    uid:m.uid, pokemonId:+m.id, level:+m.level, currentHp:maxHp, maxHp, defeated:false,
    drawPile:30, extraDraws:0,
    stats:{attack:0,defense:0,accuracy:0,initiative:0}, statuses:battleStatusTemplate()
  };
}
function battleSideFromTeam(label,team,fieldSize){
  const roster={}; for(const m of team) roster[m.uid]=battleFighterFromMember(m);
  const selected=team.filter(m=>m.startActive).slice(0,fieldSize).map(m=>m.uid);
  return {label,activeSlots:Array.from({length:fieldSize},(_,i)=>selected[i]||null),roster};
}
async function startLiveBattle(){
  if(!app.player){ toast("Wähle zuerst einen Spieler"); return; }
  const own=app.fightTeam.filter(m=>m.role!=="opponent"), opp=app.fightTeam.filter(m=>m.role==="opponent");
  if(!own.length||!opp.length){ toast("Beide Seiten brauchen mindestens ein Pokémon"); return; }
  if(own.length>6||opp.length>6){ toast("Maximal 6 Pokémon pro Seite"); return; }
  const ownStart=own.filter(m=>m.startActive), oppStart=opp.filter(m=>m.startActive);
  if(!ownStart.length||ownStart.length>2||ownStart.length!==oppStart.length){ toast("Startfeld muss auf beiden Seiten gleich groß sein: 1 gegen 1 oder 2 gegen 2"); return; }
  if(app.activeBattle && !confirm("Es läuft bereits ein Kampf. Soll er durch diesen Kampf ersetzt werden?")) return;
  const fieldSize=ownStart.length;
  normalizeFightTurnOrder();
  const ownSide=battleSideFromTeam(app.player.name,own,fieldSize), opponentSide=battleSideFromTeam("Gegner",opp,fieldSize);
  const ordered=fightActiveMembers().sort((a,b)=>a.turnOrder-b.turnOrder).map(m=>{
    const side=m.role==="opponent"?"opponent":"own", sideData=side==="own"?ownSide:opponentSide;
    return {side,slot:sideData.activeSlots.indexOf(m.uid)};
  }).filter(x=>x.slot>=0);
  const payload={
    version:12.2,status:"running",fieldSize,sourcePlayerId:app.player.id,sourcePlayerName:app.player.name,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastEvent:{text:`Kampf gestartet · ${fieldSize} gegen ${fieldSize}`,time:Date.now()},
    turn:{order:ordered,index:0},
    sides:{own:ownSide,opponent:opponentSide}
  };
  try{
    await setDoc(battleDocRef(),payload);
    toast("Kampf in Firebase gestartet"); showBattleDashboard();
  }catch(err){ console.error(err); toast("Kampf konnte nicht gespeichert werden · Firestore-Regeln v12 prüfen"); }
}
function subscribeActiveBattle(){
  try{
    if(app.battleUnsub) app.battleUnsub();
    app.battleUnsub=onSnapshot(battleDocRef(),snap=>{
      const data=snap.exists()?snap.data():null;
      app.activeBattle=data?.status==="running"?data:null;
      if(!app.activeBattle && app.view==="battle"){
        if(app.player) showModule("fight"); else { app.view="dashboard"; showNoPlayer(); }
      }
      renderBattleBanner();
      if(app.view==="battle") renderBattleDashboard();
      if(app.battleSelectedFighter && !$("#battleFighterSheet")?.classList.contains("hidden")) renderBattleFighterSheet();
      if(app.view==="fight"&&app.player) renderFight();
    },err=>{ console.warn("Aktiver Kampf nicht lesbar",err); app.activeBattle=null; renderBattleBanner(); });
  }catch(err){ console.warn(err); }
}
function activeBattleNames(side){
  const s=app.activeBattle?.sides?.[side]; if(!s) return "—";
  return (s.activeSlots||[]).map(uid=>uid&&s.roster?.[uid]).filter(Boolean).map(f=>fightPokemon(f.pokemonId)?.name||"Pokémon").join(" + ")||"freier Platz";
}
function renderBattleBanner(){
  const b=$("#activeBattleBanner"); if(!b) return;
  b.classList.toggle("hidden",!app.activeBattle);
  if(!app.activeBattle) return;
  const own=app.activeBattle.sides?.own?.label||"Team A", opp=app.activeBattle.sides?.opponent?.label||"Team B";
  $("#activeBattleBannerText").textContent=`${own}: ${activeBattleNames("own")} · ${opp}: ${activeBattleNames("opponent")}`;
}
function hideAllMainViews(){
  ["#noPlayerView","#dashboardView","#mainView","#detailView","#mapView","#encounterView","#fightView","#libraryView","#directorView"].forEach(sel=>$(sel)?.classList.add("hidden"));
}
function showBattleDashboard(){
  if(!app.activeBattle){ toast("Aktuell läuft kein Kampf"); return; }
  app.view="battle"; app.selectedId=null; hideAllMainViews(); $("#battleView").classList.remove("hidden");
  $("#brandLabel").textContent="Kampftisch"; $$("#moduleNav [data-module]").forEach(b=>b.classList.remove("active"));
  if(app.player) $("#moduleNav").classList.remove("hidden"); else $("#moduleNav").classList.add("hidden");
  closeSheets(); renderBattleDashboard(); window.scrollTo({top:0,behavior:"instant"});
}
function battleRoster(side){ return app.activeBattle?.sides?.[side]?.roster||{}; }
function battleFighter(side,uid){ return battleRoster(side)?.[uid]||null; }
function battleActiveSlots(side){ return app.activeBattle?.sides?.[side]?.activeSlots||[]; }
function battleActiveFighters(side){ return battleActiveSlots(side).map(uid=>uid?battleFighter(side,uid):null).filter(Boolean); }
function battleTurnOrder(){
  const stored=app.activeBattle?.turn?.order;
  if(Array.isArray(stored)&&stored.length) return stored;
  const out=[]; const size=app.activeBattle?.fieldSize||1;
  for(let i=0;i<size;i++){ out.push({side:"own",slot:i}); out.push({side:"opponent",slot:i}); }
  return out;
}
function battleCurrentTurn(){
  const order=battleTurnOrder(); if(!order.length) return null;
  const index=Math.max(0,Math.min(order.length-1,+app.activeBattle?.turn?.index||0));
  const ref=order[index], uid=battleActiveSlots(ref.side)[ref.slot]||null;
  return {...ref,index,total:order.length,uid,fighter:uid?battleFighter(ref.side,uid):null};
}
async function nextBattleTurn(){
  if(!app.activeBattle) return; const order=battleTurnOrder(); if(!order.length) return;
  const current=battleCurrentTurn(), next=((current?.index||0)+1)%order.length, ref=order[next], uid=battleActiveSlots(ref.side)[ref.slot]||null, f=uid?battleFighter(ref.side,uid):null, p=battleFighterPokemon(f);
  app.battleCalc.result=null; app.battleCalc.attackCard=null; app.battleCalc.defenseCard=""; app.battleCalc.defender=null;
  await battleUpdate({"turn.order":order,"turn.index":next},p?`Weiter · ${p.name} ist am Zug`:`Weiter · Feldplatz ${next+1} ist frei`);
}
function battleFighterPokemon(f){ return f?fightPokemon(f.pokemonId):null; }
function battleSideOfUid(uid){ for(const side of ["own","opponent"]) if(battleFighter(side,uid)) return side; return null; }
function battleOtherSide(side){ return side==="own"?"opponent":"own"; }
function battleRefValue(side,uid){ return `${side}|${uid}`; }
function parseBattleRef(value){ const [side,uid]=String(value||"").split("|"); return {side,uid,fighter:battleFighter(side,uid)}; }
function battleMovement(f){ const c=pokemonCharacterCard(f?.pokemonId); return Math.max(2,(+c?.movement||2)+(+f?.stats?.initiative||0)); }
function battleRangeLabel(f){ return pokemonCharacterCard(f?.pokemonId)?.range==="ranged"?"Fernkampf":"Nahkampf"; }
function battleStatusLabel(key){ return app.battleRules?.statuses?.[key]?.label||({paralyzed:"Paralysiert",confused:"Verwirrt",poisoned:"Vergiftet",burned:"Verbrannt",sleeping:"Schlafend",frozen:"Eingefroren"}[key]||key); }
function battleStatusPills(f){
  const entries=BATTLE_STATUS_KEYS.filter(k=>f?.statuses?.[k]?.active);
  return entries.length?entries.map(k=>`<span class="battle-status-pill status-${k}">${BATTLE_STATUS_ICONS[k]||"•"} ${battleStatusLabel(k)}</span>`).join(""):`<span class="battle-status-pill muted">kein Zustand</span>`;
}
function battleTypeModifiersHtml(f){
  const mods=pokemonCharacterCard(f?.pokemonId)?.typeModifiers||{};
  const rows=Object.entries(mods).sort((a,b)=>a[0].localeCompare(b[0],"de"));
  return rows.length?rows.map(([type,val])=>`<span class="battle-type-mod ${val==="immune"?"immune":(+val>0?"weak":"resist")}">${escapeHtml(type)} ${val==="immune"?"×":(+val>0?`+${val}`:val)}</span>`).join(""):`<span class="battle-type-mod neutral">keine Modifikatoren</span>`;
}
function battleAllDefeated(side,overrideUid=null,overrideHp=null){
  const roster=battleRoster(side); const vals=Object.values(roster);
  return vals.length>0 && vals.every(f=>(f.uid===overrideUid?overrideHp:f.currentHp)<=0);
}
function renderBattleFighterCard(side,f,compact=false){
  const p=battleFighterPokemon(f), type=p?.type||"Normal", hpPct=Math.max(0,Math.min(100,Math.round((f.currentHp/f.maxHp)*100)));
  const status=battleStatusPills(f), stats=f.stats||{};
  if(compact){
    const free=battleActiveSlots(side).some(x=>!x);
    return `<article class="battle-bench-card ${f.currentHp<=0?"defeated":""}" style="${typeVars(type)}"><img src="${p?.image||FALLBACK_IMAGE}" alt="${escapeHtml(p?.name||"Pokémon")}"><div><strong>${escapeHtml(p?.name||"Pokémon")}</strong><span>Lv ${f.level} · ${f.currentHp}/${f.maxHp} KP</span></div>${f.currentHp>0&&free?`<button class="battle-promote-btn" data-battle-promote="${f.uid}" data-battle-side="${side}" type="button">Aufs Feld</button>`:""}</article>`;
  }
  const hasTurn=f.statuses?.poisoned?.active||f.statuses?.burned?.active;
  const hasAttack=BATTLE_STATUS_KEYS.some(k=>f.statuses?.[k]?.active&&(app.battleRules?.statuses?.[k]?.actions||[]).includes("attack")) || (+stats.accuracy<0);
  const hasMan=BATTLE_STATUS_KEYS.some(k=>f.statuses?.[k]?.active&&(app.battleRules?.statuses?.[k]?.actions||[]).includes("maneuver"));
  const turn=battleCurrentTurn(), isCurrent=turn?.side===side&&turn?.uid===f.uid;
  return `<article class="battle-fighter ${isCurrent?"current-turn":""}" style="${typeVars(type)}" data-battle-fighter="${f.uid}">
    <header class="battle-fighter-head"><img src="${p?.image||FALLBACK_IMAGE}" alt="${escapeHtml(p?.name||"Pokémon")}"><div><small>#${pad(p?.id||0)} · ${escapeHtml(type)}</small><h3>${escapeHtml(p?.name||"Pokémon")}</h3><span>Lv ${f.level} · ${battleRangeLabel(f)} · Bewegung ${battleMovement(f)}</span></div><button data-battle-manage="${f.uid}" data-battle-side="${side}" class="battle-manage-btn" type="button">Status & Werte</button></header>
    <div class="battle-hp-row"><div><small>KP</small><strong>${f.currentHp} / ${f.maxHp}</strong></div><div class="battle-hp-track"><span style="width:${hpPct}%"></span></div></div>
    <div class="battle-step-row"><button data-battle-hp="-5" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">−5</button><button data-battle-hp="-1" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">−1</button><button data-battle-hp="1" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">+1</button><button data-battle-hp="5" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">+5</button></div>
    <div class="battle-status-row">${status}</div>
    <div class="battle-stat-strip"><span>Angr ${stats.attack>=0?"+":""}${stats.attack||0}</span><span>Vert ${stats.defense>=0?"+":""}${stats.defense||0}</span><span>Gen ${stats.accuracy>=0?"+":""}${stats.accuracy||0}</span><span>Init ${stats.initiative>=0?"+":""}${stats.initiative||0}</span></div>
    <div class="battle-modifiers">${battleTypeModifiersHtml(f)}</div>
    <div class="battle-deck-grid"><div><small>Nachziehstapel</small><div class="battle-counter"><button data-battle-counter="drawPile" data-battle-delta="-1" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">−</button><strong>${f.drawPile??30}</strong><button data-battle-counter="drawPile" data-battle-delta="1" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">+</button></div></div><div><small>Zusatznachzüge</small><div class="battle-counter"><button data-battle-counter="extraDraws" data-battle-delta="-1" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">−</button><strong>${f.extraDraws??0}</strong><button data-battle-counter="extraDraws" data-battle-delta="1" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">+</button></div></div></div>
    <div class="battle-assistant-actions">${hasTurn?`<button data-battle-status-action="turnStart" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">Zugbeginn</button>`:""}${hasAttack?`<button data-battle-status-action="attack" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">Angriff prüfen</button>`:""}${hasMan?`<button data-battle-status-action="maneuver" data-battle-side="${side}" data-battle-uid="${f.uid}" type="button">Manöver prüfen</button>`:""}</div>
  </article>`;
}
function renderBattleSide(side){
  const root=$(side==="own"?"#battleOwnSide":"#battleOpponentSide"), s=app.activeBattle?.sides?.[side]; if(!root||!s) return;
  const slots=s.activeSlots||[], roster=Object.values(s.roster||{});
  const activeIds=new Set(slots.filter(Boolean)); const reserve=roster.filter(f=>f.currentHp>0&&!activeIds.has(f.uid)); const defeated=roster.filter(f=>f.currentHp<=0);
  root.innerHTML=`<div class="battle-side-head"><div><p class="eyebrow">${side==="own"?"Spieler":"Gegner"}</p><h2>${escapeHtml(s.label||"")}</h2></div><span>${roster.length} Pokémon</span></div>
    <div class="battle-field-label">Auf dem Feld</div><div class="battle-field-grid">${Array.from({length:app.activeBattle.fieldSize||1},(_,i)=>{const uid=slots[i],f=uid?battleFighter(side,uid):null;return f?renderBattleFighterCard(side,f,false):`<div class="battle-empty-slot"><span>＋</span><strong>Freier Feldplatz</strong><small>Reserve-Pokémon wählen</small></div>`;}).join("")}</div>
    <div class="battle-bench-block"><div class="battle-subhead"><strong>Reservebank</strong><span>${reserve.length}</span></div><div class="battle-bench-list">${reserve.length?reserve.map(f=>renderBattleFighterCard(side,f,true)).join(""):`<div class="battle-small-empty">Keine Reserve</div>`}</div></div>
    <div class="battle-bench-block defeated-block"><div class="battle-subhead"><strong>Besiegt</strong><span>${defeated.length}</span></div><div class="battle-bench-list">${defeated.length?defeated.map(f=>renderBattleFighterCard(side,f,true)).join(""):`<div class="battle-small-empty">Noch niemand besiegt</div>`}</div></div>`;
  root.querySelectorAll("img").forEach(setImgFallback);
}
function renderBattleDashboard(){
  const view=$("#battleView"); if(!view) return;
  if(!app.activeBattle){ view.innerHTML=""; return; }
  $("#battleTitle").textContent=`${app.activeBattle.sides?.own?.label||"Team A"} vs ${app.activeBattle.sides?.opponent?.label||"Team B"}`;
  $("#battleFieldSize").textContent=`${app.activeBattle.fieldSize||1} gegen ${app.activeBattle.fieldSize||1}`;
  const evt=app.activeBattle.lastEvent?.text||"Kampf läuft"; $("#battleLastEvent").textContent=evt;
  renderBattleSide("own"); renderBattleSide("opponent"); renderBattleCalculator();
  const ownLost=battleAllDefeated("own"), oppLost=battleAllDefeated("opponent");
  const result=$("#battleVictoryBanner"); result.classList.toggle("hidden",!ownLost&&!oppLost);
  if(ownLost||oppLost) result.innerHTML=`<strong>⚑ Kampf entschieden</strong><span>${ownLost&&oppLost?"Beide Teams sind besiegt.":ownLost?`${escapeHtml(app.activeBattle.sides?.opponent?.label||"Gegner")} hat gewonnen.`:`${escapeHtml(app.activeBattle.sides?.own?.label||"Spieler")} hat gewonnen.`}</span>`;
}
async function battleUpdate(fields,eventText=null){
  if(!app.activeBattle) return;
  const payload={...fields,updatedAt:serverTimestamp()}; if(eventText) payload.lastEvent={text:eventText,time:Date.now()};
  try{ await updateDoc(battleDocRef(),payload); }
  catch(err){ console.error(err); toast("Kampf konnte nicht synchronisiert werden · Firestore-Regeln v12 prüfen"); }
}
async function setBattleHp(side,uid,delta){
  const f=battleFighter(side,uid); if(!f) return;
  const next=Math.max(0,Math.min(f.maxHp,(+f.currentHp||0)+delta));
  const fields={[`sides.${side}.roster.${uid}.currentHp`]:next,[`sides.${side}.roster.${uid}.defeated`]:next<=0};
  if(next<=0){ const slots=[...battleActiveSlots(side)].map(x=>x===uid?null:x); fields[`sides.${side}.activeSlots`]=slots; }
  const name=battleFighterPokemon(f)?.name||"Pokémon";
  let msg=`${name}: ${f.currentHp} → ${next} KP`;
  if(next<=0) msg+=` · besiegt`;
  await battleUpdate(fields,msg);
}
async function changeBattleCounter(side,uid,field,delta){
  const f=battleFighter(side,uid); if(!f||!["drawPile","extraDraws"].includes(field)) return;
  const next=Math.max(0,Math.min(99,(+f[field]||0)+delta));
  await battleUpdate({[`sides.${side}.roster.${uid}.${field}`]:next},`${battleFighterPokemon(f)?.name||"Pokémon"}: ${field==="drawPile"?"Nachziehstapel":"Zusatznachzüge"} ${next}`);
}
async function promoteBattleFighter(side,uid){
  const f=battleFighter(side,uid); if(!f||f.currentHp<=0) return;
  const slots=[...battleActiveSlots(side)]; const idx=slots.findIndex(x=>!x); if(idx<0){ toast("Kein freier Feldplatz"); return; }
  if(slots.includes(uid)) return;
  slots[idx]=uid; await battleUpdate({[`sides.${side}.activeSlots`]:slots},`${battleFighterPokemon(f)?.name||"Pokémon"} kommt von der Reserve aufs Feld`);
}
function openBattleFighterSheet(side,uid){ app.battleSelectedFighter={side,uid}; renderBattleFighterSheet(); openSheet("#battleFighterSheet"); }
function renderBattleFighterSheet(){
  const sel=app.battleSelectedFighter; if(!sel) return; const f=battleFighter(sel.side,sel.uid), p=battleFighterPokemon(f); if(!f||!p) return;
  $("#battleFighterSheetName").textContent=p.name;
  const stats=f.stats||{};
  $("#battleFighterSheetBody").innerHTML=`<div class="battle-sheet-summary"><img src="${p.image||FALLBACK_IMAGE}" alt="${escapeHtml(p.name)}"><div><strong>${escapeHtml(p.name)} · Lv ${f.level}</strong><span>${f.currentHp}/${f.maxHp} KP · ${battleRangeLabel(f)} · Bewegung ${battleMovement(f)}</span></div></div>
    <h3>Zustände</h3><div class="battle-status-toggle-grid">${BATTLE_STATUS_KEYS.map(k=>{const st=f.statuses?.[k]||{};return `<button class="${st.active?"active":""}" data-battle-status-toggle="${k}" type="button"><span>${BATTLE_STATUS_ICONS[k]||"•"}</span><strong>${battleStatusLabel(k)}</strong><small>${st.active&&st.actions?`${st.actions} Aktionen`:st.active?"aktiv":"inaktiv"}</small></button>`;}).join("")}</div>
    <h3>Statuswerte</h3><div class="battle-stat-edit">${["attack","defense","accuracy","initiative"].map(k=>`<div><span>${BATTLE_STAT_LABELS[k]}</span><div class="battle-counter"><button data-battle-stat-step="${k}" data-battle-delta="-1" type="button">−</button><strong>${stats[k]>=0?"+":""}${stats[k]||0}</strong><button data-battle-stat-step="${k}" data-battle-delta="1" type="button">+</button></div></div>`).join("")}</div>
    <p class="battle-sheet-note">Genauigkeit -1/-2 sowie Zustandswürfe folgen den Angaben aus Kblatt.pdf. Eingefroren hat dort keine Endbedingung und wird deshalb nur manuell entfernt.</p>`;
  $("#battleFighterSheetBody").querySelectorAll("img").forEach(setImgFallback);
}
async function toggleBattleStatus(key){
  const sel=app.battleSelectedFighter, f=sel&&battleFighter(sel.side,sel.uid); if(!f||!BATTLE_STATUS_KEYS.includes(key)) return;
  const cur=f.statuses?.[key]||{active:false,actions:0}, next={active:!cur.active,actions:0};
  await battleUpdate({[`sides.${sel.side}.roster.${sel.uid}.statuses.${key}`]:next},`${battleFighterPokemon(f)?.name||"Pokémon"}: ${battleStatusLabel(key)} ${next.active?"aktiviert":"entfernt"}`);
}
async function stepBattleStat(key,delta){
  const sel=app.battleSelectedFighter, f=sel&&battleFighter(sel.side,sel.uid); if(!f||!BATTLE_STAT_LABELS[key]) return;
  let next=clampBattleStat(key,(+f.stats?.[key]||0)+delta);
  await battleUpdate({[`sides.${sel.side}.roster.${sel.uid}.stats.${key}`]:next},`${battleFighterPokemon(f)?.name||"Pokémon"}: ${BATTLE_STAT_LABELS[key]} ${next>=0?"+":""}${next}`);
}
function rollD10(){ return Math.floor(Math.random()*10)+1; }
function rollD6(){ return Math.floor(Math.random()*6)+1; }
async function runBattleStatusAction(side,uid,action){
  const f=battleFighter(side,uid); if(!f) return; const p=battleFighterPokemon(f); const fields={}; const notes=[]; let hp=f.currentHp;
  if(action==="turnStart"){
    let loss=0; if(f.statuses?.poisoned?.active) loss++; if(f.statuses?.burned?.active) loss++;
    if(!loss){ toast("Kein Zustand mit Effekt zu Zugbeginn"); return; }
    hp=Math.max(0,hp-loss); fields[`sides.${side}.roster.${uid}.currentHp`]=hp; fields[`sides.${side}.roster.${uid}.defeated`]=hp<=0; notes.push(`Zugbeginn: -${loss} KP`);
    if(hp<=0) fields[`sides.${side}.activeSlots`]=battleActiveSlots(side).map(x=>x===uid?null:x);
  } else {
    let blocked=false;
    const processTimed=key=>{ const st=f.statuses?.[key]; if(!st?.active) return {actions:0}; const n=(+st.actions||0)+1; return {actions:n}; };
    if(f.statuses?.frozen?.active){ blocked=true; notes.push("Eingefroren: Aktion verfällt · Karten zurück auf die Hand"); }
    if(f.statuses?.sleeping?.active){
      const r=rollD10(), st=processTimed("sleeping"); notes.push(`Schlaf: D10 = ${r}`);
      blocked=true; const end=r>=8||st.actions>=4; fields[`sides.${side}.roster.${uid}.statuses.sleeping`]={active:!end,actions:end?0:st.actions}; notes.push(end?`Aktion verfällt · Schlaf endet ${r>=8?"durch den D10-Wurf":"nach 4 Aktionen"}`:"Aktion verfällt · Karten zurück auf die Hand");
    }
    if(f.statuses?.paralyzed?.active){
      const r=rollD10(), st=processTimed("paralyzed"), fail=r>=8, end=st.actions>=6; notes.push(`Paralyse: D10 = ${r}${fail?" → Aktion verfällt":" → Aktion möglich"}`); blocked=blocked||fail; fields[`sides.${side}.roster.${uid}.statuses.paralyzed`]={active:!end,actions:end?0:st.actions}; if(end) notes.push("Paralyse endet nach 6 Aktionen");
    }
    if(action==="attack"&&f.statuses?.confused?.active){
      const r=rollD10(), st=processTimed("confused"), fail=r>=8, end=fail||st.actions>=6; notes.push(`Verwirrung: D10 = ${r}${fail?" → Angriff verfällt, -1 KP":" → Angriff möglich"}`); blocked=blocked||fail; if(fail){hp=Math.max(0,hp-1);fields[`sides.${side}.roster.${uid}.currentHp`]=hp;fields[`sides.${side}.roster.${uid}.defeated`]=hp<=0;} fields[`sides.${side}.roster.${uid}.statuses.confused`]={active:!end,actions:end?0:st.actions}; if(end)notes.push("Verwirrung endet"); if(hp<=0)fields[`sides.${side}.activeSlots`]=battleActiveSlots(side).map(x=>x===uid?null:x);
    }
    if(action==="attack"&&+f.stats?.accuracy<0){
      const acc=String(+f.stats.accuracy), rule=app.battleRules?.accuracy?.[acc], r=rollD10(); const fail=rule? r>=rule.failOnMin:false; notes.push(`Genauigkeit ${acc}: D10 = ${r}${fail?" → Angriffswert 0, Kartentext ignorieren":" → keine Einschränkung"}`);
    }
    if(!blocked&&!notes.length) notes.push("Keine Zustandsprüfung erforderlich");
  }
  await battleUpdate(fields,`${p?.name||"Pokémon"}: ${notes.join(" · ")}`);
}
function handleBattleAreaClick(e){
  const hp=e.target.closest("[data-battle-hp]"); if(hp){setBattleHp(hp.dataset.battleSide,hp.dataset.battleUid,+hp.dataset.battleHp);return;}
  const counter=e.target.closest("[data-battle-counter]"); if(counter){changeBattleCounter(counter.dataset.battleSide,counter.dataset.battleUid,counter.dataset.battleCounter,+counter.dataset.battleDelta);return;}
  const promote=e.target.closest("[data-battle-promote]"); if(promote){promoteBattleFighter(promote.dataset.battleSide,promote.dataset.battlePromote);return;}
  const manage=e.target.closest("[data-battle-manage]"); if(manage){openBattleFighterSheet(manage.dataset.battleSide,manage.dataset.battleManage);return;}
  const act=e.target.closest("[data-battle-status-action]"); if(act){runBattleStatusAction(act.dataset.battleSide,act.dataset.battleUid,act.dataset.battleStatusAction);}
}
function handleBattleFighterSheetClick(e){
  const s=e.target.closest("[data-battle-status-toggle]"); if(s){toggleBattleStatus(s.dataset.battleStatusToggle);return;}
  const st=e.target.closest("[data-battle-stat-step]"); if(st){stepBattleStat(st.dataset.battleStatStep,+st.dataset.battleDelta);}
}
async function endLiveBattle(){
  if(!app.activeBattle) return; if(!confirm("Laufenden Kampf wirklich beenden?")) return;
  try{ await updateDoc(battleDocRef(),{status:"ended",endedAt:serverTimestamp(),updatedAt:serverTimestamp(),lastEvent:{text:"Kampf beendet",time:Date.now()}}); toast("Kampf beendet"); }
  catch(err){console.error(err);toast("Kampf konnte nicht beendet werden");}
}

function activeBattleRefs(){
  const arr=[]; for(const side of ["own","opponent"]){ for(const f of battleActiveFighters(side)) arr.push({side,uid:f.uid,f}); } return arr;
}
function battleRefLabel(ref){ const s=app.activeBattle?.sides?.[ref.side], p=battleFighterPokemon(ref.f); return `${s?.label||ref.side} · ${p?.name||"Pokémon"} Lv ${ref.f.level}`; }
function learnedBattleCards(f,mode){
  const p=battleFighterPokemon(f); if(!p) return [];
  return attacksFor(p).filter(m=>m.level<=f.level).map(m=>attackCard(m.name)).filter(Boolean).filter(c=>mode==="attack"?["attack","versatile"].includes(c.cardType):["defense","versatile"].includes(c.cardType)).sort((a,b)=>a.name.localeCompare(b.name,"de"));
}
function ensureBattleCalc(){
  const turn=battleCurrentTurn();
  if(!turn?.fighter){ app.battleCalc.attacker=null; app.battleCalc.defender=null; app.battleCalc.attackCard=null; app.battleCalc.defenseCard=""; app.battleCalc.result=null; return; }
  app.battleCalc.attacker=battleRefValue(turn.side,turn.uid);
  const defenders=battleActiveFighters(battleOtherSide(turn.side)).map(f=>({side:battleOtherSide(turn.side),uid:f.uid,f}));
  if(!defenders.some(r=>battleRefValue(r.side,r.uid)===app.battleCalc.defender)){ const d=defenders[0]; app.battleCalc.defender=d?battleRefValue(d.side,d.uid):null; app.battleCalc.defenseCard=""; app.battleCalc.result=null; }
  const atkCards=learnedBattleCards(turn.fighter,"attack"); if(!atkCards.some(c=>c.name===app.battleCalc.attackCard)) app.battleCalc.attackCard=atkCards[0]?.name||null;
  const d=parseBattleRef(app.battleCalc.defender), defCards=learnedBattleCards(d.fighter,"defense"); if(app.battleCalc.defenseCard && !defCards.some(c=>c.name===app.battleCalc.defenseCard)) app.battleCalc.defenseCard="";
}
function renderBattleCalculator(){
  if(!app.activeBattle) return; ensureBattleCalc(); const turn=battleCurrentTurn();
  const attackerLabel=$("#battleCalcAttackerLabel"), turnLabel=$("#battleTurnLabel");
  const ar=parseBattleRef(app.battleCalc.attacker);
  if(attackerLabel) attackerLabel.textContent=turn?.fighter?battleRefLabel({side:turn.side,uid:turn.uid,f:turn.fighter}):"Freier Feldplatz – Reserve wählen";
  if(turnLabel) turnLabel.textContent=turn?`Position ${turn.index+1} / ${turn.total}`:"Keine Reihenfolge";
  const defSel=$("#battleCalcDefender"), defenders=turn?battleActiveFighters(battleOtherSide(turn.side)).map(f=>({side:battleOtherSide(turn.side),uid:f.uid,f})):[];
  defSel.innerHTML=defenders.length?defenders.map(r=>`<option value="${battleRefValue(r.side,r.uid)}" ${battleRefValue(r.side,r.uid)===app.battleCalc.defender?"selected":""}>${escapeHtml(battleRefLabel(r))}</option>`).join(""):`<option value="">Kein Gegner auf dem Feld</option>`;
  const atkCards=learnedBattleCards(ar.fighter,"attack"); $("#battleCalcAttackCard").innerHTML=atkCards.length?atkCards.map(c=>`<option value="${escapeHtml(c.name)}" ${c.name===app.battleCalc.attackCard?"selected":""}>${escapeHtml(c.name)} · ${c.value} · ${CARD_KIND_LABELS[c.cardType]}</option>`).join(""):`<option value="">Keine Angriffskarte</option>`;
  const dr=parseBattleRef(app.battleCalc.defender), defCards=learnedBattleCards(dr.fighter,"defense"); $("#battleCalcDefenseCard").innerHTML=`<option value="">Keine Verteidigung</option>`+defCards.map(c=>`<option value="${escapeHtml(c.name)}" ${c.name===app.battleCalc.defenseCard?"selected":""}>${escapeHtml(c.name)} · ${c.value} · ${CARD_KIND_LABELS[c.cardType]}</option>`).join("");
  $("#battleCalculateBtn").disabled=!ar.fighter||!dr.fighter||!app.battleCalc.attackCard;
  renderBattleCalcResult();
}
function calcCardValue(card,owner,opponent,ctx){
  let value=+card?.value||0, locked=false, opponentZero=false, specialSuccess=null; const notes=[], rolls=[];
  const effects=(card?.effects||[]).filter(e=>["duringCombat","immediately"].includes(e.timing));
  for(const e of effects){ const t=e.text||"", low=t.toLowerCase();
    if(low.includes("aufgedruckten wert")&&low.includes("kann nicht geändert")){value=+card.value||0;locked=true;notes.push("Kartenwert ist unveränderbar");}
    if(low.includes("wert der gegnerischen karte ist stattdessen 0")){opponentZero=true;notes.push("Gegnerische Karte = 0");}
    let m=t.match(/Erhöhe den Wert dieser Karte um 1\/8 der gegn\. maximalen KP \(abgerundet\)/i); if(m){const add=Math.floor(opponent.maxHp/8);value+=add;notes.push(`+${add} durch 1/8 der gegnerischen max. KP`);continue;}
    if(/so hoch wie das Level des eigenen Pokemons/i.test(t)){value=owner.level;notes.push(`Wert = eigenes Level (${value})`);continue;}
    if(/so hoch wie das Level des gegnerischen Pokemons, aber niemals höher als 7/i.test(t)){value=Math.min(7,opponent.level);notes.push(`Wert = Gegnerlevel, max. 7 (${value})`);continue;}
    if(/Hälfte der KP des Gegners \(aufgerundet\)/i.test(t)){value=Math.ceil(opponent.currentHp/2);notes.push(`Wert = Hälfte gegnerischer KP (${value})`);continue;}
    m=t.match(/Der Wert dieser Karte ist stattdessen (\d+)\./i); if(m&&!/Würfle/i.test(t)){value=+m[1];notes.push(`Kartenwert = ${value}`);continue;}
    if(/Würfle! Der Wert dieser Karte ist stattdessen das Level des eigenen Pokemons plus den Würfelwert minus 3/i.test(t)){const r=rollD6();value=owner.level+r-3;rolls.push(`W6 ${r}`);notes.push(`Wert = ${owner.level} + ${r} − 3 = ${value}`);continue;}
    if(/Würfle! Bei 1 ist der Wert dieser Karte stattdessen 0/i.test(t)){const r=rollD6();rolls.push(`W6 ${r}`);if(r===1)value=0;notes.push(r===1?"Wurf 1 → Kartenwert 0":"Wurf ≠ 1 → aufgedruckter Wert");continue;}
    if(/Würfle! Ab 3 ist der Wert dieser Karte stattdessen/i.test(t)){const r=rollD6();rolls.push(`W6 ${r}`);const pairs=[...t.matchAll(/ab (\d+) (?:ist der Wert dieser Karte )?stattdessen (\d+)/gi)].map(x=>[+x[1],+x[2]]).sort((a,b)=>a[0]-b[0]);for(const [thr,val] of pairs)if(r>=thr)value=val;notes.push(`W6 ${r} → Kartenwert ${value}`);continue;}
    if(/Lvl-Diff!/i.test(t)&&/Würfle!/i.test(t)){
      const diff=owner.level-opponent.level,r=rollD6(); let threshold=null,exact=null;
      if(card.name==="Geofissur"){ if(diff>6) exact=1; else threshold=diff>4?2:diff>2?3:diff>0?4:diff>-2?5:diff>-4?6:null; }
      else { if(diff>6) exact=4; else threshold=diff>4?5:diff>2?6:diff>0?7:diff>-2?8:diff>-4?9:null; }
      specialSuccess=exact!==null?r===exact:(threshold!==null&&r>=threshold);
      rolls.push(`W6 ${r}`); notes.push(`Leveldiff ${diff} · ${exact!==null?`Erfolg bei ${exact}`:threshold===null?"kein Erfolgswert":`Erfolg ab ${threshold}`} → ${specialSuccess?"Erfolg":"kein Erfolg"}`);continue;
    }
    if(/nicht schläft ist der Wert dieser Karte stattdessen 0/i.test(t)){if(!opponent.statuses?.sleeping?.active)value=0;notes.push(opponent.statuses?.sleeping?.active?"Gegner schläft → normaler Wert":"Gegner schläft nicht → Wert 0");continue;}
    notes.push(`Manuell prüfen: ${t}`);
  }
  return {value,locked,opponentZero,specialSuccess,notes,rolls};
}
function normalizedStatusKey(text){const l=text.toLowerCase();if(l.includes("paralys"))return"paralyzed";if(l.includes("verwirrt"))return"confused";if(l.includes("vergift"))return"poisoned";if(l.includes("verbrannt"))return"burned";if(l.includes("schläft")||l.includes("schlaf"))return"sleeping";if(l.includes("eingefror"))return"frozen";return null;}
function parseAfterEffects(card,ownerRef,oppRef,ctx){
  const effects=[],manual=[]; if(!card||ctx.ignoreText)return{effects,manual};
  for(const e of (card.effects||[]).filter(x=>x.timing==="afterCombat"||x.timing==="scheme")){const t=e.text||"",low=t.toLowerCase();let handled=false;let applies=true,roll=null;const thr=t.match(/Ab (\d+)/i);if(thr){roll=rollD6();applies=roll>=+thr[1];}
    const status=normalizedStatusKey(t);if(status&&!/statusveränderungen/i.test(low)&&!/triplette/i.test(low)){const target=/dein pokemon|eigenen pokemon/i.test(t)&&!/gegner/i.test(t)?ownerRef:oppRef;effects.push({kind:"status",target,status,applies,roll,text:t});handled=true;}
    let m=t.match(/heilt sich um 50% des Schadens/i);if(m){effects.push({kind:"healDamageHalf",target:ownerRef,applies,roll,text:t});handled=true;}
    if(/heilt sich um 50% seiner maximalen KP/i.test(t)){effects.push({kind:"healMaxHalf",target:ownerRef,applies,roll,text:t});handled=true;}
    if(/heilt sich vollständig/i.test(t)){effects.push({kind:"healFull",target:ownerRef,applies,roll,text:t});handled=true;}
    m=t.match(/Füge deinem Pokemon (\d+) Schaden zu/i);if(m){effects.push({kind:"selfDamage",target:ownerRef,amount:+m[1],applies,roll,text:t});handled=true;}
    if(/Dein Pokemon verliert alle KP/i.test(t)){effects.push({kind:"loseAllHp",target:ownerRef,applies,roll,text:t});handled=true;}
    m=t.match(/Wenn erfolgreich, dann füge dem gegnerischen Pokemon (\d+) Schaden zu/i);if(m){effects.push({kind:"directDamage",target:oppRef,amount:+m[1],applies:!!ctx.specialSuccess,roll:null,text:t});handled=true;}
    m=t.match(/(Angriff|Verteidigung|Genauigkeit|Initiative) des (eigenen|gegnerischen) Pokemons (steigt|sinkt) um (\d+)/i);if(m){const key={angriff:"attack",verteidigung:"defense",genauigkeit:"accuracy",initiative:"initiative"}[m[1].toLowerCase()];const target=m[2].toLowerCase()==="eigenen"?ownerRef:oppRef;const delta=(m[3].toLowerCase()==="steigt"?1:-1)*(+m[4]);effects.push({kind:"stat",target,key,delta,applies,roll,text:t});handled=true;}
    if(!handled)manual.push({text:t,roll,applies});
  }
  return {effects,manual};
}
function calculateBattleCombat(){
  const ar=parseBattleRef(app.battleCalc.attacker), dr=parseBattleRef(app.battleCalc.defender), atk=attackCard(app.battleCalc.attackCard), def=app.battleCalc.defenseCard?attackCard(app.battleCalc.defenseCard):null;
  if(!ar.fighter||!dr.fighter||!atk)return;
  const notes=[],rolls=[];let ignoreText=false;
  const accuracy=+ar.fighter.stats?.accuracy||0;if(accuracy<0){const rule=app.battleRules?.accuracy?.[String(accuracy)],r=rollD10();rolls.push(`Genauigkeit D10 ${r}`);if(rule&&r>=rule.failOnMin){ignoreText=true;notes.push(`Genauigkeit ${accuracy}: Angriffswert 0, Angriffskartentext ignoriert`);}}
  let atkRes=ignoreText?{value:0,locked:false,opponentZero:false,specialSuccess:null,notes:[],rolls:[]}:calcCardValue(atk,ar.fighter,dr.fighter,{});
  let defRes=def?calcCardValue(def,dr.fighter,ar.fighter,{}):{value:0,locked:false,opponentZero:false,specialSuccess:null,notes:[],rolls:[]};rolls.push(...atkRes.rolls,...defRes.rolls);notes.push(...atkRes.notes,...defRes.notes.map(x=>`Verteidigung: ${x}`));
  let attackValue=atkRes.value, defenseValue=defRes.value;
  if(defRes.opponentZero)attackValue=0;if(atkRes.opponentZero)defenseValue=0;
  const typeMod=pokemonCharacterCard(dr.fighter.pokemonId)?.typeModifiers?.[atk.type];const immune=typeMod==="immune";if(immune){attackValue=0;ignoreText=true;notes.push(`${atk.type}: Immunität → Angriffswert 0`);}else if(!atkRes.locked&&Number.isFinite(+typeMod)&&+typeMod!==0){attackValue+=+typeMod;notes.push(`Typmodifikator ${atk.type}: ${+typeMod>0?"+":""}${typeMod}`);}
  if(!atkRes.locked&&!ignoreText){attackValue+=(+ar.fighter.stats?.attack||0);if(+ar.fighter.stats?.attack)notes.push(`Angriffswert: ${+ar.fighter.stats.attack>0?"+":""}${ar.fighter.stats.attack}`);}
  if(!defRes.locked&&def){defenseValue+=(+dr.fighter.stats?.defense||0);if(+dr.fighter.stats?.defense)notes.push(`Verteidigungswert: ${+dr.fighter.stats.defense>0?"+":""}${dr.fighter.stats.defense}`);}
  if(ar.fighter.statuses?.burned?.active&&!ignoreText){attackValue=attackValue/2;notes.push("Verbrannt: Angriff halbiert");}
  let rawDamage=Math.max(0,attackValue-defenseValue);
  if(def){for(const e of (def.effects||[]).filter(x=>x.timing==="immediately")){const l=e.text.toLowerCase();if(l.includes("halbiere den schaden")){if(l.includes("außer bei geist- und psychoattacken")&&["Geist","Psycho"].includes(atk.type))notes.push("Reflektor greift bei Geist/Psycho nicht");else{rawDamage=rawDamage/2;notes.push(`${def.name}: Schaden halbiert`);}}}}
  const suggested=Math.max(0,Math.floor(rawDamage));if(!Number.isInteger(rawDamage))notes.push(`Rohschaden ${rawDamage}; Vorschlag ${suggested}. Rundung ist im vorliegenden Regeltext nicht festgelegt und kann angepasst werden.`);
  const atkAfter=parseAfterEffects(atk,{side:ar.side,uid:ar.uid},{side:dr.side,uid:dr.uid},{ignoreText,specialSuccess:atkRes.specialSuccess});
  const defAfter=def?parseAfterEffects(def,{side:dr.side,uid:dr.uid},{side:ar.side,uid:ar.uid},{ignoreText:false,specialSuccess:defRes.specialSuccess}):{effects:[],manual:[]};
  app.battleCalc.result={attacker:{side:ar.side,uid:ar.uid},defender:{side:dr.side,uid:dr.uid},attackCard:atk.name,defenseCard:def?.name||null,attackValue,defenseValue,rawDamage,finalDamage:suggested,notes,rolls,effects:[...atkAfter.effects,...defAfter.effects],manual:[...atkAfter.manual,...defAfter.manual],ignoreText};
  renderBattleCalcResult();
}
function effectTargetName(t){const f=battleFighter(t.side,t.uid);return battleFighterPokemon(f)?.name||"Pokémon";}
function renderBattleCalcResult(){
  const root=$("#battleCalcResult"),r=app.battleCalc.result;if(!root)return;if(!r){root.innerHTML=`<div class="battle-calc-empty">Angriffs- und Verteidigungskarte wählen und anschließend berechnen.</div>`;return;}
  const effects=r.effects.map(e=>`<li class="${e.applies?"auto":"muted"}">${e.roll?`W6 ${e.roll} · `:""}${e.applies?"✓ ":"○ "}${escapeHtml(e.text)}</li>`).join("");
  const manual=r.manual.map(e=>`<li>${e.roll?`W6 ${e.roll} · `:""}${escapeHtml(e.text)} <em>manuell</em></li>`).join("");
  root.innerHTML=`<div class="battle-calc-score"><div><small>Angriff</small><strong>${Number.isInteger(r.attackValue)?r.attackValue:r.attackValue.toFixed(1)}</strong></div><span>−</span><div><small>Verteidigung</small><strong>${Number.isInteger(r.defenseValue)?r.defenseValue:r.defenseValue.toFixed(1)}</strong></div><span>=</span><div class="damage"><small>Rohschaden</small><strong>${Number.isInteger(r.rawDamage)?r.rawDamage:r.rawDamage.toFixed(1)}</strong></div></div>
    ${r.rolls.length?`<div class="battle-rolls">🎲 ${r.rolls.map(escapeHtml).join(" · ")}</div>`:""}
    ${r.notes.length?`<ul class="battle-calc-notes">${r.notes.map(n=>`<li>${escapeHtml(n)}</li>`).join("")}</ul>`:""}
    ${(effects||manual)?`<div class="battle-effects"><strong>Nach dem Kampf</strong><ul>${effects}${manual}</ul></div>`:""}
    <label class="battle-final-damage"><span>Schaden anwenden</span><input id="battleFinalDamageInput" type="number" min="0" max="99" step="1" value="${r.finalDamage}"></label>
    <button class="primary-btn" id="battleApplyResultBtn" type="button">Ergebnis anwenden</button>
    <p class="battle-calc-help">Kartenzähler werden bewusst nicht automatisch verändert. Nicht eindeutig automatisierbare Kartentexte bleiben als manueller Hinweis sichtbar.</p>`;
}
function applyEffectToFighter(cloneF,e,damage){
  if(!e.applies)return;
  if(e.kind==="status"){cloneF.statuses=cloneF.statuses||battleStatusTemplate();cloneF.statuses[e.status]={active:true,actions:0};}
  else if(e.kind==="healDamageHalf")cloneF.currentHp=Math.min(cloneF.maxHp,cloneF.currentHp+Math.ceil(damage/2));
  else if(e.kind==="healMaxHalf")cloneF.currentHp=Math.min(cloneF.maxHp,cloneF.currentHp+Math.ceil(cloneF.maxHp/2));
  else if(e.kind==="healFull")cloneF.currentHp=cloneF.maxHp;
  else if(e.kind==="selfDamage"||e.kind==="directDamage")cloneF.currentHp=Math.max(0,cloneF.currentHp-(e.amount||0));
  else if(e.kind==="loseAllHp")cloneF.currentHp=0;
  else if(e.kind==="stat"){cloneF.stats=cloneF.stats||{attack:0,defense:0,accuracy:0,initiative:0};cloneF.stats[e.key]=clampBattleStat(e.key,(+cloneF.stats[e.key]||0)+e.delta);}
  cloneF.defeated=cloneF.currentHp<=0;
}
async function applyBattleCombatResult(){
  const r=app.battleCalc.result;if(!r||!app.activeBattle)return;const damage=Math.max(0,+r.finalDamage||0);
  const refs=new Map(); for(const t of [r.attacker,r.defender,...r.effects.map(e=>e.target)]){if(!t)continue;const key=battleRefValue(t.side,t.uid);if(!refs.has(key)){const f=battleFighter(t.side,t.uid);if(f)refs.set(key,{ref:t,f:clone(f)});}}
  const defKey=battleRefValue(r.defender.side,r.defender.uid);const d=refs.get(defKey);if(d){d.f.currentHp=Math.max(0,d.f.currentHp-damage);d.f.defeated=d.f.currentHp<=0;}
  for(const e of r.effects){const x=refs.get(battleRefValue(e.target.side,e.target.uid));if(x)applyEffectToFighter(x.f,e,damage);}
  const fields={};for(const {ref,f} of refs.values()){fields[`sides.${ref.side}.roster.${ref.uid}`]=f;if(f.currentHp<=0)fields[`sides.${ref.side}.activeSlots`]=battleActiveSlots(ref.side).map(x=>x===ref.uid?null:x);}
  const aName=effectTargetName(r.attacker),dName=effectTargetName(r.defender);await battleUpdate(fields,`${aName} → ${dName}: ${damage} Schaden (${r.attackCard}${r.defenseCard?` gegen ${r.defenseCard}`:""})`);app.battleCalc.result=null;toast("Kampfergebnis angewendet");
}


async function init(){
  try { app.pokemon=await loadJson("data/pokemon.json"); }
  catch(err){ document.body.innerHTML=`<main style="padding:24px"><h1>Dex konnte nicht geladen werden</h1><p>Bitte über GitHub Pages oder einen Webserver öffnen.</p><pre>${String(err)}</pre></main>`; return; }

  try { const data=await loadJson("data/goals.json"); app.goals=data.goals||[]; }
  catch(err){ console.warn("Zieldaten nicht geladen",err); app.goals=[]; }
  try { const data=await loadJson("data/attacks.json"); app.attacks=data.pokemon||data||{}; }
  catch(err){ console.warn("Attackendaten nicht geladen",err); app.attacks={}; }
  try {
    const data=await loadJson("data/attack-cards.json");
    app.attackCards=data.cards||[]; app.attackCardMap=new Map(app.attackCards.map(c=>[c.name,c]));
  } catch(err){ console.warn("Kartendetails nicht geladen",err); app.attackCards=[]; app.attackCardMap=new Map(); }
  try {
    const data=await loadJson("data/pokemon-cards.json");
    app.pokemonCards=data.pokemon||[]; app.pokemonCardMap=new Map(app.pokemonCards.map(c=>[+c.id,c]));
  } catch(err){ console.warn("Pokémon-Kartendetails nicht geladen",err); app.pokemonCards=[]; app.pokemonCardMap=new Map(); }
  try { const data=await loadJson("data/evolutions.json"); app.evolutionGroups=data.groups||[]; }
  catch(err){ console.warn("Entwicklungsdaten nicht geladen",err); app.evolutionGroups=[]; }
  try {
    app.encounterData=await loadJson("data/encounters.json");
    app.encounterField=app.encounterData.fieldCodes?.[0]||null;
  } catch(err){ console.warn("Zufallsdaten nicht geladen",err); app.encounterData=null; }
  try { app.mapData=await loadJson("data/map.json"); }
  catch(err){ console.warn("Kartendaten nicht geladen",err); app.mapData=null; }
  try { app.battleRules=await loadJson("data/battle-rules.json"); }
  catch(err){ console.warn("Kampfregeln nicht geladen",err); app.battleRules=null; }
  if(app.mapData) await loadMapTrainerConfig();

  buildTypeStrip(); buildLibraryTypeStrip(); bindEvents(); setupMapCanvas(); subscribeActiveBattle();
  onAuthStateChanged(auth, async user=>{
    app.user=user||null; app.isAdmin=!!user && user.uid===ADMIN_UID;
    updateAuthUI();
    if(app.isAdmin) await loadAdminPlayers(); else app.players=[];
    const requested=new URLSearchParams(location.search).get("player");
    const remembered=localStorage.getItem(LAST_PLAYER_KEY);
    let loaded=false;
    for(const candidate of [requested,remembered]){
      if(!candidate || loaded) continue;
      loaded=await selectPlayer(candidate,false);
    }
    if(!loaded && app.isAdmin && app.players[0]) loaded=await selectPlayer(app.players[0].id,false);
    if(!loaded) showNoPlayer();
    render();
  });
  setupPwaInstall();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js?v=12.0").catch(()=>{});
}

async function loadAdminPlayers(){
  try {
    const snap=await getDocs(collection(db,"players"));
    app.adminPlayerData=snap.docs
      .filter(d=>d.id!==MAP_CONFIG_DOC && d.data()?.kind!=="map-config")
      .map(d=>{
        const data=d.data()||{};
        return {id:d.id,name:data.name||"Spieler",state:normalizeState(data.pokemon||{}),profile:normalizeProfile(data.profile||{})};
      })
      .sort((a,b)=>a.name.localeCompare(b.name,"de"));
    app.players=app.adminPlayerData.map(({id,name})=>({id,name}));
    if(app.view==="director") renderDirector();
  } catch(err){ console.error(err); app.adminPlayerData=[]; toast("Spielerliste konnte nicht geladen werden"); }
}

async function selectPlayer(id,close=true){
  try {
    const snap=await getDoc(doc(db,"players",id));
    if(!snap.exists()) throw new Error("Spieler nicht gefunden");
    const data=snap.data();
    app.player={id,name:data.name||"Spieler"};
    localStorage.setItem(LAST_PLAYER_KEY,id);
    app.publishedState=normalizeState(data.pokemon||{});
    app.state=clone(app.publishedState);
    app.publishedProfile=normalizeProfile(data.profile||{});
    app.profile=clone(app.publishedProfile);
    localStorage.setItem(playerKey(id),JSON.stringify(app.state));
    cacheProfile();
    app.selectedId=null; app.editMode=app.isAdmin && app.editMode; app.view="dashboard"; app.encounterResult=null; app.mapSelectedField=null; loadFightState(id);
    history.replaceState(null,"",`${location.pathname}?player=${encodeURIComponent(id)}`);
    $("#directorView").classList.add("hidden"); $("#dashboardView").classList.remove("hidden"); $("#mainView").classList.add("hidden"); $("#mapView").classList.add("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#battleView").classList.add("hidden"); $("#libraryView").classList.add("hidden"); $("#noPlayerView").classList.add("hidden"); $("#moduleNav").classList.remove("hidden");
    $("#brandLabel").textContent="PU"; $$("#moduleNav [data-module]").forEach(b=>b.classList.toggle("active",b.dataset.module==="dashboard"));
    if(close) closeSheets();
    render();
    return true;
  } catch(err){
    console.error(err);
    const cached=localStorage.getItem(playerKey(id));
    if(cached){
      app.player={id,name:"Offline-Spielstand"};
      app.state=normalizeState(JSON.parse(cached)); app.publishedState=clone(app.state);
      try{ app.profile=normalizeProfile(JSON.parse(localStorage.getItem(profileKey(id))||"{}")); }catch{ app.profile=normalizeProfile({}); }
      app.publishedProfile=clone(app.profile); app.view="dashboard"; app.encounterResult=null; app.mapSelectedField=null; loadFightState(id);
      $("#directorView").classList.add("hidden"); $("#dashboardView").classList.remove("hidden"); $("#mainView").classList.add("hidden"); $("#mapView").classList.add("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#battleView").classList.add("hidden"); $("#libraryView").classList.add("hidden"); $("#noPlayerView").classList.add("hidden"); $("#moduleNav").classList.remove("hidden");
      toast("Offline-Kopie geladen");
      render();
      return true;
    } else { showNoPlayer("Dieser Spieler-Link ist ungültig oder derzeit nicht erreichbar."); }
  }
  render();
  return false;
}

function showNoPlayer(msg="Öffne deinen persönlichen Spieler-Link. Als Spielleiter kannst du dich über ☰ anmelden."){
  app.player=null; app.state={}; app.publishedState={}; app.profile=normalizeProfile({}); app.publishedProfile=clone(app.profile); app.selectedId=null; app.fightTeam=[]; app.fightBaseline={}; app.encounterResult=null;
  $("#detailView").classList.add("hidden"); $("#directorView").classList.add("hidden"); $("#dashboardView").classList.add("hidden"); $("#mapView").classList.add("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#battleView").classList.add("hidden"); $("#libraryView").classList.add("hidden"); $("#mainView").classList.add("hidden"); $("#moduleNav").classList.add("hidden"); $("#noPlayerView").classList.remove("hidden");
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
  renderBattleBanner();
  if(app.view==="battle"){ renderBattleDashboard(); updateAuthUI(); return; }
  if(app.player){
    $("#playerNameTop").textContent=app.player.name; $("#playerAvatar").textContent=initials(app.player.name); $("#welcomeLabel").textContent=`${app.player.name}s Dex`;
    renderStats(); renderGrid(); if(app.view==="dashboard") renderDashboard(); else if(app.view==="fight") renderFight(); else if(app.view==="encounter") renderEncounter(); else if(app.view==="map") renderMap(); else if(app.view==="library") renderLibrary(); else if(app.view==="director") renderDirector();
  } else { $("#playerNameTop").textContent=app.isAdmin?"Spieler wählen":"Dex"; $("#playerAvatar").textContent=app.isAdmin?"A":"?"; if(app.view==="director"&&app.isAdmin) renderDirector(); }
  renderPlayerList(); updateAuthUI();
  $("#editModeToggle").checked=app.editMode;
  if(app.selectedId) renderDetail();
}
function renderDashboard(){
  if(!app.player) return;
  const owned=app.pokemon.filter(p=>stateFor(p).owned);
  const favorites=owned.filter(p=>stateFor(p).favorite);
  const ownedCount=owned.length, favCount=favorites.length;
  const avg=ownedCount ? owned.reduce((sum,p)=>sum+stateFor(p).level,0)/ownedCount : 0;
  const percent=app.pokemon.length ? Math.round(ownedCount/app.pokemon.length*100) : 0;
  const trainer=currentTrainerEntry();
  const field=trainer ? mapFieldById(trainer.fieldId) : null;

  $("#dashboardAvatar").textContent=initials(app.player.name);
  $("#dashboardName").textContent=app.player.name;
  $("#dashboardTrainerLevel").textContent=`Trainerstufe ${app.profile.trainerLevel}`;
  $("#dashboardTrainerLevelValue").textContent=app.profile.trainerLevel;
  $("#dashboardTrainerLevelSlider").value=app.profile.trainerLevel;
  $("#dashboardLocation").textContent=field?`${field.id} · ${field.name||"Standort"}`:"Standort nicht gesetzt";
  $("#dashboardOwned").textContent=ownedCount;
  $("#dashboardFavorites").textContent=favCount;
  $("#dashboardAvgLevel").textContent=ownedCount?avg.toFixed(1).replace(".",","):"—";
  $("#dashboardProgressText").textContent=`${percent} % abgeschlossen`;
  $("#dashboardProgressFraction").textContent=`${ownedCount} / ${app.pokemon.length}`;
  $("#dashboardProgressBar").style.width=`${percent}%`;
  $("#dashboardOwnedHint").textContent=`${ownedCount} gefangen`;
  $("#dashboardAdminPanel").classList.toggle("hidden",!(app.isAdmin&&app.editMode));

  const goals=activeGoals();
  const completed=goals.filter(g=>goalProgress(g).done).length;
  $("#dashboardGoalsActive").textContent=`${goals.length} / 3 aktiv`;
  $("#dashboardGoalsDone").textContent=`${completed} erfüllt`;
  $("#dashboardManageGoalsBtn").classList.toggle("hidden",!(app.isAdmin&&app.editMode));
  const goalList=$("#dashboardGoalsList");
  if(goals.length){
    goalList.innerHTML=goals.map(g=>{
      const pr=goalProgress(g);
      return `<article class="dashboard-goal ${pr.done?"done":""}" style="${typeVars(g.type)}"><div class="dashboard-goal-head"><span class="goal-type-dot"></span><div><strong>${escapeHtml(g.label)}</strong><small>${escapeHtml(g.type)} · ${pr.count}/${pr.target} gefangen</small></div><em>${pr.done?"✓ Erfüllt":"Offen"}</em></div><div class="dashboard-goal-track"><span style="width:${pr.pct}%"></span></div></article>`;
    }).join("");
    if(goals.length<3) goalList.insertAdjacentHTML("beforeend",Array.from({length:3-goals.length},()=>`<div class="dashboard-goal-slot">Noch kein Ziel aktiviert</div>`).join(""));
  } else {
    goalList.innerHTML=`<div class="dashboard-empty">Für diesen Spieler sind noch keine Ziele aktiviert.</div>`;
  }

  const favRow=$("#dashboardFavoriteRow");
  favRow.innerHTML=favorites.length?favorites.slice(0,8).map(p=>dashboardPokemonCard(p)).join(""):`<div class="dashboard-empty">Noch keine gefangenen Favoriten.</div>`;
  favRow.querySelectorAll("img").forEach(setImgFallback);

  const strong=[...owned].sort((a,b)=>stateFor(b).level-stateFor(a).level || stateFor(b).ep-stateFor(a).ep || a.id-b.id).slice(0,6);
  $("#dashboardStrongList").innerHTML=strong.length?strong.map((p,i)=>{
    const st=stateFor(p); return `<button type="button" class="dashboard-strong-row" data-dashboard-pokemon="${p.id}" style="${typeVars(p.type)}"><b>${i+1}</b><img src="${p.image}" alt=""><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.type)} · ${st.ep}/10 EP</small></span><em>Lvl ${st.level}</em></button>`;
  }).join(""):`<div class="dashboard-empty">Noch keine Pokémon gefangen.</div>`;
  $("#dashboardStrongList").querySelectorAll("img").forEach(setImgFallback);

  const byType=[...new Set(app.pokemon.map(p=>p.type))].sort((a,b)=>a.localeCompare(b,"de"));
  $("#dashboardTypeProgress").innerHTML=byType.map(type=>{
    const all=app.pokemon.filter(p=>p.type===type), got=all.filter(p=>stateFor(p).owned).length, pct=all.length?Math.round(got/all.length*100):0;
    return `<article style="${typeVars(type)}"><div class="dashboard-type-line"><span><i></i><strong>${escapeHtml(type)}</strong></span><b>${got}/${all.length}</b></div><div class="dashboard-type-track"><span style="width:${pct}%"></span></div></article>`;
  }).join("");

  $("#dashboardLocationName").textContent=field?`${field.name||field.id} · ${field.id}`:"Nicht auf Karte gesetzt";
  $("#dashboardLocationDescription").textContent=field?(field.description||"Keine Beschreibung hinterlegt."):"Für diesen Spieler ist aktuell keine Trainerposition hinterlegt.";
  $("#dashboardLocationOpenBtn").disabled=!field;
  $("#dashboardMapBtn").disabled=!field;
}
function dashboardPokemonCard(p){
  const st=stateFor(p);
  return `<button type="button" class="dashboard-mon" data-dashboard-pokemon="${p.id}" style="${typeVars(p.type)}"><div><img src="${p.image}" alt="${escapeHtml(p.name)}"></div><strong>${escapeHtml(p.name)}</strong><small>Lvl ${st.level}</small></button>`;
}
function renderGoalEditList(){
  const wrap=$("#goalEditList"); if(!wrap) return;
  const active=new Set(app.profile.activeGoals||[]);
  const q=($("#goalSearch")?.value||"").trim().toLocaleLowerCase("de");
  const list=(app.goals||[]).filter(g=>!q || `${g.label} ${g.type}`.toLocaleLowerCase("de").includes(q));
  $("#goalSelectionCount").textContent=`${active.size} / 3 aktiv`;
  const groups=[...new Set(list.map(g=>g.type))];
  wrap.innerHTML=groups.map(type=>{
    const items=list.filter(g=>g.type===type);
    return `<section class="goal-edit-group" style="${typeVars(type)}"><h3><i></i>${escapeHtml(type)}</h3>${items.map(g=>{
      const pr=goalProgress(g), on=active.has(g.id);
      return `<button class="goal-edit-row ${on?"active":""} ${pr.done?"done":""}" data-goal-id="${escapeHtml(g.id)}" type="button"><span class="goal-check">${on?"✓":""}</span><span class="goal-edit-copy"><strong>${escapeHtml(g.label)}</strong><small>${pr.count}/${pr.target} gefangen${pr.done?" · bereits erfüllt":""}</small></span><em>${pr.done?"Erfüllt":`${pr.pct}%`}</em></button>`;
    }).join("")}</section>`;
  }).join("") || `<div class="dashboard-empty">Keine Ziele gefunden.</div>`;
}
function openGoalEditor(){
  if(!app.isAdmin||!app.editMode){ toast("Bearbeitungsmodus erforderlich"); return; }
  $("#goalSearch").value=""; renderGoalEditList(); openSheet("#goalEditSheet");
}
function toggleGoal(id){
  if(!app.isAdmin||!app.editMode) return;
  const current=[...(app.profile.activeGoals||[])]; const ix=current.indexOf(id);
  if(ix>=0) current.splice(ix,1);
  else { if(current.length>=3){ toast("Maximal drei Ziele pro Spieler"); return; } current.push(id); }
  app.profile.activeGoals=current; cacheProfile(); app.dirty=true; renderDashboard(); renderGoalEditList(); scheduleSave();
}

function updateTrainerLevel(value){
  if(!app.isAdmin||!app.editMode){ toast("Bearbeitungsmodus erforderlich"); return; }
  app.profile.trainerLevel=Math.max(0,Math.min(13,Math.round(+value||0)));
  cacheProfile(); app.dirty=true; renderDashboard(); scheduleSave();
}
function openDashboardLocation(){
  const trainer=currentTrainerEntry(); const field=trainer?mapFieldById(trainer.fieldId):null;
  if(!field){ toast("Keine Trainerposition hinterlegt"); return; }
  app.mapSymbolLayers.add("Trainer"); app.mapSelectedField=field; showModule("map"); openMapField(field);
}

function goalProgressForState(goal,state){
  const count=goal ? app.pokemon.filter(p=>p.type===goal.type && state?.[p.name]?.owned).length : 0;
  const target=Math.max(1,+goal?.target||1);
  return {count,target,done:count>=target,pct:Math.min(100,Math.round(count/target*100))};
}
function directorRecords(){
  return (app.adminPlayerData||[]).map(rec=>{
    const current=app.player?.id===rec.id;
    const state=current?app.state:rec.state;
    const profile=current?app.profile:rec.profile;
    return {...rec,state,profile};
  });
}
function directorSummary(rec){
  const owned=app.pokemon.filter(p=>rec.state?.[p.name]?.owned);
  const favorites=owned.filter(p=>rec.state?.[p.name]?.favorite);
  const active=(rec.profile?.activeGoals||[]).map(goalById).filter(Boolean);
  const completed=active.filter(g=>goalProgressForState(g,rec.state).done).length;
  const trainer=trainerEntryForName(rec.name), field=trainer?mapFieldById(trainer.fieldId):null;
  const top=[...owned].sort((a,b)=>{
    const sa=rec.state[a.name]||{}, sb=rec.state[b.name]||{};
    return (+sb.level||0)-(+sa.level||0) || (+sb.ep||0)-(+sa.ep||0) || a.id-b.id;
  }).slice(0,3);
  const pct=app.pokemon.length?Math.round(owned.length/app.pokemon.length*100):0;
  return {owned:owned.length,favorites:favorites.length,activeGoals:active,completed,trainer,field,top,pct,trainerLevel:rec.profile?.trainerLevel||0};
}
function renderDirector(){
  if(!app.isAdmin) return;
  const all=directorRecords();
  const summaries=new Map(all.map(r=>[r.id,directorSummary(r)]));
  const totalOwned=all.reduce((n,r)=>n+summaries.get(r.id).owned,0);
  const totalGoals=all.reduce((n,r)=>n+summaries.get(r.id).completed,0);
  const located=all.filter(r=>summaries.get(r.id).field).length;
  const avgDex=all.length&&app.pokemon.length?Math.round(totalOwned/(all.length*app.pokemon.length)*100):0;
  $("#directorPlayerCount").textContent=all.length;
  $("#directorDexAverage").textContent=`${avgDex} %`;
  $("#directorGoalCount").textContent=totalGoals;
  $("#directorLocationCount").textContent=located;

  const missingGoals=all.filter(r=>(r.profile?.activeGoals||[]).length<3).length;
  const missingLocation=all.length-located;
  const attention=$("#directorAttention");
  const notices=[];
  if(missingGoals) notices.push(`<span>◎ ${missingGoals} ${missingGoals===1?"Spieler hat":"Spieler haben"} weniger als 3 aktive Ziele</span>`);
  if(missingLocation) notices.push(`<span>⌖ ${missingLocation} ${missingLocation===1?"Spieler ohne":"Spieler ohne"} Kartenposition</span>`);
  attention.classList.toggle("hidden",!notices.length);
  attention.innerHTML=notices.length?`<strong>Hinweise</strong><div>${notices.join("")}</div>`:"";

  const q=(app.directorSearch||"").trim().toLocaleLowerCase("de");
  let list=all.filter(r=>!q||r.name.toLocaleLowerCase("de").includes(q)||String(summaries.get(r.id).field?.name||"").toLocaleLowerCase("de").includes(q));
  list.sort((a,b)=>{
    const A=summaries.get(a.id), B=summaries.get(b.id);
    if(app.directorSort==="dex") return B.pct-A.pct || a.name.localeCompare(b.name,"de");
    if(app.directorSort==="trainer") return B.trainerLevel-A.trainerLevel || a.name.localeCompare(b.name,"de");
    if(app.directorSort==="goals") return B.completed-A.completed || a.name.localeCompare(b.name,"de");
    return a.name.localeCompare(b.name,"de");
  });
  $("#directorHeading").textContent=q?"Suchergebnisse":"Alle Trainer";
  $("#directorResultCount").textContent=`${list.length} ${list.length===1?"Spieler":"Spieler"}`;
  $("#directorEmpty").classList.toggle("hidden",list.length!==0);
  $("#directorGrid").innerHTML=list.map(rec=>{
    const m=summaries.get(rec.id);
    const goals=m.activeGoals.length?m.activeGoals.map(g=>{const pr=goalProgressForState(g,rec.state);return `<span class="director-goal-chip ${pr.done?"done":""}" style="${typeVars(g.type)}">${pr.done?"✓":"○"} ${escapeHtml(g.type)} ${pr.count}/${pr.target}</span>`;}).join(""):`<span class="director-goal-chip empty">Keine Ziele aktiv</span>`;
    const top=m.top.length?m.top.map(p=>`<span class="director-top-mon" title="${escapeHtml(p.name)}"><img src="${p.image}" alt="${escapeHtml(p.name)}"><b>${rec.state[p.name]?.level||p.minLevel}</b></span>`).join(""):`<span class="director-top-empty">Noch keine Pokémon gefangen</span>`;
    return `<article class="director-player-card ${app.player?.id===rec.id?"current":""}" data-director-player="${rec.id}">
      <header><span class="director-avatar">${initials(rec.name)}</span><div><strong>${escapeHtml(rec.name)}</strong><small>${m.field?`${escapeHtml(m.field.name||m.field.id)} · ${escapeHtml(m.field.id)}`:"Standort nicht gesetzt"}</small></div><em>TS ${m.trainerLevel}</em></header>
      <div class="director-progress-line"><span><b>${m.owned}</b> / ${app.pokemon.length} gefangen</span><strong>${m.pct} %</strong></div>
      <div class="director-progress-track"><span style="width:${m.pct}%"></span></div>
      <div class="director-mini-stats"><span><b>${m.favorites}</b><small>Favoriten</small></span><span><b>${m.completed}/${m.activeGoals.length}</b><small>Ziele</small></span><span><b>${m.top[0]?rec.state[m.top[0].name]?.level||m.top[0].minLevel:"—"}</b><small>Top-Level</small></span></div>
      <div class="director-goals">${goals}</div>
      <div class="director-top">${top}</div>
      <footer><button class="secondary-btn" data-director-map="${rec.id}" type="button" ${m.field?"":"disabled"}>⌖ Karte</button><button class="primary-btn" data-director-open="${rec.id}" type="button">Dashboard öffnen</button></footer>
    </article>`;
  }).join("");
  $$("#directorGrid img").forEach(setImgFallback);
}
async function openDirectorPlayer(id,toMap=false){
  const ok=await selectPlayer(id,false);
  if(!ok) return;
  if(toMap){ const trainer=currentTrainerEntry(), field=trainer?mapFieldById(trainer.fieldId):null; if(field){ app.mapSymbolLayers.add("Trainer"); app.mapSelectedField=field; showModule("map"); openMapField(field); } else toast("Keine Trainerposition hinterlegt"); }
  else showModule("dashboard");
}

function renderStats(){ const vals=app.pokemon.map(p=>stateFor(p)); $("#ownedCount").textContent=vals.filter(s=>s.owned).length; $("#favoriteCount").textContent=vals.filter(s=>s.favorite).length; $("#totalCount").textContent=app.pokemon.length; }
function renderGrid(){
  const list=filteredPokemon();
  $("#resultCount").textContent=`${list.length} ${list.length===1?"Eintrag":"Einträge"}`;
  $("#resultLabel").textContent=app.filter==="owned"?"Gefangen":app.filter==="favorite"?"Favoriten":"Alle Monster";
  $("#emptyState").classList.toggle("hidden",list.length!==0);
  $("#dexGrid").innerHTML=list.map(p=>{ const s=stateFor(p); const learned=attacksFor(p).filter(a=>a.level<=s.level).length; return `<button class="dex-card ${s.owned?"":"not-owned"}" data-id="${p.id}" style="${typeVars(p.type)}"><div class="card-art"><span class="card-fav">${s.favorite?"★":"☆"}</span><img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy"></div><div class="card-copy"><small>#${pad(p.id)}</small><strong>${escapeHtml(p.name)}</strong><div class="card-meta"><span class="card-type"><i class="type-dot"></i>${escapeHtml(p.type)}</span><span class="level-pill">Lvl ${s.level}</span></div>${learned?`<div class="card-attacks">⚔ ${learned} Attacken</div>`:""}</div></button>`; }).join("");
  $$("#dexGrid img").forEach(setImgFallback);
}
function renderPlayerList(){
  const wrap=$("#playerList");
  if(!app.isAdmin){ wrap.innerHTML=`<div class="notice notice-muted"><strong>Nur für Spielleiter</strong><p>Die Spielerliste ist geschützt und wird erst nach der Admin-Anmeldung geladen.</p></div>`; return; }
  wrap.innerHTML=app.players.map(p=>`<button class="player-option ${app.player?.id===p.id?"active":""}" data-player="${p.id}"><span class="player-avatar">${initials(p.name)}</span><span><strong>${escapeHtml(p.name)}</strong><small>${app.player?.id===p.id?"Aktuell ausgewählt":"Dex öffnen"}</small></span></button>`).join("")||`<div class="notice"><strong>Noch keine Spieler</strong><p>Importiere zuerst deine JSON-Spielstände über <code>admin-import.html</code>.</p></div>`;
}

function openDetail(id){ app.view="dex"; app.selectedId=Number(id); app.activeTab="info"; $("#directorView").classList.add("hidden"); $("#dashboardView").classList.add("hidden"); $("#mainView").classList.add("hidden"); $("#mapView").classList.add("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#battleView").classList.add("hidden"); $("#libraryView").classList.add("hidden"); $("#detailView").classList.remove("hidden"); window.scrollTo({top:0,behavior:"instant"}); renderDetail(); }
function closeDetail(){ app.selectedId=null; $("#detailView").classList.add("hidden"); $("#mainView").classList.remove("hidden"); app.view="dex"; renderGrid(); }
function selectedPokemon(){ return app.pokemon.find(p=>p.id===app.selectedId); }

function renderDetail(){
  const p=selectedPokemon(); if(!p) return; const s=stateFor(p);
  $("#detailHero").style=typeVars(p.type); $("#detailNumber").textContent=`#${pad(p.id)}`; $("#detailName").textContent=p.name;
  $("#detailType").innerHTML=`<span class="type-badge" style="${typeVars(p.type)}"><span>●</span>${escapeHtml(p.type)}</span>`;
  const img=$("#detailImage"); img.src=p.image; img.alt=p.name; img.classList.toggle("not-owned",!s.owned); setImgFallback(img);
  $("#detailFavoriteBtn").textContent=s.favorite?"★":"☆"; $("#detailFavoriteBtn").classList.toggle("active",s.favorite);
  $("#infoStatus").textContent=s.owned?"Gefangen":"Nicht gefangen"; $("#infoType").textContent=p.type; $("#infoRange").textContent=`${p.minLevel}–${p.maxLevel}`;
  $("#currentLevel").textContent=s.level; $("#currentEP").textContent=s.level>=p.maxLevel?`${s.ep} / 10 · Max`:`${s.ep} / 10`; $("#epBar").style.width=`${s.ep*10}%`;
  $("#valueMin").textContent=p.minLevel; $("#valueMax").textContent=p.maxLevel; $("#valueCurrent").textContent=s.level;
  renderCharacterValues(p,s);

  const moves=attacksFor(p); const unlocked=moves.filter(m=>m.level<=s.level); const next=moves.find(m=>m.level>s.level);
  $("#infoAttackCount").textContent=moves.length?`${unlocked.length} / ${moves.length}`:"—";
  $("#infoNextAttack").textContent=next?`Lv ${next.level}: ${next.name}`:(moves.length?"Alle freigeschaltet":"—");

  $("#editPanel").classList.toggle("hidden",!(app.isAdmin&&app.editMode));
  $("#ownedToggle").checked=s.owned; $("#favoriteToggle").checked=s.favorite; $("#levelSlider").min=p.minLevel; $("#levelSlider").max=p.maxLevel; $("#levelSlider").value=s.level; $("#levelValue").textContent=s.level; $("#levelHelp").textContent=`Erlaubt: ${p.minLevel} bis ${p.maxLevel}`;

  renderAttackTab(p,s);
  renderEvolutionTab(p);

  $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===app.activeTab)); $$(".tab-panel").forEach(x=>x.classList.add("hidden")); $(`#tab-${app.activeTab}`).classList.remove("hidden");
}

function renderCharacterValues(p,s){
  const c=pokemonCharacterCard(p);
  const grid=$("#typeModifierGrid");
  if(!c){
    $("#valueMaxHp").textContent="—"; $("#valueHpFormula").textContent="Keine Kartendaten";
    $("#valueBaseHp").textContent="—"; $("#valueMovement").textContent="—"; $("#valueCombatRange").textContent="—"; $("#valueCombatRangeHelp").textContent="—";
    if(grid) grid.innerHTML=`<div class="notice notice-muted"><p>Für dieses Pokémon fehlen strukturierte Charakterkartendaten.</p></div>`;
    return;
  }
  const maxHp=(+c.baseHp||0)+(+s.level||0);
  $("#valueMaxHp").textContent=maxHp;
  $("#valueHpFormula").textContent=`${c.baseHp} + Level ${s.level}`;
  $("#valueBaseHp").textContent=c.baseHp;
  $("#valueMovement").textContent=c.movement;
  $("#valueCombatRange").textContent=c.range==="ranged"?"Fernkampf":"Nahkampf";
  $("#valueCombatRangeHelp").textContent=c.range==="ranged"?"Bogen-Symbol":"Faust-Symbol";
  const entries=Object.entries(c.typeModifiers||{}).sort((a,b)=>a[0].localeCompare(b[0],"de"));
  if(!grid) return;
  grid.innerHTML=entries.length?entries.map(([type,value])=>{
    const immune=value==="immune";
    const numeric=immune?null:+value;
    const cls=immune?"immune":numeric>0?"positive":"negative";
    const label=immune?"Immun":`${numeric>0?"+":""}${numeric}`;
    const note=immune?"keine Wirkung":numeric>0?`Kartenwert +${numeric}`:`Kartenwert ${numeric}`;
    return `<article class="type-modifier ${cls}" style="${typeVars(type)}"><span class="modifier-type"><i></i>${escapeHtml(type)}</span><strong>${label}</strong><small>${note}</small></article>`;
  }).join(""):`<div class="notice notice-muted"><p>Keine Typenmodifikatoren auf der Charakterkarte.</p></div>`;
}

function renderAttackTab(p,s){
  const moves=attacksFor(p);
  const unlocked=moves.filter(m=>m.level<=s.level);
  const future=moves.filter(m=>m.level>s.level);
  const nextLevel=future.length?Math.min(...future.map(m=>m.level)):null;
  $("#attackUnlocked").textContent=moves.length?unlocked.length:"—";
  $("#attackTotal").textContent=moves.length?moves.length:"—";
  $("#attackNextLevel").textContent=nextLevel?`Lvl ${nextLevel}`:(moves.length?"Komplett":"—");
  const list=$("#attackList");
  if(!moves.length){
    list.innerHTML=`<div class="notice notice-muted"><strong>Keine Attackendaten gefunden</strong><p>Für ${escapeHtml(p.name)} ist in der eingebauten Karten-Datendatei keine Zuordnung vorhanden.</p></div>`;
    return;
  }
  let lastLevel=null;
  const html=[];
  for(const m of moves){
    if(m.level!==lastLevel){
      html.push(`<div class="attack-level-separator"><span>Level ${m.level}</span><i></i></div>`);
      lastLevel=m.level;
    }
    const ready=m.level<=s.level;
    const card=attackCard(m.name); const setText=card?.detailsAvailable!==false&&card?.setSize?` · Satz x${card.setSize}`:"";
    html.push(`<button type="button" data-card-open="${escapeHtml(m.name)}" class="attack-item attack-item-button ${ready?"unlocked":"locked"}"><span class="attack-level">${m.level}</span><div class="attack-name"><strong>${escapeHtml(m.name)}</strong><small>${ready?"Für dieses Level verfügbar":`Freischaltung ab Level ${m.level}`}${setText}</small></div><span class="attack-state" aria-label="${ready?"verfügbar":"gesperrt"}">${ready?"✓":"○"}</span></button>`);
  }
  list.innerHTML=html.join("");
}


function buildLibraryTypeStrip(){
  const source=app.librarySection==="pokemon"
    ? app.pokemon.map(p=>p.type)
    : app.attackCards.filter(c=>c.detailsAvailable!==false).map(c=>c.type);
  const types=["Alle",...new Set(source.filter(Boolean))];
  const el=$("#libraryTypeStrip"); if(!el) return;
  if(app.libraryType!=="Alle"&&!types.includes(app.libraryType)) app.libraryType="Alle";
  el.innerHTML=types.map(t=>`<button type="button" class="library-type-chip ${t===app.libraryType?"active":""}" data-library-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("");
}
function filteredAttackCards(){
  const q=app.librarySearch.trim().toLowerCase();
  return app.attackCards.filter(c=>{
    if(app.libraryKind!=="all"&&c.cardType!==app.libraryKind) return false;
    if(app.libraryType!=="Alle"&&c.type!==app.libraryType) return false;
    if(!q) return true;
    const effect=(c.effects||[]).map(e=>e.text).join(" ");
    return `${c.name} ${c.type||""} ${CARD_KIND_LABELS[c.cardType]||""} ${effect}`.toLowerCase().includes(q);
  });
}
function filteredPokemonCharacterCards(){
  const q=app.librarySearch.trim().toLowerCase();
  return app.pokemon.filter(p=>{
    const c=pokemonCharacterCard(p); if(!c) return false;
    if(app.libraryType!=="Alle"&&p.type!==app.libraryType) return false;
    if(!q) return true;
    const range=c.range==="ranged"?"fernkampf bogen":"nahkampf faust";
    const modTypes=Object.keys(c.typeModifiers||{}).join(" ");
    return `${p.name} ${p.type} ${range} bewegung ${c.movement} kp ${c.baseHp} ${modTypes}`.toLowerCase().includes(q);
  });
}
function renderLibrary(){
  const pokemonMode=app.librarySection==="pokemon";
  $$("#librarySectionSwitch [data-library-section]").forEach(b=>b.classList.toggle("active",b.dataset.librarySection===app.librarySection));
  $("#libraryKindFilter").classList.toggle("hidden",pokemonMode);
  $("#librarySearch").placeholder=pokemonMode?"Pokémon, Typ oder Wert suchen…":"Attacke oder Effekt suchen…";
  buildLibraryTypeStrip();
  $$("#libraryTypeStrip [data-library-type]").forEach(b=>b.classList.toggle("active",b.dataset.libraryType===app.libraryType));

  if(pokemonMode){
    $("#libraryEyebrow").textContent="Pokémon-Karten";
    const list=filteredPokemonCharacterCards();
    $("#libraryCardCount").textContent=app.pokemonCards.length;
    $("#librarySetCount").textContent=app.pokemonCards.filter(c=>c.range==="ranged").length;
    $("#libraryResultCount").textContent=list.length;
    $("#libraryStat1Icon").textContent="◉"; $("#libraryStat1Label").textContent="Charakterkarten";
    $("#libraryStat2Icon").textContent="↗"; $("#libraryStat2Label").textContent="Fernkämpfer";
    $("#libraryStat3Icon").textContent="⌁"; $("#libraryStat3Label").textContent="Treffer";
    $("#libraryHeading").textContent=app.libraryType!=="Alle"?`${app.libraryType}-Pokémon`:"Alle Pokémon-Karten";
    $("#libraryEmpty").classList.toggle("hidden",list.length!==0);
    $("#libraryGrid").innerHTML=list.map(p=>{
      const c=pokemonCharacterCard(p); const s=stateFor(p); const maxHp=(+c.baseHp||0)+(+s.level||0);
      const immune=Object.values(c.typeModifiers||{}).filter(v=>v==="immune").length;
      return `<button class="library-card pokemon-library-card" data-card-pokemon="${p.id}" type="button" style="${typeVars(p.type)}"><div class="pokemon-library-top"><img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy"><div><small>#${pad(p.id)} · ${escapeHtml(p.type)}</small><h3>${escapeHtml(p.name)}</h3><span>${c.range==="ranged"?"Fernkampf":"Nahkampf"} · Bewegung ${c.movement}</span></div></div><div class="library-card-values pokemon-values"><span><small>KP-Basis</small><b>${c.baseHp}</b></span><span><small>Max. KP</small><b>${maxHp}</b></span><span><small>Immun</small><b>${immune}</b></span></div><p>Max. KP auf aktuellem Level ${s.level}: <strong>${c.baseHp} + ${s.level} = ${maxHp}</strong></p></button>`;
    }).join("");
    $$("#libraryGrid img").forEach(setImgFallback);
    return;
  }

  $("#libraryEyebrow").textContent="Attackenkarten";
  const list=filteredAttackCards();
  const detailed=app.attackCards.filter(c=>c.detailsAvailable!==false);
  $("#libraryCardCount").textContent=detailed.length;
  $("#librarySetCount").textContent=detailed.reduce((sum,c)=>sum+(+c.setSize||0),0);
  $("#libraryResultCount").textContent=list.length;
  $("#libraryStat1Icon").textContent="⚔"; $("#libraryStat1Label").textContent="Attacken";
  $("#libraryStat2Icon").textContent="▦"; $("#libraryStat2Label").textContent="Karten im Vorrat";
  $("#libraryStat3Icon").textContent="⌁"; $("#libraryStat3Label").textContent="Treffer";
  $("#libraryHeading").textContent=app.libraryType!=="Alle"?app.libraryType:(app.libraryKind!=="all"?CARD_KIND_LABELS[app.libraryKind]:"Alle Karten");
  $("#libraryEmpty").classList.toggle("hidden",list.length!==0);
  $$("#libraryKindFilter [data-card-kind]").forEach(b=>b.classList.toggle("active",b.dataset.cardKind===app.libraryKind));
  $("#libraryGrid").innerHTML=list.map(c=>{
    if(c.detailsAvailable===false) return `<button class="library-card missing" data-card-open="${escapeHtml(c.name)}" type="button"><div class="library-card-top"><span class="library-kind neutral">?</span><span class="library-type">${escapeHtml(c.type||"—")}</span></div><h3>${escapeHtml(c.name)}</h3><p>Für diese Attacke wurde in den bereitgestellten Attackenkarten keine passende Karte gefunden.</p></button>`;
    const effects=(c.effects||[]).map(e=>e.text).join(" ");
    return `<button class="library-card" data-card-open="${escapeHtml(c.name)}" type="button" style="${cardTypeVars(c.type)}"><div class="library-card-top"><span class="library-kind kind-${c.cardType}">${CARD_KIND_ICONS[c.cardType]||"•"} ${CARD_KIND_LABELS[c.cardType]||c.cardType}</span><span class="library-type">${escapeHtml(c.type)}</span></div><h3>${escapeHtml(c.name)}</h3><div class="library-card-values">${c.cardType!=="scheme"?`<span><small>Wert</small><b>${c.value}</b></span>`:""}<span><small>BOOST</small><b>${c.boost}</b></span><span><small>Kartensatz</small><b>x${c.setSize}</b></span></div>${effects?`<p>${escapeHtml(effects)}</p>`:'<p class="muted">Keine zusätzlichen Karteneffekte.</p>'}</button>`;
  }).join("");
}
function resetLibraryFilters(){
  app.librarySearch=""; app.libraryKind="all"; app.libraryType="Alle";
  $("#librarySearch").value=""; buildLibraryTypeStrip(); renderLibrary();
}
function renderCardDetail(name){
  const c=attackCard(name); if(!c) return;
  app.selectedCardName=name;
  $("#cardDetailName").textContent=c.name;
  $("#cardDetailEyebrow").textContent=c.detailsAvailable===false?"Attacke · Datensatz fehlt":`${c.type} · ${CARD_KIND_LABELS[c.cardType]||"Karte"}`;
  const learners=cardLearners(name);
  if(c.detailsAvailable===false){
    $("#cardDetailBody").innerHTML=`<div class="notice notice-muted"><strong>Keine Karteninformationen im PDF-Bestand</strong><p>${escapeHtml(c.note||"Für diese Attacke wurde keine passende Karte in den bereitgestellten Attacken-PDFs gefunden.")}</p></div>${renderLearnersHtml(learners)}`;
    return;
  }
  const effects=(c.effects||[]).length?(c.effects||[]).map(e=>`<article class="card-effect"><small>${TIMING_LABELS[e.timing]||e.timing}</small><p>${escapeHtml(e.text)}</p></article>`).join(""):`<article class="card-effect empty"><small>EFFEKT</small><p>Keine zusätzlichen Karteneffekte.</p></article>`;
  $("#cardDetailBody").innerHTML=`<section class="card-facts" style="${cardTypeVars(c.type)}"><div class="card-kind-hero kind-${c.cardType}"><span>${CARD_KIND_ICONS[c.cardType]||"•"}</span><strong>${CARD_KIND_LABELS[c.cardType]||c.cardType}</strong></div><div class="card-fact-grid">${c.cardType!=="scheme"?`<article><small>Wert</small><strong>${c.value}</strong></article>`:""}<article><small>BOOST</small><strong>${c.boost}</strong></article><article><small>Kartensatz</small><strong>x${c.setSize}</strong></article></div><p class="set-explain">Ein Pokémon mit dieser Attacke benötigt den vollständigen Satz aus <strong>${c.setSize} ${c.setSize===1?"Karte":"Karten"}</strong>.</p></section><section class="card-effect-list">${effects}</section>${renderLearnersHtml(learners)}`;
}
function renderLearnersHtml(learners){
  if(!learners.length) return `<section class="card-learners"><div class="card-section-head"><p class="eyebrow">Zuordnung</p><h3>Lernbar von</h3></div><div class="notice notice-muted"><p>In Karten.xlsx ist diese Attacke keinem Pokémon zugeordnet.</p></div></section>`;
  return `<section class="card-learners"><div class="card-section-head"><p class="eyebrow">Karten.xlsx</p><h3>Lernbar von <span>${learners.length}</span></h3></div><div class="card-learner-list">${learners.map(({pokemon,level})=>`<button type="button" data-card-pokemon="${pokemon.id}" style="${typeVars(pokemon.type)}"><img src="${pokemon.image}" alt="" loading="lazy"><span><strong>${escapeHtml(pokemon.name)}</strong><small>#${pad(pokemon.id)} · ab Level ${level}</small></span><b>Lv ${level}</b></button>`).join("")}</div></section>`;
}
function openCardDetail(name){
  const c=attackCard(name); if(!c){ toast("Für diese Attacke fehlen Kartendetails"); return; }
  renderCardDetail(name); openSheet("#cardDetailSheet");
  $$("#cardDetailBody img").forEach(setImgFallback);
}

function evolutionCard(member){
  const p=app.pokemon.find(x=>x.id===member.id) || member;
  const s=stateFor(p); const current=p.id===app.selectedId;
  return `<button class="evo-card ${current?"current":""} ${s.owned?"owned":"not-owned"}" data-evo-id="${p.id}" style="${typeVars(p.type)}"><div class="evo-art"><img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy"></div><div class="evo-copy"><small>#${pad(p.id)} · Level ${p.minLevel}–${p.maxLevel}</small><strong>${escapeHtml(p.name)}</strong><span>${s.owned?`Gefangen · Lv ${s.level}`:"Nicht gefangen"}</span></div>${current?'<b class="evo-current">Aktuell</b>':''}</button>`;
}
function evoArrow(nextMember){ return `<div class="evo-arrow"><span>→</span><small>ab Lv ${nextMember.minLevel}</small></div>`; }
function renderEvolutionTab(p){
  const target=$("#evolutionContent");
  const group=evolutionGroupFor(p.id);
  if(!group){ target.innerHTML=`<div class="notice notice-muted"><strong>Keine Entwicklungsdaten</strong><p>Für diesen Eintrag ist keine Entwicklungsreihe hinterlegt.</p></div>`; return; }
  const members=(group.members||[]).map(m=>app.pokemon.find(x=>x.id===m.id)||m);
  if(group.kind==="single"){
    target.innerHTML=`<div class="evolution-single">${evolutionCard(members[0])}<div class="evo-none"><strong>Keine weitere Entwicklung</strong><p>Dieses Pokémon hat innerhalb der ersten Generation keine weitere Entwicklungsstufe.</p></div></div>`;
  } else if(group.kind==="branch"){
    const root=members.find(m=>m.id===group.root) || members[0];
    const branches=(group.branches||[]).map(id=>members.find(m=>m.id===id)).filter(Boolean);
    target.innerHTML=`<div class="evolution-branch"><div class="branch-root">${evolutionCard(root)}</div><div class="branch-marker"><span>↓</span><small>ab Lv ${branches[0]?.minLevel ?? "—"}</small></div><div class="branch-grid">${branches.map(evolutionCard).join("")}</div></div>`;
  } else {
    target.innerHTML=`<div class="evolution-flow">${members.map((m,i)=>`${i?evoArrow(m):""}${evolutionCard(m)}`).join("")}</div>`;
  }
  $$("#evolutionContent img").forEach(setImgFallback);
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
  try { await setDoc(doc(db,"players",app.player.id),{name:app.player.name,version:1,pokemon:app.state,profile:app.profile,updatedAt:serverTimestamp()},{merge:true}); app.publishedState=clone(app.state); app.publishedProfile=clone(app.profile); const rec=app.adminPlayerData.find(r=>r.id===app.player.id); if(rec){rec.state=clone(app.state);rec.profile=clone(app.profile);rec.name=app.player.name;} app.dirty=false; setSyncLabel("Gespeichert ✓"); }
  catch(err){ console.error(err); setSyncLabel("Speichern fehlgeschlagen"); toast("Firebase-Speichern fehlgeschlagen"); }
  finally { app.saving=false; }
}
function setSyncLabel(t){ const el=$("#syncStatus"); if(el) el.textContent=t; }

function updateAuthUI(){
  $("#adminControls").classList.toggle("hidden",!app.isAdmin);
  $("#directorBtn").classList.toggle("hidden",!app.isAdmin);
  $("#loginBox").classList.toggle("hidden",!!app.user);
  $("#loggedInBox").classList.toggle("hidden",!app.user);
  $("#loggedInText").textContent=app.user?(app.isAdmin?`Admin angemeldet: ${app.user.email||""}`:"Angemeldet, aber kein Admin"):"";
  $("#playerBtn").classList.toggle("admin-only-list",!app.isAdmin);
  if(!app.isAdmin){ app.editMode=false; app.mapTrainerMoveId=null; }
  renderMapTrainerEditUi();
}
async function doLogin(){
  const email=$("#adminEmail").value.trim(), password=$("#adminPassword").value;
  if(!email||!password){ toast("E-Mail und Passwort eingeben"); return; }
  try { await signInWithEmailAndPassword(auth,email,password); $("#adminPassword").value=""; closeSheets(); toast("Admin angemeldet"); }
  catch(err){ console.error(err); toast("Anmeldung fehlgeschlagen"); }
}
async function doLogout(){ await saveToFirebase(); await signOut(auth); app.players=[]; app.adminPlayerData=[]; app.editMode=false; if(app.view==="director") app.view="dashboard"; closeSheets(); toast("Abgemeldet"); }

function openSheet(id){ $("#sheetBackdrop").classList.remove("hidden"); $(id).classList.remove("hidden"); }
function closeSheets(){ $("#sheetBackdrop").classList.add("hidden"); $$(".bottom-sheet").forEach(s=>s.classList.add("hidden")); }
function resetFilters(){ app.filter="all"; app.type="Alle"; app.search=""; $("#searchInput").value=""; $$(".segment").forEach(b=>b.classList.toggle("active",b.dataset.filter==="all")); $$(".type-chip").forEach(b=>b.classList.toggle("active",b.dataset.type==="Alle")); renderGrid(); }
function exportState(){ if(!app.player)return; const blob=new Blob([JSON.stringify(app.state,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${app.player.name}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
async function sharePlayer(){ if(!app.player)return; const url=new URL(location.href); url.searchParams.set("player",app.player.id); try{await navigator.clipboard.writeText(url.toString());toast("Spieler-Link kopiert");}catch{prompt("Link kopieren:",url.toString());} }

function isStandalone(){
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true;
}
function updateInstallUi(){
  const btn=$("#installAppBtn"), status=$("#installAppStatus");
  if(!btn||!status) return;
  if(isStandalone()){
    btn.disabled=true;
    status.textContent="App läuft bereits im installierten Modus.";
  } else if(deferredInstallPrompt){
    btn.disabled=false;
    status.textContent="Bereit – hier tippen, um PU zu installieren.";
  } else {
    btn.disabled=false;
    status.textContent="Falls kein Dialog erscheint: Seite einmal neu laden und erneut tippen.";
  }
}
function setupPwaInstall(){
  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    deferredInstallPrompt=e;
    updateInstallUi();
  });
  window.addEventListener("appinstalled",()=>{
    deferredInstallPrompt=null;
    updateInstallUi();
    toast("PU wurde installiert");
  });
  updateInstallUi();
}
async function installPwa(){
  if(isStandalone()){ toast("Die App läuft bereits installiert"); return; }
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice.catch(()=>null);
    deferredInstallPrompt=null;
    updateInstallUi();
    if(choice?.outcome!=="accepted") toast("Installation nicht abgeschlossen");
    return;
  }
  toast("Chrome-Menü öffnen → App installieren. Falls Chrome weiterhin eine alte Installation meldet, Seite neu laden.");
}

function bindEvents(){
  $("#searchInput").addEventListener("input",e=>{app.search=e.target.value;renderGrid();});
  $$('[data-filter]').forEach(b=>b.addEventListener("click",()=>{app.filter=b.dataset.filter; $$('[data-filter]').forEach(x=>x.classList.toggle("active",x===b));renderGrid();}));
  $("#typeStrip").addEventListener("click",e=>{const b=e.target.closest("[data-type]");if(!b)return;app.type=b.dataset.type;$$(".type-chip").forEach(x=>x.classList.toggle("active",x===b));renderGrid();});
  $("#clearFiltersBtn").addEventListener("click",resetFilters); $("#dexGrid").addEventListener("click",e=>{const c=e.target.closest(".dex-card");if(c)openDetail(c.dataset.id);});
  $("#backBtn").addEventListener("click",closeDetail); $("#homeBtn").addEventListener("click",()=>{if(app.selectedId)showModule("dashboard");else if(app.player&&app.view!=="dashboard")showModule("dashboard");});
  $("#prevBtn").addEventListener("click",()=>{app.selectedId=app.selectedId<=1?app.pokemon.length:app.selectedId-1;renderDetail();}); $("#nextBtn").addEventListener("click",()=>{app.selectedId=app.selectedId>=app.pokemon.length?1:app.selectedId+1;renderDetail();});
  $("#detailFavoriteBtn").addEventListener("click",()=>mutateSelected(s=>s.favorite=!s.favorite)); $$(".tab").forEach(b=>b.addEventListener("click",()=>{app.activeTab=b.dataset.tab;renderDetail();}));
  $("#ownedToggle").addEventListener("change",e=>mutateSelected(s=>s.owned=e.target.checked)); $("#favoriteToggle").addEventListener("change",e=>mutateSelected(s=>s.favorite=e.target.checked)); $("#levelSlider").addEventListener("input",e=>mutateSelected(s=>s.level=+e.target.value)); $$(".stepper [data-ep]").forEach(b=>b.addEventListener("click",()=>changeEP(+b.dataset.ep)));
  $("#evolutionContent").addEventListener("click",e=>{const b=e.target.closest("[data-evo-id]"); if(!b)return; app.selectedId=+b.dataset.evoId; app.activeTab="entwicklung"; window.scrollTo({top:0,behavior:"smooth"}); renderDetail();});
  $("#dashboardTrainerLevelSlider").addEventListener("input",e=>updateTrainerLevel(e.target.value));
  $("#dashboardManageGoalsBtn").addEventListener("click",openGoalEditor);
  $("#goalSearch").addEventListener("input",renderGoalEditList);
  $("#goalEditList").addEventListener("click",e=>{const b=e.target.closest("[data-goal-id]");if(b)toggleGoal(b.dataset.goalId);});
  $("#dashboardFavoriteRow").addEventListener("click",e=>{const b=e.target.closest("[data-dashboard-pokemon]");if(b)openDetail(+b.dataset.dashboardPokemon);});
  $("#dashboardStrongList").addEventListener("click",e=>{const b=e.target.closest("[data-dashboard-pokemon]");if(b)openDetail(+b.dataset.dashboardPokemon);});
  $("#dashboardAllFavoritesBtn").addEventListener("click",()=>{app.filter="favorite";app.type="Alle";app.search="";$("#searchInput").value="";showModule("dex");$$("[data-filter]").forEach(b=>b.classList.toggle("active",b.dataset.filter==="favorite"));renderGrid();});
  $("#dashboardLocationOpenBtn").addEventListener("click",openDashboardLocation);
  $("#dashboardMapBtn").addEventListener("click",openDashboardLocation);
  $("#moduleNav").addEventListener("click",e=>{const b=e.target.closest("[data-module]");if(b)showModule(b.dataset.module);});
  $("#mapLayerBtn").addEventListener("click",()=>{renderMapLayerMenu();openSheet("#mapLayerSheet");});
  $("#mapTrainerEditBtn").addEventListener("click",()=>{renderTrainerEditList();openSheet("#trainerEditSheet");});
  $("#trainerEditList").addEventListener("click",e=>{const b=e.target.closest("[data-trainer-move]");if(b)startTrainerMove(b.dataset.trainerMove);});
  $("#mapTrainerMoveCancel").addEventListener("click",cancelTrainerMove);
  $("#mapCenterBtn").addEventListener("click",resetMapViewport);
  $("#mapFieldClose").addEventListener("click",closeMapField);
  $("#mapToEncounterBtn").addEventListener("click",()=>{const code=mapEncounterCode(app.mapSelectedField);if(!code)return;app.encounterField=code;app.encounterResult=null;showModule("encounter");});
  $("#mapClearLayers").addEventListener("click",clearMapLayers);
  $("#mapLayerSearch").addEventListener("input",e=>{app.mapLayerSearch=e.target.value;renderMapLayerMenu();});
  $("#mapLayerGroups").addEventListener("click",e=>{const b=e.target.closest("[data-map-layer]");if(!b)return;setMapLayer(b.dataset.mapLayer,b.dataset.mapLayerType);});
  $("#encounterFieldSelect").addEventListener("change",e=>{app.encounterField=e.target.value;app.encounterResult=null;renderEncounter();});
  $("#encounterTSButtons").addEventListener("click",e=>{const b=e.target.closest("[data-encounter-ts]");if(!b)return;app.encounterTS=+b.dataset.encounterTs;app.encounterResult=null;renderEncounter();});
  $("#encounterStartBtn").addEventListener("click",generateEncounter);
  $("#encounterRerollBtn").addEventListener("click",generateEncounter);
  $("#encounterToFightBtn").addEventListener("click",transferEncounterToFight);
  $$("[data-fight-source]").forEach(b=>b.addEventListener("click",()=>{app.fightSource=b.dataset.fightSource; app.fightRole=isOwnFightSource()?"own":"opponent"; app.fightSelectedId=null; ensureFightSelection(true); renderFight();}));
  $$("[data-fight-role]").forEach(b=>b.addEventListener("click",()=>{app.fightRole=b.dataset.fightRole;renderFight();}));
  $("#fightPokemonSelect").addEventListener("change",e=>{app.fightSelectedId=+e.target.value;ensureFightSelection(true);renderFight();});
  $("#fightLevelButtons").addEventListener("click",e=>{const b=e.target.closest("[data-fight-level]");if(!b||b.disabled)return;app.fightSelectedLevel=+b.dataset.fightLevel;renderFight();});
  $("#fightAddBtn").addEventListener("click",addFightPokemon);
  $("#fightTeamList").addEventListener("click",e=>{const start=e.target.closest("[data-fight-start]");if(start){toggleFightStart(start.dataset.fightStart);return;}const order=e.target.closest("[data-fight-order]");if(order){moveFightTurnOrder(order.dataset.fightUid,+order.dataset.fightOrder);return;}const remove=e.target.closest("[data-fight-remove]");if(remove){app.fightTeam=app.fightTeam.filter(m=>m.uid!==remove.dataset.fightRemove);normalizeFightTurnOrder();renderFight();return;}const step=e.target.closest("[data-fight-step]");if(step)stepFightMember(step.dataset.fightUid,+step.dataset.fightStep);});
  $("#fightStartLiveBtn").addEventListener("click",startLiveBattle);
  $("#fightClearTeamBtn").addEventListener("click",()=>{app.fightTeam=[];renderFight();toast("Team geleert");});
  $("#fightNewBattleBtn").addEventListener("click",startNextFight);
  $("#fightResetCompareBtn").addEventListener("click",()=>{app.fightBaseline={};renderFight();toast("Vergleich zurückgesetzt");});
  $("#activeBattleBanner").addEventListener("click",showBattleDashboard);
  $("#battleBackBtn").addEventListener("click",()=>{ if(app.player) showModule("fight"); else { app.view="dashboard"; showNoPlayer(); renderBattleBanner(); } });
  $("#battleEndBtn").addEventListener("click",endLiveBattle);
  $("#battleOwnSide").addEventListener("click",handleBattleAreaClick);
  $("#battleOpponentSide").addEventListener("click",handleBattleAreaClick);
  $("#battleNextTurnBtn").addEventListener("click",nextBattleTurn);
  $("#battleCalcDefender").addEventListener("change",e=>{app.battleCalc.defender=e.target.value;app.battleCalc.defenseCard="";app.battleCalc.result=null;renderBattleCalculator();});
  $("#battleCalcAttackCard").addEventListener("change",e=>{app.battleCalc.attackCard=e.target.value;app.battleCalc.result=null;renderBattleCalculator();});
  $("#battleCalcDefenseCard").addEventListener("change",e=>{app.battleCalc.defenseCard=e.target.value;app.battleCalc.result=null;renderBattleCalculator();});
  $("#battleCalculateBtn").addEventListener("click",calculateBattleCombat);
  $("#battleCalcResult").addEventListener("input",e=>{if(e.target.id==="battleFinalDamageInput"&&app.battleCalc.result)app.battleCalc.result.finalDamage=Math.max(0,+e.target.value||0);});
  $("#battleCalcResult").addEventListener("click",e=>{if(e.target.closest("#battleApplyResultBtn"))applyBattleCombatResult();});
  $("#battleFighterSheet").addEventListener("click",handleBattleFighterSheetClick);
  $("#librarySearch").addEventListener("input",e=>{app.librarySearch=e.target.value;renderLibrary();});
  $("#librarySectionSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-library-section]");if(!b)return;app.librarySection=b.dataset.librarySection;app.libraryType="Alle";app.libraryKind="all";app.librarySearch="";$("#librarySearch").value="";buildLibraryTypeStrip();renderLibrary();});
  $("#libraryKindFilter").addEventListener("click",e=>{const b=e.target.closest("[data-card-kind]");if(!b)return;app.libraryKind=b.dataset.cardKind;renderLibrary();});
  $("#libraryTypeStrip").addEventListener("click",e=>{const b=e.target.closest("[data-library-type]");if(!b)return;app.libraryType=b.dataset.libraryType;renderLibrary();});
  $("#libraryClearBtn").addEventListener("click",resetLibraryFilters);
  document.addEventListener("click",e=>{
    const card=e.target.closest("[data-card-open]"); if(card){ e.preventDefault(); openCardDetail(card.dataset.cardOpen); return; }
    const mon=e.target.closest("[data-card-pokemon]"); if(mon){ closeSheets(); openDetail(+mon.dataset.cardPokemon); }
  });
  $("#directorBtn").addEventListener("click",()=>showModule("director"));
  $("#directorSearch").addEventListener("input",e=>{app.directorSearch=e.target.value;renderDirector();});
  $("#directorSort").addEventListener("change",e=>{app.directorSort=e.target.value;renderDirector();});
  $("#directorRefreshBtn").addEventListener("click",async()=>{await saveToFirebase();await loadAdminPlayers();renderDirector();toast("Spielleiter-Zentrale aktualisiert");});
  $("#directorGrid").addEventListener("click",e=>{const map=e.target.closest("[data-director-map]");if(map){openDirectorPlayer(map.dataset.directorMap,true);return;}const open=e.target.closest("[data-director-open]");if(open)openDirectorPlayer(open.dataset.directorOpen,false);});
  $("#playerBtn").addEventListener("click",()=>openSheet(app.isAdmin?"#playerSheet":"#settingsSheet")); $("#settingsBtn").addEventListener("click",()=>openSheet("#settingsSheet")); $("#sheetBackdrop").addEventListener("click",closeSheets); $$(".close-sheet").forEach(b=>b.addEventListener("click",closeSheets));
  $("#playerList").addEventListener("click",e=>{const b=e.target.closest("[data-player]");if(b)selectPlayer(b.dataset.player);});
  $("#editModeToggle").addEventListener("change",e=>{if(!app.isAdmin){e.target.checked=false;toast("Admin-Anmeldung erforderlich");return;}app.editMode=e.target.checked;if(!app.editMode)app.mapTrainerMoveId=null;render();toast(app.editMode?"Bearbeitungsmodus aktiv":"Ansichtsmodus aktiv");});
  $("#exportBtn").addEventListener("click",exportState); $("#shareBtn").addEventListener("click",sharePlayer); $("#saveNowBtn").addEventListener("click",saveToFirebase); $("#installAppBtn").addEventListener("click",installPwa);
  $("#loginBtn").addEventListener("click",doLogin); $("#logoutBtn").addEventListener("click",doLogout); $("#adminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
  window.addEventListener("beforeunload",()=>{ if(app.dirty){ cacheState(); cacheProfile(); } });
}

init();
