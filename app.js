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
  pokemon: [], attacks: {}, evolutionGroups: [], players: [], player: null,
  state: {}, publishedState: {}, filter: "all", type: "Alle", search: "", editMode: false,
  selectedId: null, activeTab: "info", user: null, isAdmin: false,
  saveTimer: null, saving: false, dirty: false,
  view: "dex", fightSource: "owned", fightRole: "own", fightSelectedId: null,
  fightSelectedLevel: 1, fightTeam: [], fightBaseline: {},
  encounterData: null, encounterField: null, encounterTS: 3, encounterResult: null
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = v => JSON.parse(JSON.stringify(v));
const pad = n => String(n).padStart(3,"0");
const initials = name => (name||"?").trim().split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();
const playerKey = id => `pu-dex-cache-${id}`;
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
function cacheState(){ if(app.player) localStorage.setItem(playerKey(app.player.id), JSON.stringify(app.state)); }
function attacksFor(p){ return app.attacks[p.name]||[]; }
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

function fightPokemon(id){ return app.pokemon.find(p=>p.id===Number(id)) || null; }
function newFightUid(){ return (globalThis.crypto?.randomUUID?.() || `fight-${Date.now()}-${Math.random().toString(36).slice(2)}`); }
function loadFightState(id){
  app.fightTeam=[]; app.fightBaseline={}; app.fightSelectedId=null; app.fightSelectedLevel=1; app.fightSource="owned"; app.fightRole="own";
  try {
    const raw=JSON.parse(localStorage.getItem(fightKey(id))||"{}");
    if(Array.isArray(raw.team)) app.fightTeam=raw.team.map(m=>({uid:m.uid||newFightUid(),id:+m.id,level:+m.level,role:m.role==="opponent"?"opponent":"own",freeLevel:!!m.freeLevel})).filter(m=>fightPokemon(m.id));
    if(raw.baseline&&typeof raw.baseline==="object") app.fightBaseline=Object.fromEntries(Object.entries(raw.baseline).filter(([,v])=>Number.isFinite(+v)&&+v>0).map(([k,v])=>[k,+v]));
  } catch(err){ console.warn("Kampfstand konnte nicht geladen werden",err); }
  ensureFightSelection(true);
}
function saveFightState(){
  if(!app.player) return;
  localStorage.setItem(fightKey(app.player.id),JSON.stringify({team:app.fightTeam,baseline:app.fightBaseline}));
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
function cardsForFightTeam(team=app.fightTeam){
  const counts={};
  for(const member of team){
    const p=fightPokemon(member.id); if(!p) continue;
    for(const move of attacksFor(p)) if(move.level<=member.level) counts[move.name]=(counts[move.name]||0)+1;
  }
  return counts;
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
  target.innerHTML=rows.length?rows.map(([name,count])=>`<div class="diff-row"><span>${escapeHtml(name)}</span><strong>×${count}</strong></div>`).join(""):`<div class="diff-empty">${emptyText}</div>`;
}
function showModule(view){
  if(!app.player){ showNoPlayer(); return; }
  app.view=view==="fight"?"fight":view==="encounter"?"encounter":"dex";
  app.selectedId=null;
  $("#detailView").classList.add("hidden");
  $("#mainView").classList.toggle("hidden",app.view!=="dex");
  $("#encounterView").classList.toggle("hidden",app.view!=="encounter");
  $("#fightView").classList.toggle("hidden",app.view!=="fight");
  $("#brandLabel").textContent=app.view==="fight"?"Kampf":app.view==="encounter"?"Begegnung":"Dex";
  $$("#moduleNav [data-module]").forEach(b=>b.classList.toggle("active",b.dataset.module===app.view));
  if(app.view==="fight") renderFight();
  else if(app.view==="encounter") renderEncounter();
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
  $("#fightTeamHeading").textContent=app.fightTeam.length?`${app.fightTeam.length} ${app.fightTeam.length===1?"Pokémon":"Pokémon"}`:"Noch kein Pokémon";
  team.innerHTML=app.fightTeam.length?app.fightTeam.map((m,index)=>{ const mon=fightPokemon(m.id); const type=mon?.type||"Normal"; const learned=mon?attacksFor(mon).filter(a=>a.level<=m.level).length:0; return `<article class="fight-member" style="${typeVars(type)}"><div class="fight-member-art"><img src="${mon?.image||FALLBACK_IMAGE}" alt="${escapeHtml(mon?.name||"Pokémon")}" loading="lazy"></div><div class="fight-member-copy"><small>${m.role==="opponent"?"Gegner":"Mein Team"} · #${pad(mon?.id||0)}</small><strong>${escapeHtml(mon?.name||"Pokémon")}</strong><span>Lvl ${m.level} · ${learned} Attackenkarten</span></div><div class="fight-member-actions"><div class="mini-level"><button data-fight-step="-1" data-fight-uid="${m.uid}" type="button">−</button><b>${m.level}</b><button data-fight-step="1" data-fight-uid="${m.uid}" type="button">＋</button></div><button class="fight-remove" data-fight-remove="${m.uid}" type="button" aria-label="${escapeHtml(mon?.name||"Pokémon")} entfernen">×</button></div></article>`; }).join(""):`<div class="fight-empty"><span>⚔</span><strong>Team noch leer</strong><p>Füge oben Pokémon hinzu. Die benötigten Attackenkarten werden sofort berechnet.</p></div>`;
  $$("#fightTeamList img").forEach(setImgFallback);

  const current=cardsForFightTeam(); const diff=diffFightCards(current,app.fightBaseline);
  $("#fightTeamCount").textContent=app.fightTeam.length; $("#fightUniqueCount").textContent=Object.keys(current).length; $("#fightCopyCount").textContent=totalCopies(current);
  const summaries=[["#fightAddSummary",diff.add],["#fightKeepSummary",diff.keep],["#fightRemoveSummary",diff.remove]];
  for(const [sel,counts] of summaries){ const n=totalCopies(counts); $(sel).textContent=`${n} ${n===1?"Karte":"Karten"}`; }
  renderDiffList($("#fightAddList"),diff.add,"Nichts Neues holen"); renderDiffList($("#fightKeepList"),diff.keep,"Keine Karten bleiben"); renderDiffList($("#fightRemoveList"),diff.remove,"Nichts zurücklegen");
  const currentEntries=sortedCardEntries(current); const currentTotal=totalCopies(current); $("#fightCurrentBadge").textContent=`${currentTotal} ${currentTotal===1?"Karte":"Karten"}`;
  $("#fightCurrentList").innerHTML=currentEntries.length?currentEntries.map(([name,count])=>`<div class="current-card-row"><span>${escapeHtml(name)}</span><strong>×${count}</strong></div>`).join(""):`<div class="diff-empty">Noch keine Attackenkarten benötigt.</div>`;
  saveFightState();
}
function addFightPokemon(){
  const p=fightPokemon(app.fightSelectedId); if(!p) return;
  app.fightTeam.push({uid:newFightUid(),id:p.id,level:app.fightSelectedLevel,role:app.fightRole});
  renderFight(); toast(`${p.name} hinzugefügt`);
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

async function init(){
  try { app.pokemon=await loadJson("data/pokemon.json"); }
  catch(err){ document.body.innerHTML=`<main style="padding:24px"><h1>Dex konnte nicht geladen werden</h1><p>Bitte über GitHub Pages oder einen Webserver öffnen.</p><pre>${String(err)}</pre></main>`; return; }

  try { const data=await loadJson("data/attacks.json"); app.attacks=data.pokemon||data||{}; }
  catch(err){ console.warn("Attackendaten nicht geladen",err); app.attacks={}; }
  try { const data=await loadJson("data/evolutions.json"); app.evolutionGroups=data.groups||[]; }
  catch(err){ console.warn("Entwicklungsdaten nicht geladen",err); app.evolutionGroups=[]; }
  try {
    app.encounterData=await loadJson("data/encounters.json");
    app.encounterField=app.encounterData.fieldCodes?.[0]||null;
  } catch(err){ console.warn("Zufallsdaten nicht geladen",err); app.encounterData=null; }

  buildTypeStrip(); bindEvents();
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
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js?v=5.0").catch(()=>{});
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
    localStorage.setItem(LAST_PLAYER_KEY,id);
    app.publishedState=normalizeState(data.pokemon||{});
    app.state=clone(app.publishedState);
    localStorage.setItem(playerKey(id),JSON.stringify(app.state));
    app.selectedId=null; app.editMode=app.isAdmin && app.editMode; app.view="dex"; app.encounterResult=null; loadFightState(id);
    history.replaceState(null,"",`${location.pathname}?player=${encodeURIComponent(id)}`);
    $("#mainView").classList.remove("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#noPlayerView").classList.add("hidden"); $("#moduleNav").classList.remove("hidden");
    $("#brandLabel").textContent="Dex"; $$("#moduleNav [data-module]").forEach(b=>b.classList.toggle("active",b.dataset.module==="dex"));
    if(close) closeSheets();
    render();
    return true;
  } catch(err){
    console.error(err);
    const cached=localStorage.getItem(playerKey(id));
    if(cached){
      app.player={id,name:"Offline-Spielstand"};
      app.state=normalizeState(JSON.parse(cached)); app.publishedState=clone(app.state); app.view="dex"; app.encounterResult=null; loadFightState(id);
      $("#mainView").classList.remove("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#noPlayerView").classList.add("hidden"); $("#moduleNav").classList.remove("hidden");
      toast("Offline-Kopie geladen");
      render();
      return true;
    } else { showNoPlayer("Dieser Spieler-Link ist ungültig oder derzeit nicht erreichbar."); }
  }
  render();
  return false;
}

function showNoPlayer(msg="Öffne deinen persönlichen Spieler-Link. Als Spielleiter kannst du dich über ☰ anmelden."){
  app.player=null; app.state={}; app.publishedState={}; app.selectedId=null; app.fightTeam=[]; app.fightBaseline={}; app.encounterResult=null;
  $("#detailView").classList.add("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#mainView").classList.add("hidden"); $("#moduleNav").classList.add("hidden"); $("#noPlayerView").classList.remove("hidden");
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
    renderStats(); renderGrid(); if(app.view==="fight") renderFight(); else if(app.view==="encounter") renderEncounter();
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
  $("#dexGrid").innerHTML=list.map(p=>{ const s=stateFor(p); const learned=attacksFor(p).filter(a=>a.level<=s.level).length; return `<button class="dex-card ${s.owned?"":"not-owned"}" data-id="${p.id}" style="${typeVars(p.type)}"><div class="card-art"><span class="card-fav">${s.favorite?"★":"☆"}</span><img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy"></div><div class="card-copy"><small>#${pad(p.id)}</small><strong>${escapeHtml(p.name)}</strong><div class="card-meta"><span class="card-type"><i class="type-dot"></i>${escapeHtml(p.type)}</span><span class="level-pill">Lvl ${s.level}</span></div>${learned?`<div class="card-attacks">⚔ ${learned} Attacken</div>`:""}</div></button>`; }).join("");
  $$("#dexGrid img").forEach(setImgFallback);
}
function renderPlayerList(){
  const wrap=$("#playerList");
  if(!app.isAdmin){ wrap.innerHTML=`<div class="notice notice-muted"><strong>Nur für Spielleiter</strong><p>Die Spielerliste ist geschützt und wird erst nach der Admin-Anmeldung geladen.</p></div>`; return; }
  wrap.innerHTML=app.players.map(p=>`<button class="player-option ${app.player?.id===p.id?"active":""}" data-player="${p.id}"><span class="player-avatar">${initials(p.name)}</span><span><strong>${escapeHtml(p.name)}</strong><small>${app.player?.id===p.id?"Aktuell ausgewählt":"Dex öffnen"}</small></span></button>`).join("")||`<div class="notice"><strong>Noch keine Spieler</strong><p>Importiere zuerst deine JSON-Spielstände über <code>admin-import.html</code>.</p></div>`;
}

function openDetail(id){ app.view="dex"; app.selectedId=Number(id); app.activeTab="info"; $("#mainView").classList.add("hidden"); $("#encounterView").classList.add("hidden"); $("#fightView").classList.add("hidden"); $("#detailView").classList.remove("hidden"); window.scrollTo({top:0,behavior:"instant"}); renderDetail(); }
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

  const moves=attacksFor(p); const unlocked=moves.filter(m=>m.level<=s.level); const next=moves.find(m=>m.level>s.level);
  $("#infoAttackCount").textContent=moves.length?`${unlocked.length} / ${moves.length}`:"—";
  $("#infoNextAttack").textContent=next?`Lv ${next.level}: ${next.name}`:(moves.length?"Alle freigeschaltet":"—");

  $("#editPanel").classList.toggle("hidden",!(app.isAdmin&&app.editMode));
  $("#ownedToggle").checked=s.owned; $("#favoriteToggle").checked=s.favorite; $("#levelSlider").min=p.minLevel; $("#levelSlider").max=p.maxLevel; $("#levelSlider").value=s.level; $("#levelValue").textContent=s.level; $("#levelHelp").textContent=`Erlaubt: ${p.minLevel} bis ${p.maxLevel}`;

  renderAttackTab(p,s);
  renderEvolutionTab(p);

  $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===app.activeTab)); $$(".tab-panel").forEach(x=>x.classList.add("hidden")); $(`#tab-${app.activeTab}`).classList.remove("hidden");
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
    html.push(`<article class="attack-item ${ready?"unlocked":"locked"}"><span class="attack-level">${m.level}</span><div class="attack-name"><strong>${escapeHtml(m.name)}</strong><small>${ready?"Für dieses Level verfügbar":`Freischaltung ab Level ${m.level}`}</small></div><span class="attack-state" aria-label="${ready?"verfügbar":"gesperrt"}">${ready?"✓":"○"}</span></article>`);
  }
  list.innerHTML=html.join("");
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
  $("#backBtn").addEventListener("click",closeDetail); $("#homeBtn").addEventListener("click",()=>{if(app.selectedId)closeDetail();else if(app.player&&app.view!=="dex")showModule("dex");else if(app.player)resetFilters();});
  $("#prevBtn").addEventListener("click",()=>{app.selectedId=app.selectedId<=1?app.pokemon.length:app.selectedId-1;renderDetail();}); $("#nextBtn").addEventListener("click",()=>{app.selectedId=app.selectedId>=app.pokemon.length?1:app.selectedId+1;renderDetail();});
  $("#detailFavoriteBtn").addEventListener("click",()=>mutateSelected(s=>s.favorite=!s.favorite)); $$(".tab").forEach(b=>b.addEventListener("click",()=>{app.activeTab=b.dataset.tab;renderDetail();}));
  $("#ownedToggle").addEventListener("change",e=>mutateSelected(s=>s.owned=e.target.checked)); $("#favoriteToggle").addEventListener("change",e=>mutateSelected(s=>s.favorite=e.target.checked)); $("#levelSlider").addEventListener("input",e=>mutateSelected(s=>s.level=+e.target.value)); $$(".stepper [data-ep]").forEach(b=>b.addEventListener("click",()=>changeEP(+b.dataset.ep)));
  $("#evolutionContent").addEventListener("click",e=>{const b=e.target.closest("[data-evo-id]"); if(!b)return; app.selectedId=+b.dataset.evoId; app.activeTab="entwicklung"; window.scrollTo({top:0,behavior:"smooth"}); renderDetail();});
  $("#moduleNav").addEventListener("click",e=>{const b=e.target.closest("[data-module]");if(b)showModule(b.dataset.module);});
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
  $("#fightTeamList").addEventListener("click",e=>{const remove=e.target.closest("[data-fight-remove]");if(remove){app.fightTeam=app.fightTeam.filter(m=>m.uid!==remove.dataset.fightRemove);renderFight();return;}const step=e.target.closest("[data-fight-step]");if(step)stepFightMember(step.dataset.fightUid,+step.dataset.fightStep);});
  $("#fightClearTeamBtn").addEventListener("click",()=>{app.fightTeam=[];renderFight();toast("Team geleert");});
  $("#fightNewBattleBtn").addEventListener("click",startNextFight);
  $("#fightResetCompareBtn").addEventListener("click",()=>{app.fightBaseline={};renderFight();toast("Vergleich zurückgesetzt");});
  $("#playerBtn").addEventListener("click",()=>openSheet(app.isAdmin?"#playerSheet":"#settingsSheet")); $("#settingsBtn").addEventListener("click",()=>openSheet("#settingsSheet")); $("#sheetBackdrop").addEventListener("click",closeSheets); $$(".close-sheet").forEach(b=>b.addEventListener("click",closeSheets));
  $("#playerList").addEventListener("click",e=>{const b=e.target.closest("[data-player]");if(b)selectPlayer(b.dataset.player);});
  $("#editModeToggle").addEventListener("change",e=>{if(!app.isAdmin){e.target.checked=false;toast("Admin-Anmeldung erforderlich");return;}app.editMode=e.target.checked;renderDetail();toast(app.editMode?"Bearbeitungsmodus aktiv":"Ansichtsmodus aktiv");});
  $("#exportBtn").addEventListener("click",exportState); $("#shareBtn").addEventListener("click",sharePlayer); $("#saveNowBtn").addEventListener("click",saveToFirebase); $("#installAppBtn").addEventListener("click",installPwa);
  $("#loginBtn").addEventListener("click",doLogin); $("#logoutBtn").addEventListener("click",doLogout); $("#adminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
  window.addEventListener("beforeunload",()=>{ if(app.dirty) cacheState(); });
}

init();
