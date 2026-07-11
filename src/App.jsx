import { useState, useEffect, useMemo, useRef, Component } from "react";
import { createPortal } from "react-dom";
import { IT_COMUNI } from "./comuni.js";

/* ErrorBoundary — mostra l'errore su schermo invece di pagina bianca */
class AvatarErrorBoundary extends Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  render(){
    if(this.state.err){
      return(
        <div style={{padding:40,fontFamily:"monospace",background:"#fff1f1",minHeight:"100dvh"}}>
          <h2 style={{color:"#C00",fontSize:16,marginBottom:12}}>⚠️ Errore Avatar</h2>
          <pre style={{fontSize:11,whiteSpace:"pre-wrap",color:"#600"}}>{String(this.state.err)}</pre>
          <button onClick={()=>this.setState({err:null})} style={{marginTop:20,padding:"10px 20px",borderRadius:12,border:"none",background:"#C00",color:"#fff",cursor:"pointer"}}>Torna indietro</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* MAPPA — Leaflet + OpenStreetMap (gratis, nessuna API key). Ricerca luoghi via Nominatim (geocoding OSM). */
let leafletPromise = null;
const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletPromise;
};

let clusterPromise = null;
const loadMarkerCluster = () => loadLeaflet().then(L => {
  if (L.MarkerClusterGroup) return L;
  if (clusterPromise) return clusterPromise;
  clusterPromise = new Promise((resolve, reject) => {
    ["https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
     "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
    ].forEach(href => { const l=document.createElement("link"); l.rel="stylesheet"; l.href=href; document.head.appendChild(l); });
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
    s.async = true;
    s.onload = () => resolve(L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return clusterPromise;
});

// ── Supabase (backend/database) ──────────────────────────────
const SUPABASE_URL = "https://zvvsldyecqkqvedwatqs.supabase.co";
const SUPABASE_KEY = "sb_publishable_WHgoJiw0Ju1z0eIq0x0qzA_5H1LV3YS";
let _sb = null, sbPromise = null;
const getSupabase = () => {
  if (_sb) return Promise.resolve(_sb);
  if (sbPromise) return sbPromise;
  sbPromise = import(/* @vite-ignore */ "https://esm.sh/@supabase/supabase-js@2")
    .then(m => { _sb = m.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } }); return _sb; });
  return sbPromise;
};
// Ricava utente app (name/type) dai metadati Supabase
const userFromSb = (u) => {
  const md = (u && u.user_metadata) || {};
  const type = md.role === "pro" ? "pro" : "cliente";
  const name = md.name || (u && u.email ? u.email.split("@")[0] : "Utente");   // identità PRIVATA
  const username = md.username || (u && u.email ? u.email.split("@")[0] : "utente");
  const bizName = md.business_name || name;                                    // identità AZIENDA
  const bizUsername = md.business_username || username;
  return { name, type, email: u && u.email, uid: u && u.id, username, handle: username, bizName, bizUsername };
};

// Ridimensiona e comprime un'immagine (evita dataURL enormi → scroll fluido, meno memoria)
function downscaleImage(file, maxW=1200, quality=0.82){
  return new Promise((resolve)=>{
    try{
      const rd = new FileReader();
      rd.onerror = ()=>resolve(null);
      rd.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          try{
            let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
            if(w>maxW){ h=Math.round(h*maxW/w); w=maxW; }
            const c=document.createElement("canvas"); c.width=w; c.height=h;
            c.getContext("2d").drawImage(img,0,0,w,h);
            resolve(c.toDataURL("image/jpeg",quality));
          }catch(e){ resolve(rd.result); }
        };
        img.onerror = ()=>resolve(rd.result);
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    }catch(e){ resolve(null); }
  });
}

// ── Three.js loader (CDN, come Leaflet) ──────────────────────
let threePromise = null;
const loadThree = () => {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
    s.async = true;
    s.onload = () => resolve(window.THREE);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return threePromise;
};

const TILE_LAYERS = {
  // Stile "Apple-like" — CARTO Positron: chiaro, minimale, etichette leggere (gratuito, nessuna API key)
  light: {url:"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>', subdomains:"abcd"},
  dark: {url:"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>', subdomains:"abcd"},
};

const proPinIcon = (L,pro) => {
  const avail = pro.id % 3 !== 0; // disponibile oggi
  return L.divIcon({
    className:"",
    html:`<div style="position:relative;width:46px;height:54px;filter:drop-shadow(0 5px 9px rgba(0,0,0,.25))">
      <svg viewBox="0 0 46 54" width="46" height="54" style="position:absolute;inset:0">
        <path d="M23 0C10.3 0 0 9.9 0 22.2 0 37.5 23 54 23 54s23-16.5 23-31.8C46 9.9 35.7 0 23 0z" fill="#ffffff"/>
      </svg>
      <div style="position:absolute;top:4px;left:4px;width:38px;height:38px;border-radius:50%;background:${pro.accent}1f;border:2.5px solid ${pro.accent};display:flex;align-items:center;justify-content:center;font-size:19px;">${pro.emoji}</div>
      ${avail?`<div style="position:absolute;top:1px;right:2px;width:13px;height:13px;border-radius:50%;background:#22C483;border:2.5px solid #fff"></div>`:``}
    </div>`,
    iconSize:[46,54], iconAnchor:[23,54], popupAnchor:[0,-50],
  });
};

const userDotIcon = (L) => L.divIcon({
  className:"",
  html:`<div style="width:18px;height:18px;border-radius:50%;background:${T.blue};border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25)"></div>`,
  iconSize:[18,18], iconAnchor:[9,9],
});

const searchPlaces = async (query) => {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=6&accept-language=it&countrycodes=it`);
  if (!res.ok) return [];
  const data = await res.json();
  // Solo risultati in Italia
  return data.filter(p => p.address?.country_code === "it");
};

// Ricerca CITTÀ in tutto il mondo (per il campo Città del profilo) — solo località reali.
const searchCities = async (query) => {
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&limit=15&accept-language=it`);
    if(!res.ok) return [];
    const data = await res.json();
    const seen = new Set(); const out = [];
    for(const p of data){
      const a = p.address||{};
      const isPlace = p.class==="place" && ["city","town","village","municipality","hamlet"].includes(p.type);
      const isAdmin = p.class==="boundary" && p.type==="administrative";
      if(!isPlace && !isAdmin) continue;
      const name = a.city||a.town||a.village||a.municipality||a.hamlet||p.name||(p.display_name||"").split(",")[0];
      if(!name) continue;
      const sub = [a.state||a.region||a.county||"", a.country||""].filter(Boolean).join(", ");
      const key = `${name.toLowerCase()}|${sub.toLowerCase()}`;
      if(seen.has(key)) continue; seen.add(key);
      out.push({name, sub});
    }
    return out.slice(0,12);
  }catch(e){ return []; }
};

const toRad = d => (d*Math.PI)/180;
const distanceKm = (lat1,lng1,lat2,lng2) => {
  const R = 6371;
  const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};

const injectFont = () => {
  if (document.getElementById("app-fonts")) return;
  const l = document.createElement("link");
  l.id = "app-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(l);
  const s = document.createElement("style");
  s.id = "app-style-rules";
  s.textContent = `
    *{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-tap-highlight-color:transparent}
    body,input,button,select,textarea{font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif}

    /* ══ BEAUTY DESIGN SYSTEM 2026 ══ */

    /* DS Nav — bottom navigation premium */
    .ds-nav{
      position:fixed;bottom:0;left:50%;transform:translateX(-50%);
      width:100%;max-width:430px;
      background:rgba(255,255,255,.96);
      backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      border-top:1px solid rgba(0,0,0,.06);
      padding:10px 8px env(safe-area-inset-bottom,20px);
      display:flex;align-items:flex-start;justify-content:space-around;
      z-index:200;
    }
    .ds-nav-item{
      display:flex;flex-direction:column;align-items:center;gap:3px;
      padding:6px 10px 4px;border-radius:14px;border:none;background:transparent;
      cursor:pointer;transition:all .22s cubic-bezier(.34,1.56,.64,1);
      font-family:inherit;min-width:56px;
    }
    .ds-nav-item:active{transform:scale(.88);background:rgba(232,80,110,.06)}
    .ds-nav-label{font-size:10px;font-weight:600;color:#ADADAD;letter-spacing:.02em;transition:color .2s}
    .ds-nav-item.active .ds-nav-label{color:#E8506E;font-weight:700}

    /* DS Cards */
    .ds-card{background:#fff;border-radius:20px;transition:transform .22s cubic-bezier(.34,1.56,.64,1);overflow:hidden}
    .ds-card:active{transform:scale(.985)}
    .ds-card-shadow{box-shadow:0 4px 24px rgba(13,13,14,.08),0 1px 4px rgba(13,13,14,.04)}

    /* DS Buttons */
    .ds-btn{background:#E8506E;color:#fff;border:none;border-radius:9999px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s cubic-bezier(.34,1.56,.64,1);box-shadow:0 4px 20px rgba(232,80,110,.32)}
    .ds-btn:active{transform:scale(.95);background:#C43459;box-shadow:0 2px 10px rgba(232,80,110,.28)}
    .ds-btn-outline{background:#fff;color:#0D0D0E;border:1.5px solid #E8E7E5;border-radius:9999px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .18s ease}
    .ds-btn-outline:active{background:#F4F3F1;transform:scale(.97)}

    /* DS Search */
    .ds-search{background:#fff;border:1.5px solid #EBEBEB;border-radius:9999px;display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:0 4px 24px rgba(13,13,14,.08),0 1px 4px rgba(13,13,14,.04);cursor:text}
    .ds-search input{border:none;outline:none;background:none;font-size:15px;font-weight:500;color:#0D0D0E;font-family:inherit;width:100%}
    .ds-search input::placeholder{color:#ADADAD;font-weight:400}

    /* DS Input */
    .ds-input{background:#F4F3F1;border:1.5px solid transparent;border-radius:16px;padding:16px 18px;font-size:16px;font-family:inherit;color:#0D0D0E;outline:none;transition:all .2s;width:100%;display:block}
    .ds-input:focus{border-color:#E8506E;background:#fff;box-shadow:0 0 0 4px rgba(232,80,110,.10)}
    .ds-input::placeholder{color:#ADADAD}

    /* DS Chip */
    .ds-chip{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:9999px;border:1.5px solid #E8E7E5;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#0D0D0E;white-space:nowrap;transition:all .2s cubic-bezier(.34,1.56,.64,1);font-family:inherit}
    .ds-chip:active{transform:scale(.93)}
    .ds-chip.active{background:#0D0D0E;color:#fff;border-color:#0D0D0E}

    /* DS Typography */
    .ds-display{font-size:46px;font-weight:800;letter-spacing:-.05em;line-height:.96;color:#0D0D0E}
    .ds-h1{font-size:32px;font-weight:700;letter-spacing:-.04em;line-height:1.08;color:#0D0D0E}
    .ds-h2{font-size:22px;font-weight:700;letter-spacing:-.03em;line-height:1.2;color:#0D0D0E}
    .ds-label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#ADADAD}
    .ds-body{font-size:15px;line-height:1.6;color:#5A5959}
    .ds-caption{font-size:12px;font-weight:500;color:#ADADAD}

    /* DS Animations */
    @keyframes dsSlideUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
    @keyframes dsFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes dsPop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
    @keyframes dsSpring{0%{transform:scale(.88)}65%{transform:scale(1.05)}100%{transform:scale(1)}}
    @keyframes dsSpin{to{transform:rotate(360deg)}}
    .ds-slide{animation:dsSlideUp .45s cubic-bezier(.34,1.56,.64,1) both}
    .ds-fade{animation:dsFadeIn .3s ease both}
    .ds-pop{animation:dsPop .35s cubic-bezier(.34,1.56,.64,1) both}
    .ds-spring{animation:dsSpring .45s cubic-bezier(.34,1.56,.64,1) both}

    /* DS Skeleton */
    @keyframes dsPulse{0%,100%{opacity:.5}50%{opacity:1}}
    .ds-skel{background:#F0EFED;border-radius:10px;animation:dsPulse 1.6s ease infinite}

    /* ── Legacy compat — schermate non ancora rebuilt ── */
    .be-display{font-size:42px;font-weight:800;letter-spacing:-.05em;line-height:1.0;color:#0D0D0E}
    .be-h1{font-size:28px;font-weight:700;letter-spacing:-.04em;line-height:1.1;color:#0D0D0E}
    .be-h2{font-size:20px;font-weight:600;letter-spacing:-.03em;line-height:1.2;color:#0D0D0E}
    .be-label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#ADADAD}
    .be-body{font-size:15px;font-weight:400;line-height:1.6;color:#5A5959}
    .be-caption{font-size:12px;font-weight:500;color:#ADADAD}
    .be-card{background:#fff;border-radius:20px;overflow:hidden;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}
    .be-card:active{transform:scale(.985)}
    .be-card-shadow{box-shadow:0 4px 24px rgba(13,13,14,.08),0 1px 4px rgba(13,13,14,.04)}
    .be-btn-primary{background:#E8506E;color:#fff;border:none;border-radius:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s cubic-bezier(.34,1.56,.64,1);box-shadow:0 4px 16px rgba(232,80,110,.30)}
    .be-btn-primary:active{transform:scale(.95);background:#C43459}
    .be-btn-ghost{background:transparent;color:#0D0D0E;border:1.5px solid #E8E7E5;border-radius:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .18s ease}
    .be-btn-ghost:active{background:#F4F3F1}
    .be-pill{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:99px;border:1.5px solid #E8E7E5;background:#fff;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap;transition:all .2s cubic-bezier(.34,1.56,.64,1);font-family:inherit}
    .be-pill:active{transform:scale(.94)}
    .be-pill.active{background:#0D0D0E;color:#fff;border-color:#0D0D0E}
    .be-search{display:flex;align-items:center;gap:10px;background:#F4F3F1;border-radius:16px;padding:14px 16px}
    .be-search input{border:none;outline:none;background:none;font-size:15px;font-weight:500;color:#0D0D0E;font-family:inherit;width:100%}
    .be-search input::placeholder{color:#ADADAD}
    .be-navbar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0D0D0E;border-radius:99px;display:flex;align-items:center;gap:4px;padding:6px;box-shadow:0 8px 32px rgba(0,0,0,.28);z-index:200}
    .be-nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;width:52px;height:44px;border-radius:99px;border:none;background:transparent;cursor:pointer;transition:all .2s cubic-bezier(.34,1.56,.64,1)}
    .be-nav-item:active{transform:scale(.88)}
    .be-nav-item.active{background:#E8506E}
    @keyframes beSkeleton{0%,100%{opacity:.5}50%{opacity:1}}
    .be-skeleton{background:#F0EFED;border-radius:8px;animation:beSkeleton 1.4s ease infinite}
    @keyframes beFadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes beFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes bePop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
    .be-fadeup{animation:beFadeUp .35s cubic-bezier(.34,1.56,.64,1) both}
    .be-fadein{animation:beFadeIn .28s ease both}
    .be-pop{animation:bePop .25s cubic-bezier(.34,1.56,.64,1)}
    .ba-pop{animation:bePop .22s cubic-bezier(.34,1.56,.64,1)}
    @keyframes baRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes baFade{from{opacity:0}to{opacity:1}}
    .ba-rise{animation:baRise .38s cubic-bezier(.34,1.56,.64,1) both}
    .ba-fade{animation:baFade .3s ease both}
    @keyframes avFloat{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-8px) rotate(1deg)}}
    .av-float{animation:avFloat 4s ease-in-out infinite}
    @keyframes avPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
    .av-pop{animation:avPop .4s cubic-bezier(.34,1.56,.64,1) both}
    .ba-lift:active{transform:scale(.96)}
    .ba-slideup{animation:beFadeUp .38s cubic-bezier(.34,1.56,.64,1) both}
    .clay-btn{} .clay-soft{} .clay{} .clay-inset{} .glass{} .glass-dark{}
    .pro-photo{object-fit:cover;display:block;width:100%;height:100%}
    .cat-pill:active{transform:scale(.92)!important}
    .pro-card:active{transform:scale(.985)}
    @keyframes obFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes obFadeIn{from{opacity:0}to{opacity:1}}
    .ob-fadeup{animation:obFadeUp 320ms cubic-bezier(.4,0,.2,1) both}
    .ob-fadein{animation:obFadeIn 280ms ease both}

    /* ── Sfondo Beauty — bianco con onde rosa/blu che si muovono su tutto lo schermo ── */
    .bg-alive{ background:#FAFAFA; position:relative; }
    .bg-alive::before, .bg-alive::after{
      content:""; position:fixed; border-radius:50%;
      width:62vw; height:62vw; max-width:440px; max-height:440px;
      filter:blur(55px); pointer-events:none; z-index:0;
      will-change:transform,opacity;
    }
    /* Onda rosa — macchia che passa lasciando spazio bianco intorno */
    .bg-alive::before{
      top:-8%; left:-8%;
      background:radial-gradient(circle, rgba(255,122,200,0.55), rgba(255,122,200,0) 70%);
      animation:blobPink 40s ease-in-out infinite;
    }
    /* Onda blu — movimento opposto */
    .bg-alive::after{
      bottom:-8%; right:-8%;
      background:radial-gradient(circle, rgba(91,124,255,0.55), rgba(91,124,255,0) 70%);
      animation:blobBlue 46s ease-in-out infinite;
    }
    /* Il contenuto della home sopra le onde */
    .bg-alive > *{ position:relative; z-index:1; }
    @keyframes blobPink{
      0%  {transform:translate(0,0) scale(1);        opacity:.9;}
      50% {transform:translate(18vw,60vh) scale(1.15); opacity:1;}
      100%{transform:translate(0,0) scale(1);        opacity:.9;}
    }
    @keyframes blobBlue{
      0%  {transform:translate(0,0) scale(1);         opacity:.9;}
      50% {transform:translate(-18vw,-60vh) scale(1.2); opacity:1;}
      100%{transform:translate(0,0) scale(1);         opacity:.9;}
    }
    /* Card minimal — bianca, bordo chiarissimo, ombra quasi assente */
    .glass-card{
      background:#FFFFFF;
      border:1px solid #F0F0F2;
      box-shadow:0 2px 10px rgba(17,17,17,0.03);
      transition:transform .3s cubic-bezier(.22,1,.36,1);
    }
    .glass-card:active{transform:scale(.99)}
    /* Pulsante stile Apple/Fresha */
    .btn-apple{ background:#FFFFFF; border:1.5px solid #E5E5EA; color:#111111; box-shadow:0 1px 3px rgba(0,0,0,0.05); cursor:pointer; font-family:inherit; transition:background .18s ease, transform .18s ease; }
    .btn-apple:active{ background:#F5F5F7; transform:scale(.98); }
    .no-scrollbar::-webkit-scrollbar{ display:none; }
    .no-scrollbar{ scrollbar-width:none; -ms-overflow-style:none; }
    @keyframes countPop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .count-in{animation:countPop .5s cubic-bezier(.22,1,.36,1) both}

    @media(prefers-reduced-motion:reduce){
      .ds-slide,.ds-fade,.ds-pop,.ds-spring,.be-fadeup,.be-fadein,.be-pop,.ba-rise,.ba-fade,.ba-slideup,.ob-fadeup,.ob-fadein,.count-in{animation:none;opacity:1}
      .bg-alive{animation:none}
      *{transition:none!important}
    }
  `;
  document.head.appendChild(s);
};

/* ══════════════════════════════════════════════════
   BEAUTY 2026 — Editorial Design System
   ══════════════════════════════════════════════════ */
const T = {
  /* backgrounds */
  bg:     "#FAFAF9",
  bgMid:  "#F4F3F1",
  bgCard: "#FFFFFF",
  bgDark: "#0D0D0E",

  /* ink */
  ink:     "#0D0D0E",
  inkMid:  "#5A5959",
  inkSoft: "#ADADAD",
  inkFaint:"#E8E7E5",

  /* brand */
  brand:    "#E8506E",
  brandDeep:"#C43459",
  brandBg:  "#FFF1F4",
  brandMid: "#F07090",

  /* ui */
  line:    "#E8E7E5",
  surface: "#F4F3F1",
  white:   "#FFFFFF",
  paper:   "#FAFAF9",

  /* semantic */
  green:    "#22C483",  greenBg: "#ECFDF5",
  blue:     "#4F7EF7",  blueBg:  "#EDF2FF",
  red:      "#E8506E",  redBg:   "#FFF1F4",
  amber:    "#F59E0B",  amberBg: "#FFFBEB",
  purple:   "#7B61FF",  purpleBg:"#F0EEFF",
  gold:     "#E8506E",  goldBg:  "#FFF1F4",
  rose:     "#E8506E",  roseBg:  "#FFF1F4",

  /* gradient */
  grad: "linear-gradient(145deg,#F07090,#E8506E)",
};

/* ===== TEMA — accento variabile in-app (sfondi invariati) ===== */
const _hx = h => { h=h.replace("#",""); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; };
const _rgb = a => "#"+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,"0")).join("");
const lighten = (hex,amt)=>{const[r,g,b]=_hx(hex);return _rgb([r+(255-r)*amt,g+(255-g)*amt,b+(255-b)*amt]);};
const darken  = (hex,amt)=>{const[r,g,b]=_hx(hex);return _rgb([r*(1-amt),g*(1-amt),b*(1-amt)]);};

const ACCENTS = {
  nero:     {label:"Nero",          base:"#111111"},
  oro:      {label:"Oro",           base:"#9C7B52"},
  rosa:     {label:"Rosa",          base:"#D26A92"},
  arancione:{label:"Arancione",     base:"#DC7A2E"},
  blu:      {label:"Blu",           base:"#3A6DD0"},
  verde:    {label:"Verde",         base:"#4E9E5C"},
  petronas: {label:"Verde Petronas",base:"#1C7D7A"},
  rosso:    {label:"Rosso",         base:"#CE4438"},
  giallo:   {label:"Giallo",        base:"#C99A1E"},
  viola:    {label:"Viola",         base:"#7E4FC4"},
  grigio:   {label:"Grigio",        base:"#6E6E6E"},
  azzurro:  {label:"Azzurro",       base:"#3FA3D8"},
  lilla:    {label:"Lilla",         base:"#A877D0"},
  cipria:   {label:"Rosa Cipria",   base:"#C27A8A"},
  // temi genere
  donna:    {label:"Donna",         base:"#F06B9D"},
  uomo:     {label:"Uomo",          base:"#4A7BF7"},
  nonspec:  {label:"Neutro",        base:"#6E6E6E"},
};
const ACCENT_ORDER = ["nero","oro","rosa","arancione","blu","verde","petronas","rosso","giallo","viola","grigio","azzurro","lilla"];

function applyAccent(name){
  const a = ACCENTS[name] || ACCENTS.oro;
  const base = a.base, deep = darken(base,0.20), bg = lighten(base,0.82);
  T.brand=base; T.brandDeep=deep; T.brandBg=bg; T.gold=base; T.goldBg=bg;
  T.grad=`linear-gradient(135deg,${lighten(base,0.10)},${deep})`;
  // varianti tonali (badge/card) come sfumature dell'accento
  T.amber=lighten(base,0.06); T.amberBg=lighten(base,0.84);
  T.green=darken(base,0.08);  T.greenBg=lighten(base,0.80);
  T.blue =lighten(base,0.16); T.blueBg =lighten(base,0.86);
  T.purple=darken(base,0.04); T.purpleBg=lighten(base,0.82);
  T.red  =base;               T.redBg  =lighten(base,0.80);
  T.rose =lighten(base,0.12); T.roseBg =lighten(base,0.85);
  // categorie come sfumature dell'accento
  if (typeof CAT_LIST !== "undefined") CAT_LIST.forEach((c,i)=>{ const l=0.86-i*0.015; c.color=deep; c.bg=lighten(base,l); c.grad=`linear-gradient(145deg,${lighten(base,l)},${lighten(base,l-0.08)})`; });
  // le macro-categorie mantengono i loro colori pastello distinti (vedi MACRO_CATS)
  T.accent=name;
}

const ST = {
  confermato:{label:"Confermato",bg:"#E6F0E8",text:"#3E7C5A",bar:"#3E7C5A"},
  "in attesa":{label:"In attesa",bg:"#DDF0FB",text:"#2F8FC4",bar:"#4DA8DA"},
  cancellato:{label:"Cancellato",bg:"#F8E8E4",text:"#B23A2E",bar:"#B23A2E"},
  completato:{label:"Completato",bg:"#E9F0F4",text:"#3E6F8E",bar:"#3E6F8E"},
};

const U = (kw,w=800,h=1000) => `https://picsum.photos/seed/${encodeURIComponent(kw.split(" ")[0])}/${w}/${h}`;
/* Foto beauty specifiche per categoria — ID Unsplash verificati */
const CAT_PHOTOS = {
  parrucchiere:["1560066984-138dadb4c035","1521590832167-7bcbfaa6381f","1595476108010-b4d1f102b1b1"],
  barbiere:["1503951914875-452162b0f3f1","1599351431202-1e0f0137899a","1582849426146-b1a5b5c4e3c7"],
  nail_artist:["1604654894610-df63bc536371","1604680997070-7a4a6e3b5de7","1604654894610-df63bc536371"],
  estetista:["1570172619644-dfd03ed5d881","1512290923902-8a9f81dc236c","1515377905703-c4788e51af15"],
  tatuatore:["1611601322175-ef8ec80854e9","1531243625247-0e2c9e65e7ed","1596300440476-08f70a2c2df9"],
  ciglia:["1516975080664-ed2fc6a32937","1528360983277-13d401cdc186","1616394584738-fc6e612e71b9"],
  makeup:["1522337360788-8b13dee7a37e","1487412720507-e7ab37603c6f","1457972851104-4fd469440ab9"],
  massaggio:["1544161515-4ab6ce6db874","1519823551278-64ac92734fb1","1600334369421-73a0ca1ec5c0"],
  laser:["1571019613454-1cb2f99b2d8b","1559762717-e9d3a52a36a4","1631217868264-e5b90bb7e133"],
};

const proImg = (pro) => {
  const photos = CAT_PHOTOS[pro.catId];
  if (!photos) return null;
  const id = photos[pro.id % photos.length];
  return `https://images.unsplash.com/photo-${id}?w=310&h=310&fit=crop&crop=center&auto=format&q=80`;
};
const toMin = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
const toTime = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const SLOTS = []; for(let h=8;h<20;h++) for(let m=0;m<60;m+=30) SLOTS.push(toTime(h*60+m));
const DAYS = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const srcLabel = s => ({app:"App",whatsapp:"WhatsApp",telefono:"Tel.",manuale:"Manuale",passaparola:"Passaparola"})[s]||"";
const BETA_DAYS = 92;

/* DATA */
const SVCS0 = [
  {id:1,name:"Taglio donna",price:35,min:45,active:true},
  {id:2,name:"Colore e taglio",price:90,min:120,active:true},
  {id:3,name:"Piega",price:20,min:30,active:true},
  {id:4,name:"Cheratina",price:120,min:90,active:true},
  {id:5,name:"Taglio uomo",price:25,min:30,active:true},
  {id:6,name:"Taglio + barba",price:35,min:60,active:true},
  {id:7,name:"Manicure",price:30,min:45,active:true},
];
const STAFF0 = [
  {id:1,name:"Sofia M.",role:"Colorista",emoji:"👩‍🦰",services:[2,4],schedule:"Lun-Ven 09-18"},
  {id:2,name:"Marco B.",role:"Stilista",emoji:"👨‍🎤",services:[1,3,5,6],schedule:"Mar-Sab 10-19"},
  {id:3,name:"Martina P.",role:"Estetista",emoji:"💅",services:[7],schedule:"Lun-Sab 09-15"},
];
const CLIENTS0 = [
  {id:1,name:"Martina Rossi",phone:"333 1234567",visits:12,lastVisit:"3 giorni fa",totalSpent:420,note:"Allergia nichel.",rating:5},
  {id:2,name:"Marco Neri",phone:"347 9876543",visits:8,lastVisit:"1 sett. fa",totalSpent:200,note:"Taglio classico.",rating:5},
  {id:3,name:"Sofia Verdi",phone:"",visits:3,lastVisit:"Oggi",totalSpent:270,note:"Evitare ossidanti.",rating:4},
  {id:4,name:"Giulia Ferrari",phone:"389 5554433",visits:5,lastVisit:"2 sett. fa",totalSpent:150,note:"",rating:5},
  {id:5,name:"Sara Conti",phone:"347 1122334",visits:15,lastVisit:"Ieri",totalSpent:890,note:"Allergia glutine.",rating:4},
];
// Chiave data ISO relativa a oggi (n giorni fa) — usata per lo storico realistico
const _dAgo = (n) => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const APPTS0 = [
  // Oggi / imminenti
  {id:1,staffId:1,date:"oggi",time:"09:00",clientId:1,serviceId:3,status:"completato",source:"app",note:""},
  {id:2,staffId:2,date:"oggi",time:"10:00",clientId:2,serviceId:5,status:"confermato",source:"telefono",note:"Taglio corto"},
  {id:3,staffId:1,date:"oggi",time:"11:00",clientId:3,serviceId:2,status:"confermato",source:"app",note:""},
  {id:4,staffId:3,date:"oggi",time:"12:00",clientId:4,serviceId:7,status:"in attesa",source:"whatsapp",note:"Prima visita"},
  {id:5,staffId:2,date:"oggi",time:"14:00",clientId:5,serviceId:4,status:"confermato",source:"app",note:"Allergia glutine"},
  {id:6,staffId:1,date:"oggi",time:"16:00",clientId:1,serviceId:3,status:"in attesa",source:"passaparola",note:""},
  {id:8,staffId:1,date:"ieri",time:"09:30",clientId:2,serviceId:2,status:"completato",source:"app",note:""},
  // Storico completato (visite passate) — così visite/speso/ultima sono coerenti
  {id:101,staffId:1,date:_dAgo(9), time:"10:00",clientId:1,serviceId:2,status:"completato",source:"app",note:""},
  {id:102,staffId:1,date:_dAgo(23),time:"11:30",clientId:1,serviceId:1,status:"completato",source:"telefono",note:""},
  {id:103,staffId:1,date:_dAgo(44),time:"15:00",clientId:1,serviceId:3,status:"completato",source:"app",note:""},
  {id:104,staffId:2,date:_dAgo(12),time:"09:30",clientId:2,serviceId:6,status:"completato",source:"app",note:""},
  {id:105,staffId:2,date:_dAgo(27),time:"18:00",clientId:2,serviceId:5,status:"completato",source:"passaparola",note:""},
  {id:106,staffId:1,date:_dAgo(6), time:"16:30",clientId:3,serviceId:1,status:"completato",source:"app",note:""},
  {id:107,staffId:3,date:_dAgo(31),time:"14:00",clientId:3,serviceId:7,status:"completato",source:"app",note:""},
  {id:108,staffId:3,date:_dAgo(18),time:"11:00",clientId:4,serviceId:7,status:"completato",source:"whatsapp",note:""},
  {id:109,staffId:2,date:_dAgo(3), time:"10:30",clientId:5,serviceId:4,status:"completato",source:"app",note:""},
  {id:110,staffId:2,date:_dAgo(20),time:"17:00",clientId:5,serviceId:2,status:"completato",source:"app",note:""},
  {id:111,staffId:2,date:_dAgo(38),time:"09:00",clientId:5,serviceId:1,status:"completato",source:"telefono",note:""},
  {id:112,staffId:2,date:_dAgo(55),time:"15:30",clientId:5,serviceId:4,status:"completato",source:"app",note:""},
];
const HOURS0 = {open:"09:00",close:"19:00",days:[1,2,3,4,5,6],perDay:{}};

const ALL_PROS = [
  {id:1,name:"Salon Elite",handle:"salonelite",cat:"Capelli",catId:"parrucchiere",city:"Milano",lat:45.4642,lng:9.1900,subscribed:true,emoji:"✂️",accent:"#C9A96E",bio:"Dal 2010 il tuo salone di fiducia.",rating:4.9,reviews:128,followers:340,verified:true,services:[{id:1,name:"Taglio donna",min:45,price:35},{id:2,name:"Colore e taglio",min:120,price:90},{id:3,name:"Piega",min:30,price:20}],slots:["09:00","10:30","12:00","15:00","16:30"]},
  {id:2,name:"BarberKing",handle:"barberking",cat:"Barba",catId:"barbiere",city:"Milano",lat:45.4773,lng:9.1815,subscribed:true,emoji:"🪒",accent:"#2C3E50",bio:"Taglio e barba senza fretta.",rating:4.7,reviews:89,followers:210,verified:true,services:[{id:1,name:"Taglio uomo",min:30,price:18},{id:2,name:"Taglio + barba",min:50,price:28}],slots:["09:30","11:00","14:00","15:30","17:00"]},
  {id:3,name:"Nails by Sofia",handle:"nailsbysofia",cat:"Nail Art",catId:"nail_artist",city:"Roma",lat:41.9028,lng:12.4964,subscribed:true,emoji:"💅",accent:"#C2185B",bio:"Nail art su misura.",rating:5.0,reviews:204,followers:680,verified:true,services:[{id:1,name:"Gel mani",min:60,price:45},{id:2,name:"Nail art",min:90,price:75}],slots:["10:00","12:00","14:30","16:00"]},
  {id:4,name:"Armonia Spa",handle:"armoniabeauty",cat:"Estetica",catId:"estetista",city:"Torino",lat:45.0703,lng:7.6869,subscribed:true,emoji:"🌿",accent:"#2E7D5E",bio:"Trattamenti viso e corpo.",rating:4.8,reviews:156,followers:290,verified:false,services:[{id:1,name:"Pulizia viso",min:60,price:55}],slots:["09:00","11:00","14:00","16:00"]},
  {id:5,name:"Bella Chioma",handle:"bellachioma",cat:"Capelli",catId:"parrucchiere",city:"Milano",lat:45.4654,lng:9.1859,subscribed:true,emoji:"✂️",accent:"#E91E8C",bio:"Specialisti in capelli ricci.",rating:4.6,reviews:78,followers:145,verified:false,services:[{id:1,name:"Taglio ricci",min:60,price:45}],slots:["09:30","11:30","14:30","16:30"]},
  {id:6,name:"Ink and Soul",handle:"inkandsoul",cat:"Tattoo",catId:"tatuatore",city:"Bologna",lat:44.4949,lng:11.3426,subscribed:true,emoji:"🎨",accent:"#4527A0",bio:"Blackwork e watercolor.",rating:4.9,reviews:312,followers:890,verified:true,services:[{id:1,name:"Consulenza",min:30,price:0},{id:2,name:"Tatuaggio",min:120,price:180}],slots:["10:00","14:00","16:00"]},
];
const CITY_COORDS = {
  "Imperia":{lat:43.8896,lng:7.9854},
  "Milano":{lat:45.4642,lng:9.1900},
  "Roma":{lat:41.9028,lng:12.4964},
  "Torino":{lat:45.0703,lng:7.6869},
  "Bologna":{lat:44.4949,lng:11.3426},
  "Genova":{lat:44.4056,lng:8.9463},
  "Sanremo":{lat:43.8159,lng:7.7758},
  "Savona":{lat:44.3094,lng:8.4805},
};
const DEFAULT_COORDS = CITY_COORDS["Milano"];

const MY_APPTS0 = [
  {id:1,pro:"Salon Elite",service:"Colore e taglio",date:"Oggi",time:"15:00",price:90,status:"confermato",proObj:ALL_PROS[0]},
  {id:2,pro:"Nails by Sofia",service:"Gel mani",date:"Ven 20 giu",time:"12:00",price:45,status:"confermato",proObj:ALL_PROS[2]},
  {id:3,pro:"Salon Elite",service:"Piega",date:"3 giu 2026",time:"11:00",price:20,status:"completato",proObj:ALL_PROS[0]},
  {id:4,pro:"BarberKing",service:"Taglio uomo",date:"28 mag",time:"10:00",price:18,status:"completato",proObj:ALL_PROS[1]},
  {id:5,pro:"Nails by Sofia",service:"Nail art",date:"15 mag",time:"14:00",price:75,status:"cancellato",proObj:ALL_PROS[2]},
];

/* CONVERSAZIONI / CHAT — DM stile Vinted con offerte di lavoro su misura */
const CONVERSATIONS0 = [
  {
    id:1, proId:1, clientName:"Alessio",
    messages:[
      {id:1, from:"client", type:"text", text:"Ciao! Avrei un colore particolare da fare, balayage + tonalizzante. Riusciamo a concordare?", time:"10:02"},
      {id:2, from:"pro", type:"text", text:"Ciao Alessio! Certo. Per quel lavoro ci vogliono circa 2 ore. Ora ti mando una proposta su misura con la valigetta 👇", time:"10:05"},
    ],
  },
  {
    id:2, proId:3, clientName:"Alessio",
    messages:[
      {id:1, from:"client", type:"text", text:"Salve, vorrei una nail art elaborata per un matrimonio 💅", time:"Ieri"},
      {id:2, from:"pro", type:"text", text:"Che bello! Mandami pure l'idea, intanto ti preparo un preventivo.", time:"Ieri"},
    ],
  },
];

const ALL_CITIES = ["Imperia","Milano","Roma","Torino","Bologna","Genova","Sanremo","Savona"];
// Elenco città italiane selezionabili (no testo libero nel profilo).
// Copre i capoluoghi e i comuni principali, con dettaglio sul Ponente ligure.
const IT_CITIES = [
  "Agrigento","Alessandria","Ancona","Aosta","Arezzo","Ascoli Piceno","Asti","Avellino","Bari","Barletta",
  "Belluno","Benevento","Bergamo","Biella","Bologna","Bolzano","Brescia","Brindisi","Cagliari","Caltanissetta",
  "Campobasso","Caserta","Catania","Catanzaro","Chieti","Como","Cosenza","Cremona","Crotone","Cuneo",
  "Enna","Fermo","Ferrara","Firenze","Foggia","Forlì","Frosinone","Genova","Gorizia","Grosseto",
  "Imperia","Isernia","La Spezia","L'Aquila","Latina","Lecce","Lecco","Livorno","Lodi","Lucca",
  "Macerata","Mantova","Massa","Matera","Messina","Milano","Modena","Monza","Napoli","Novara",
  "Nuoro","Oristano","Padova","Palermo","Parma","Pavia","Perugia","Pesaro","Pescara","Piacenza",
  "Pisa","Pistoia","Pordenone","Potenza","Prato","Ragusa","Ravenna","Reggio Calabria","Reggio Emilia","Rieti",
  "Rimini","Roma","Rovigo","Salerno","Sassari","Savona","Siena","Siracusa","Sondrio","Taranto",
  "Teramo","Terni","Torino","Trapani","Trento","Treviso","Trieste","Udine","Varese","Venezia",
  "Verbania","Vercelli","Verona","Vibo Valentia","Vicenza","Viterbo",
  // Ponente ligure e zona Imperia
  "Sanremo","Ventimiglia","Bordighera","Taggia","Arma di Taggia","Ospedaletti","Diano Marina","Dolcedo",
  "Camporosso","Vallecrosia","Riva Ligure","Santo Stefano al Mare","San Bartolomeo al Mare","Cervo","Andora",
  "Alassio","Albenga","Loano","Pietra Ligure","Finale Ligure","Varazze","Chiavari","Rapallo","Sestri Levante",
  // Altri comuni molto popolati
  "Giugliano in Campania","Sesto San Giovanni","Guidonia Montecelio","Cinisello Balsamo","Aprilia","Carpi",
  "Pomezia","Bolzano","Quartu Sant'Elena","Marano di Napoli","Gela","Acireale","Bitonto","Ercolano",
  "Portici","Casoria","Afragola","Marsala","Vittoria","Cesena","Faenza","Legnano","Rho","Gallarate",
  "Busto Arsizio","Seregno","Desio","Lissone","San Giovanni in Persiceto","Fiumicino","Tivoli","Velletri",
  "Anzio","Nettuno","Grugliasco","Moncalieri","Collegno","Rivoli","Settimo Torinese","Nichelino","Chieri",
];

const CAT_LIST = [
  {id:"barbiere",    emoji:"💈",label:"Barbiere",    color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"parrucchiere",emoji:"💇",label:"Capelli",     color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"nail_artist", emoji:"💅",label:"Unghie",      color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"estetista",   emoji:"🧖",label:"Estetica",    color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"laser",       emoji:"✨",label:"Laser",       color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"tatuatore",   emoji:"🖋",label:"Tattoo",      color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"ciglia",      emoji:"👁",label:"Ciglia",      color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"makeup",      emoji:"💄",label:"Make-up",     color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
  {id:"massaggio",   emoji:"💆",label:"Massaggi",    color:"#5A4A3A",bg:"#EDE8E2",grad:"linear-gradient(145deg,#EDE8E2,#E0D8CE)"},
];

// Macro-categorie home (6 voci) — ciascuna raggruppa più catId dei professionisti
const MI = id => `https://images.unsplash.com/photo-${id}?w=360&h=440&fit=crop&crop=center&auto=format&q=80`;
const MACRO_CATS = [
  {id:"capelli_barba", label:"Capelli\n& Barba", catIds:["parrucchiere","barbiere"],            color:"#D4791A",bg:"#FFF0E0",shadowColor:"rgba(212,121,26,.18)", emoji:"✂️",  count:"1200+", img:MI("1560066984-138dadb4c035")},
  {id:"unghie",        label:"Unghie",           catIds:["nail_artist"],                         color:"#D4487A",bg:"#FFE6F1",shadowColor:"rgba(212,72,122,.18)",emoji:"💅",  count:"800+",  img:MI("1604654894610-df63bc536371")},
  {id:"estetica",      label:"Estetica",         catIds:["estetista","ciglia","makeup","laser"], color:"#8B52E0",bg:"#EDE8FF",shadowColor:"rgba(139,82,224,.18)",emoji:"✨",  count:"1500+", img:MI("1570172619644-dfd03ed5d881")},
  {id:"benessere",     label:"Benessere",        catIds:["massaggio"],                           color:"#1E9E6E",bg:"#E0F5EC",shadowColor:"rgba(30,158,110,.18)", emoji:"🌿",  count:"600+",  img:MI("1544161515-4ab6ce6db874")},
  {id:"tattoo",        label:"Tattoo",           catIds:["tatuatore"],                           color:"#3869D8",bg:"#E4ECFF",shadowColor:"rgba(56,105,216,.18)", emoji:"🖋️", count:"300+",  img:MI("1611501275019-9b5cda994e8d")},
  {id:"altro",         label:"Altro",            catIds:[],                                      color:"#9B6E3A",bg:"#F5EDDE",shadowColor:"rgba(155,110,58,.18)",  emoji:"⭐",  count:"",      img:MI("1522337360788-8b13dee7a37e")},
];

// ══════════════════════════════════════════════════════════
// SISTEMA AVATAR BEAUTY — identità digitale dell'utente
// ══════════════════════════════════════════════════════════
const AVATAR_DEFAULT = {
  skin:"#F5CBA7", hairColor:"#3D1C02", hairStyle:0,
  beardStyle:0, eyeColor:"#5C3317", browStyle:0,
  glasses:0, earrings:0, hat:0, outfit:0, outfitColor:"#F06B9D",
};
const AV_SKINS = [
  {v:"#FDEBD0",l:"Alba"},{v:"#F5CBA7",l:"Pesca"},{v:"#E8A87C",l:"Ambra"},
  {v:"#C9956C",l:"Dorata"},{v:"#A0693A",l:"Miele"},{v:"#7B4F2E",l:"Cioccolato"},{v:"#4A2C17",l:"Ebano"},
];
const AV_HAIR_COLORS = [
  "#1A0A00","#3D1C02","#7B4019","#A0522D","#C8A96E",
  "#E8D4A0","#D4484A","#8B008B","#4169E1","#808080","#F5F5F5",
];
const AV_EYE_COLORS = [
  "#3D1C02","#7B4019","#2D6A4F","#4A7BF7","#87CEEB","#708090","#8B6914",
];
const AV_OUTFIT_COLORS = [
  "#F06B9D","#4A7BF7","#22C483","#F59E0B","#8B52E0","#0D0D0E","#6B7280","#FFFFFF",
];
const AV_HAIR_LABELS = ["Corto","Onde","Lungo","Ricci","Bob","Rasato"];
const AV_BEARD_LABELS = ["Nessuna","Leggera","Pizzetto","Piena","Baffi"];
const AV_GLASSES_LABELS = ["Nessuno","Tondi","Rettangolari","Cat-eye"];
const AV_EARRING_LABELS = ["Nessuno","Studs","Cerchi","Pendenti"];
const AV_HAT_LABELS = ["Nessuno","Cappellino","Beanie"];
const AV_OUTFIT_LABELS = ["T-shirt","Blazer","Felpa","Abito"];

/* Accento app fisso sul nero (nessuna opzione di cambio colore) */
try { applyAccent("nero"); } catch(e){ applyAccent("nero"); }

const FEED = [
  {id:1,proId:3,cat:"Nail Art",img:U("nail art manicure"),caption:"Nail art floreale 🌸",tags:["#nailart"],likes:312},
  {id:2,proId:1,cat:"Capelli",img:U("balayage hair color salon"),caption:"Balayage dorato ✨",tags:["#balayage"],likes:387},
  {id:3,proId:2,cat:"Barba",img:U("barbershop fade haircut men"),caption:"Fade perfetto 🪒",tags:["#fade"],likes:241},
  {id:4,proId:1,cat:"Capelli",img:U("bob haircut women salon"),caption:"Bob texturizzato 🔥",tags:["#bob"],likes:294},
];

/* MICRO UI */
const Div = () => <div style={{height:1,background:T.line}}/>;
const DivP = () => <div style={{height:1,background:T.line,margin:"0 18px"}}/>;
const Pill = ({label,style}) => <span style={{display:"inline-flex",alignItems:"center",padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:600,...style}}>{label}</span>;
const BigBtn = ({label,onClick,variant="dark",disabled,style}) => (
  <button onClick={onClick} disabled={disabled} className={disabled?"":"btn-apple"} style={{width:"100%",padding:"16px 0",borderRadius:18,cursor:disabled?"default":"pointer",fontSize:16,fontWeight:700,background:"#FFFFFF",border:"1.5px solid #E5E5EA",color:"#111111",boxShadow:"0 1px 3px rgba(0,0,0,.05)",opacity:disabled?.45:1,fontFamily:"inherit",...style}}>{label}</button>
);
const Btn = ({label,onClick,style}) => (
  <button onClick={onClick} className="clay-soft" style={{padding:"9px 16px",borderRadius:15,border:"none",background:T.white,cursor:"pointer",fontSize:13,fontWeight:700,color:T.inkMid,fontFamily:"inherit",...style}}>{label}</button>
);
const BackBtn = ({onClick}) => (
  <button onClick={onClick} style={{background:"none",border:"none",cursor:"pointer",padding:"6px 0",display:"inline-flex",alignItems:"center",gap:6,color:T.ink,fontSize:14,fontWeight:500,fontFamily:"inherit"}}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
    Indietro
  </button>
);
function Modal({title,onClose,children}) {
  // Lock robusto dello sfondo per iOS: fisso il body così NON può scorrere dietro,
  // e lascio scorrere solo il contenuto del modale. Ripristino la posizione alla chiusura.
  useEffect(()=>{
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const b = document.body.style;
    const prev = {position:b.position, top:b.top, left:b.left, right:b.right, width:b.width, overflow:b.overflow};
    b.position="fixed"; b.top=`-${y}px`; b.left="0"; b.right="0"; b.width="100%"; b.overflow="hidden";
    return ()=>{ Object.assign(b, prev); window.scrollTo(0, y); };
  },[]);
  // Portale su <body>: il modale esce dal contenitore .bg-alive (che schiaccia gli
  // z-index dei figli a 1) così copre davvero nav, FAB e banner invece di finirci sotto.
  return createPortal(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.paper,borderRadius:"32px 32px 0 0",width:"100%",maxWidth:430,margin:"0 auto",maxHeight:"90dvh",display:"flex",flexDirection:"column",minHeight:0}}>
        <div style={{background:T.paper,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px 10px",borderRadius:"32px 32px 0 0"}}>
          <h2 style={{fontSize:18,fontWeight:900,color:T.ink,margin:0}}>{title}</h2>
          <button onClick={onClose} className="clay-soft" style={{background:T.white,border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:15,color:T.inkMid}}>x</button>
        </div>
        <div style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",touchAction:"pan-y",padding:"4px 20px calc(28px + env(safe-area-inset-bottom,0px))"}}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* Selettore CITTÀ — solo città esistenti (niente testo libero).
   Suggerimenti locali istantanei (Italia) + ricerca reale in tutto il mondo (OpenStreetMap).
   Il valore si imposta solo scegliendo una città dai risultati. */
function CityPicker({value, onChange, placeholder="Seleziona città"}) {
  const [open,setOpen] = useState(false);
  const [q,setQ] = useState("");
  const [remote,setRemote] = useState([]);
  const [loading,setLoading] = useState(false);
  const query = q.trim();

  // Ricerca mondiale con debounce (parte da 2 caratteri)
  useEffect(()=>{
    if(!open || query.length<2){ setRemote([]); setLoading(false); return; }
    let cancelled=false; setLoading(true);
    const t=setTimeout(async()=>{
      const r = await searchCities(query);
      if(!cancelled){ setRemote(r); setLoading(false); }
    }, 350);
    return ()=>{ cancelled=true; clearTimeout(t); };
  },[query,open]);

  // Match locali su TUTTI i comuni italiani (istantaneo, offline). Prima chi inizia con
  // la query, poi chi la contiene. In coda i risultati mondiali (OpenStreetMap).
  const ql = query.toLowerCase();
  let local = [];
  if(query.length>=1){
    const starts=[], incl=[];
    for(const [nome,prov] of IT_COMUNI){
      const nl=nome.toLowerCase();
      if(nl.startsWith(ql)) starts.push({name:nome,sub:prov?`${prov}, Italia`:"Italia"});
      else if(nl.includes(ql)) incl.push({name:nome,sub:prov?`${prov}, Italia`:"Italia"});
    }
    local = [...starts, ...incl].slice(0,60);
  } else {
    local = IT_CITIES.slice(0,20).map(c=>({name:c,sub:"Italia"}));
  }
  const seen = new Set(); const items = [];
  local.forEach(c=>{ const k=c.name.toLowerCase(); if(!seen.has(k)){ seen.add(k); items.push(c); } });
  remote.forEach(r=>{ const k=r.name.toLowerCase(); if(!seen.has(k)){ seen.add(k); items.push(r); } });

  return (
    <>
      <button type="button" onClick={()=>{setQ("");setRemote([]);setOpen(true);}} style={{width:"100%",boxSizing:"border-box",display:"flex",alignItems:"center",gap:8,padding:"9px 11px",borderRadius:8,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        <span style={{flex:1,fontSize:14,color:value?T.ink:T.inkSoft,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value||placeholder}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <Modal title="Scegli città" onClose={()=>setOpen(false)}>
          <div style={{display:"flex",alignItems:"center",gap:8,background:T.surface,borderRadius:12,padding:"11px 13px",marginBottom:10,border:`1.5px solid ${T.line}`}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca una città nel mondo…" style={{flex:1,border:"none",outline:"none",background:"none",fontSize:15,color:T.ink,fontFamily:"inherit"}}/>
            {q && <button onClick={()=>setQ("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.inkSoft,padding:0}}>×</button>}
          </div>
          {loading && <p style={{fontSize:12,color:T.inkSoft,margin:"0 0 8px 4px"}}>Ricerca in corso…</p>}
          {items.length===0 && !loading
            ? <div style={{textAlign:"center",padding:"28px 0"}}><p style={{fontSize:28,marginBottom:6}}>🔎</p><p style={{fontSize:13,color:T.inkSoft,margin:0}}>{query.length<2?"Scrivi almeno 2 lettere":"Nessuna città trovata"}</p></div>
            : items.map((c,i)=>{
                const sel = value===c.name;
                return (
                  <button key={c.name+i} onClick={()=>{onChange(c.name);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 12px",borderRadius:12,border:"none",background:sel?T.brandBg:"transparent",cursor:"pointer",fontFamily:"inherit",textAlign:"left",marginBottom:2}}>
                    <span style={{fontSize:16,flexShrink:0}}>📍</span>
                    <span style={{flex:1,minWidth:0}}>
                      <span style={{display:"block",fontSize:15,fontWeight:sel?800:600,color:T.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                      {c.sub && <span style={{display:"block",fontSize:11,color:T.inkSoft,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.sub}</span>}
                    </span>
                    {sel && <svg width="17" height="17" viewBox="0 0 24 24" style={{flexShrink:0}}><circle cx="12" cy="12" r="10" fill={T.brand}/><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/></svg>}
                  </button>
                );
              })}
          <p style={{fontSize:9,color:T.inkSoft,textAlign:"center",margin:"10px 0 0"}}>Ricerca fornita da OpenStreetMap</p>
        </Modal>
      )}
    </>
  );
}
/* Dialog di conferma compatto e minimal — centrato */
const ConfirmDialog = ({title,message,confirmLabel="Conferma",cancelLabel="Annulla",danger=false,onConfirm,onCancel}) => (
  <div onClick={onCancel} style={{position:"fixed",inset:0,background:"rgba(43,34,24,.4)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(3px)"}}>
    <div onClick={e=>e.stopPropagation()} className="ba-pop" style={{background:T.paper,borderRadius:22,width:"100%",maxWidth:300,padding:"22px 20px 16px",boxShadow:"0 20px 50px rgba(43,34,24,.25)",textAlign:"center"}}>
      <p style={{fontSize:16,fontWeight:700,color:T.ink,margin:"0 0 6px"}}>{title}</p>
      {message && <p style={{fontSize:13,color:T.inkMid,margin:"0 0 18px",lineHeight:1.45}}>{message}</p>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:"11px 0",borderRadius:13,border:`1.5px solid ${T.line}`,background:T.white,color:T.inkMid,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{cancelLabel}</button>
        <button onClick={onConfirm} style={{flex:1,padding:"11px 0",borderRadius:13,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",background:danger?"linear-gradient(135deg,#C0705A,#A0503C)":T.grad}}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);
const Photo = ({src,style}) => {
  const [e,sE] = useState(false);
  return e||!src
    ? <div style={{background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",...style}}><LogoMark size={32} color="rgba(255,255,255,.95)"/></div>
    : <img src={src} loading="lazy" decoding="async" onError={()=>sE(true)} style={{objectFit:"cover",display:"block",...style}} alt=""/>;
};
const Av = ({pro,size=40,fs=18}) => (
  <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,position:"relative",background:`${pro.accent}22`,border:`1.5px solid ${pro.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:fs}}>
    {pro.emoji}
    {pro.verified && (
      <div style={{position:"absolute",bottom:0,right:0,width:Math.max(12,size*.22),height:Math.max(12,size*.22),borderRadius:"50%",background:T.green,border:`2px solid ${T.white}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
      </div>
    )}
  </div>
);

/* MAPPA INTERATTIVA — Leaflet + OpenStreetMap, gratuita e senza API key */
function MapView({pros,center,onSelectPro,onMapMove,dark,height=320}) {
  const ref = useRef(null);
  const [failed,setFailed] = useState(false);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const tileRef = useRef(null);
  const userMarkerRef = useRef(null);
  const mountedCenterRef = useRef(center);
  const prosRef = useRef(pros);
  const fitAllRef = useRef(null);
  prosRef.current = pros;

  const renderMarkers = (L) => {
    if (!clusterRef.current) return;
    clusterRef.current.clearLayers();
    prosRef.current.forEach(pro => {
      const marker = L.marker([pro.lat,pro.lng], {icon:proPinIcon(L,pro)});
      const avail = pro.id % 3 !== 0;
      const dist = pro.distKm!=null ? (pro.distKm<1?`${Math.round(pro.distKm*1000)} m`:`${pro.distKm.toFixed(1)} km`) : "";
      marker.bindTooltip(
        `<div style="text-align:center;line-height:1.35"><b style="font-size:13px">${pro.emoji} ${pro.name}</b><br/><span style="color:#F59E0B;font-weight:700">★ ${pro.rating}</span>${dist?` · ${dist}`:""}${avail?`<br/><span style="color:#22C483;font-weight:700">🟢 Disponibile oggi</span>`:""}</div>`,
        {direction:"top",offset:[0,-46],opacity:1}
      );
      marker.on("click", () => onSelectPro(pro));
      clusterRef.current.addLayer(marker);
    });
  };

  // Inquadra tutti i professionisti (+ la posizione utente)
  const fitAll = () => {
    const map = mapRef.current; if(!map) return;
    const pts = prosRef.current.map(p=>[p.lat,p.lng]);
    if (mountedCenterRef.current) pts.push([mountedCenterRef.current.lat,mountedCenterRef.current.lng]);
    if (pts.length>=1) {
      try { map.fitBounds(pts, {padding:[55,55], maxZoom:14}); } catch(e){}
    }
  };
  fitAllRef.current = fitAll;

  // Crea la mappa una sola volta
  useEffect(() => {
    let cancelled = false;
    loadMarkerCluster().then(L => {
      if (cancelled || !ref.current) return;
      const map = L.map(ref.current, {zoomControl:true, attributionControl:true}).setView([center.lat,center.lng], 12);
      mapRef.current = map;
      const tiles = dark ? TILE_LAYERS.dark : TILE_LAYERS.light;
      tileRef.current = L.tileLayer(tiles.url, {maxZoom:20, attribution:tiles.attribution, subdomains:tiles.subdomains||"abc"}).addTo(map);
      clusterRef.current = L.markerClusterGroup({
        maxClusterRadius:50,
        iconCreateFunction: cluster => L.divIcon({
          html:`<div style="background:${T.brand};color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;font-family:inherit;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${cluster.getChildCount()}</div>`,
          className:"", iconSize:[40,40],
        }),
      }).addTo(map);
      renderMarkers(L);
      userMarkerRef.current = L.marker([center.lat,center.lng], {icon:userDotIcon(L), zIndexOffset:1000, interactive:false}).addTo(map);
      // Inquadra subito tutti i locali vicini
      setTimeout(()=>{ if(!cancelled) fitAllRef.current && fitAllRef.current(); }, 250);
      map.on("moveend", () => {
        const c = map.getCenter();
        // Segna il centro come "già applicato" così l'effetto di ricentraggio non forza lo zoom
        mountedCenterRef.current = {lat:c.lat,lng:c.lng};
        onMapMove && onMapMove({lat:c.lat,lng:c.lng});
      });
    }).catch(()=>setFailed(true));

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggiorna i marker quando cambia la lista di professionisti, senza ricreare la mappa
  useEffect(() => {
    if (!clusterRef.current) return;
    loadLeaflet().then(renderMarkers);
  }, [pros]);

  // Cambia tile quando si passa da chiaro a scuro
  useEffect(() => {
    if (!mapRef.current) return;
    loadLeaflet().then(L => {
      if (tileRef.current) mapRef.current.removeLayer(tileRef.current);
      const tiles = dark ? TILE_LAYERS.dark : TILE_LAYERS.light;
      tileRef.current = L.tileLayer(tiles.url, {maxZoom:20, attribution:tiles.attribution, subdomains:tiles.subdomains||"abc"});
      tileRef.current.addTo(mapRef.current);
    });
  }, [dark]);

  // Ricentra se la posizione di riferimento cambia dall'esterno (nuova città/geolocalizzazione)
  useEffect(() => {
    if (mountedCenterRef.current.lat===center.lat && mountedCenterRef.current.lng===center.lng) return;
    mountedCenterRef.current = center;
    if (!mapRef.current || !userMarkerRef.current) return;
    mapRef.current.setView([center.lat,center.lng], 12);
    userMarkerRef.current.setLatLng([center.lat,center.lng]);
  }, [center]);

  if (failed) {
    return (
      <div style={{height,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#E8F0E8"}}>
        <p style={{fontSize:13,color:T.inkSoft,margin:0,padding:"0 20px",textAlign:"center"}}>Mappa non disponibile (controlla la connessione internet)</p>
      </div>
    );
  }

  return (
    <div style={{position:"relative",height,width:"100%"}}>
      <div ref={ref} style={{height,width:"100%",background:"#EDF1F5"}}/>
      {/* Pulsante: inquadra tutti i locali */}
      <button onClick={()=>fitAllRef.current&&fitAllRef.current()} style={{position:"absolute",right:12,bottom:16,zIndex:500,display:"flex",alignItems:"center",gap:6,padding:"9px 14px",borderRadius:999,border:"1.5px solid #E5E5EA",background:"rgba(255,255,255,.96)",backdropFilter:"blur(8px)",cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:700,color:"#111111",boxShadow:"0 3px 12px rgba(0,0,0,.14)"}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3"/></svg>
        Mostra tutti
      </button>
    </div>
  );
}

const DIST_OPTIONS = [5,10,20,50,Infinity];

/* BROWSE PROFESSIONISTI — toggle Lista/Mappa, filtro distanza, card prenotazione su marker */
function BrowsePros({catId,catLabel,catColor,city,onBack,onChangeCity,pros,radius,setRadius,viewMode,setViewMode,searchCenter,onMapMove,selectedPro,setSelectedPro,darkMap,setDarkMap,onSelectPro,onBook}) {
  return (
    <div>
      {/* Header */}
      <div style={{padding:"0 20px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button onClick={onBack} style={{width:38,height:38,borderRadius:10,background:T.surface,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{flex:1}}>
            <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 1px"}}>{city}</p>
            <h2 style={{fontSize:19,fontWeight:700,color:T.ink,margin:0}}>{catLabel}</h2>
          </div>
          <button onClick={onChangeCity} style={{padding:"6px 11px",borderRadius:99,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontSize:12,fontWeight:600,color:T.inkMid,fontFamily:"inherit"}}>
            {city}
          </button>
        </div>

        {/* Toggle Lista / Mappa */}
        <div className="clay-inset" style={{display:"flex",background:T.surface,borderRadius:14,padding:4,gap:2,marginBottom:12}}>
          {[["lista","☰  Lista"],["mappa","📍  Mappa"]].map(([v,l]) => (
            <button key={v} onClick={()=>setViewMode(v)} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:viewMode===v?700:500,background:viewMode===v?T.ink:"transparent",color:viewMode===v?T.white:T.inkMid,fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>

        {/* Filtro distanza a chip */}
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none"}}>
          {DIST_OPTIONS.map(d => (
            <button key={d} onClick={()=>setRadius(d)} style={{flexShrink:0,padding:"7px 13px",borderRadius:99,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:radius===d?T.ink:T.white,color:radius===d?T.white:T.inkMid,fontFamily:"inherit",boxShadow:radius===d?"none":`0 0 0 1.5px ${T.line} inset`}}>
              {d===Infinity ? "Nessun limite" : `${d} km`}
            </button>
          ))}
        </div>
      </div>

      {pros.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div className="clay-soft" style={{width:66,height:66,borderRadius:22,background:`${catColor}1A`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><MacroCatIcon id={catId} size={30} color={catColor}/></div>
          <p style={{fontSize:17,fontWeight:700,color:T.ink,marginBottom:6}}>Nessun professionista trovato</p>
          <button onClick={()=>setRadius(Infinity)} className="btn-apple" style={{padding:"13px 26px",borderRadius:12,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Rimuovi il limite di distanza</button>
        </div>
      ) : viewMode==="lista" ? (
        <div style={{padding:"4px 20px 0",display:"flex",flexDirection:"column",gap:10}}>
          <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.8,margin:"6px 0 0"}}>{pros.length} risultati</p>
          {pros.map(pro => (
            <div key={pro.id} onClick={()=>onSelectPro(pro)} className="ba-lift ba-zoom clay" style={{background:T.white,borderRadius:20,cursor:"pointer",display:"flex",overflow:"hidden"}}>
              {(()=>{const cd=CAT_LIST.find(c=>c.id===pro.catId)||CAT_LIST[0];const ph=proImg(pro);return(
              <div style={{width:84,height:84,flexShrink:0,position:"relative",overflow:"hidden",background:cd.grad}}>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><CatIcon id={pro.catId} size={32} color="rgba(255,255,255,.55)" strokeWidth={1.5}/></div>
                {ph&&<img src={ph} alt={pro.name} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.currentTarget.style.display="none";}}/>}
                {pro.verified && <div style={{position:"absolute",bottom:5,left:5,width:16,height:16,borderRadius:"50%",background:T.green,border:`2px solid ${T.white}`,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg></div>}
              </div>);})()}
              <div style={{flex:1,padding:"11px 12px",display:"flex",flexDirection:"column",justifyContent:"space-between",minWidth:0}}>
                <div>
                  <p style={{fontSize:14,fontWeight:800,color:T.ink,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 3px"}}>{pro.distKm.toFixed(1)} km · Da {Math.min(...pro.services.map(s=>s.price))}€</p>
                  <span style={{color:"#C9A020",fontSize:11,fontWeight:700}}>★ {pro.rating} <span style={{color:T.inkSoft,fontWeight:500}}>({pro.reviews})</span></span>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
                  <span style={{fontSize:10,color:T.inkSoft}}>Prima disp. {pro.slots[0]}</span>
                  <button onClick={e=>{e.stopPropagation();onBook(pro);}} className="btn-apple ba-btn-bounce" style={{padding:"7px 15px",borderRadius:99,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Prenota</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{position:"relative"}}>
          <MapView pros={pros} center={searchCenter} onSelectPro={setSelectedPro} onMapMove={onMapMove} dark={darkMap} height={420}/>

          {/* Toggle dark/light mappa */}
          <button onClick={()=>setDarkMap(d=>!d)} style={{position:"absolute",top:12,right:12,width:38,height:38,borderRadius:11,background:T.white,border:"none",cursor:"pointer",boxShadow:"0 2px 10px rgba(0,0,0,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,zIndex:5}}>
            {darkMap ? "☀️" : "🌙"}
          </button>

          {/* Card professionista selezionato (marker cliccato) */}
          {selectedPro && (
            <div style={{position:"absolute",left:12,right:12,bottom:12,zIndex:10}}>
              <div style={{background:T.white,borderRadius:20,padding:"14px",boxShadow:"0 12px 34px rgba(0,0,0,.22)",display:"flex",gap:13,alignItems:"center"}}>
                {(()=>{const ph=proImg(selectedPro);return (
                  <div style={{width:62,height:62,borderRadius:16,overflow:"hidden",background:`${selectedPro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
                    {ph?<img src={ph} alt={selectedPro.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/>:selectedPro.emoji}
                  </div>);})()}
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:15.5,fontWeight:800,color:T.ink,margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedPro.name}</p>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    <span style={{color:"#F59E0B",fontSize:12.5,fontWeight:800}}>★ {selectedPro.rating}</span>
                    <span style={{color:T.inkSoft,fontSize:11.5}}>({selectedPro.reviews}) · 📍 {selectedPro.distKm<1?`${Math.round(selectedPro.distKm*1000)} m`:`${selectedPro.distKm.toFixed(1)} km`}</span>
                  </div>
                  {selectedPro.id%3!==0
                    ? <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10.5,fontWeight:800,color:"#22C483",background:"#ECFDF5",borderRadius:99,padding:"3px 9px"}}>🟢 Disponibile oggi · {selectedPro.slots[0]}</span>
                    : <span style={{fontSize:11,color:T.inkSoft}}>Prima disp. {selectedPro.slots[0]}</span>}
                </div>
                <button onClick={()=>setSelectedPro(null)} style={{position:"absolute",top:8,right:8,background:T.surface,border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:12}}>x</button>
              </div>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>onSelectPro(selectedPro)} style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:T.white,color:T.ink,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(0,0,0,.15)"}}>Profilo</button>
                <button onClick={()=>onBook(selectedPro)} className="btn-apple" style={{flex:2,padding:"13px 0",borderRadius:12,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>Prenota</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ICONS */
const IH = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.ink:"none"} stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
const IC = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" fill={a?T.ink:"none"}/></svg>;
const IK = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.3" fill={a?T.ink:T.inkSoft}/></svg>;
const IP = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IHeart = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a?"#E91E8C":"none"} stroke={a?"#E91E8C":T.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const IU = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
const IS = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.ink:"none"} stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const ICS = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>;
const IPlus = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;

/* LOGO — forbici (SVG custom, niente emoji) */
const LogoMark = ({size=22,color="#fff"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/>
    <line x1="20" y1="4" x2="8.5" y2="15.5"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="8.5" y1="8.5" x2="12" y2="12"/>
  </svg>
);

/* ICONE CATEGORIA — SVG line-art professionale */
const CAT_PATHS = {
  // Barbiere: rasoio a mano libera classico
  barbiere: <>
    <path d="M7 3h8l2 3H5L7 3z"/>
    <rect x="5" y="6" width="14" height="2.5" rx="1.2"/>
    <path d="M12 8.5V19"/>
    <path d="M9 19h6"/>
    <path d="M19 6.5c1 .8 1.5 1.8 1.5 3s-.5 2.2-1.5 3"/>
  </>,
  // Parrucchiere: forbici professionali
  parrucchiere: <>
    <circle cx="5.5" cy="6" r="2.2"/>
    <circle cx="5.5" cy="18" r="2.2"/>
    <path d="M7.5 7.2L20 17"/>
    <path d="M7.5 16.8L20 7"/>
    <line x1="14" y1="12" x2="16" y2="12" strokeWidth="2.5"/>
  </>,
  // Unghie: dito con smalto
  nail_artist: <>
    <path d="M9 14V9a3 3 0 016 0v5"/>
    <rect x="7" y="14" width="10" height="6" rx="2"/>
    <path d="M9 17h6"/>
    <path d="M12 3v2"/>
    <path d="M9.5 4l1 1.5"/>
    <path d="M14.5 4l-1 1.5"/>
  </>,
  // Estetica: viso con foglia / lotus
  estetista: <>
    <circle cx="12" cy="10" r="3.5"/>
    <path d="M12 13.5c0 3-2 5.5-2 5.5s-3-2.5-3-6c0-1.5.5-2.5 1.5-3"/>
    <path d="M12 13.5c0 3 2 5.5 2 5.5s3-2.5 3-6c0-1.5-.5-2.5-1.5-3"/>
    <path d="M12 3c-1.5 2-1.5 4.5 0 6.5"/>
  </>,
  // Laser: flash / energia
  laser: <>
    <path d="M13 2L4.5 13.5H11L9 22l10.5-12H13.5L13 2z"/>
  </>,
  // Tattoo: ago macchina
  tatuatore: <>
    <path d="M15 3h3a1 1 0 011 1v2a1 1 0 01-1 1h-3"/>
    <path d="M15 4.5H8a1 1 0 00-1 1v3a1 1 0 001 1h7"/>
    <path d="M10 9.5v8"/>
    <path d="M10 17.5l-1.5 1.5a1 1 0 000 1.4l.6.6"/>
    <circle cx="18" cy="18" r="1.5"/>
    <path d="M10.5 18.5l6 0"/>
  </>,
  // Ciglia: occhio stilizzato con ciglia
  ciglia: <>
    <path d="M3 12c2.5-4.5 5-7 9-7s6.5 2.5 9 7"/>
    <path d="M3 12c2.5 4.5 5 7 9 7s6.5-2.5 9-7"/>
    <circle cx="12" cy="12" r="2.5"/>
    <line x1="8" y1="6" x2="7" y2="3.5"/>
    <line x1="11.5" y1="5.2" x2="11" y2="2.5"/>
    <line x1="15" y1="6" x2="16" y2="3.5"/>
  </>,
  // Makeup: rossetto con rifinitura
  makeup: <>
    <rect x="9.5" y="12" width="5" height="8" rx="1.5"/>
    <path d="M9.5 15h5"/>
    <path d="M10.5 12V9c0-1.5.7-3 1.5-3s1.5 1.5 1.5 3v3"/>
    <path d="M9.5 8h5"/>
  </>,
  // Massaggio: mani aperte / palme
  massaggio: <>
    <path d="M8 12V8a1 1 0 012 0v4"/>
    <path d="M10 10V7a1 1 0 012 0v3"/>
    <path d="M12 10V7a1 1 0 012 0v3"/>
    <path d="M14 11V9a1 1 0 012 0v3"/>
    <path d="M8 12c0 3 1 5 4 6 3-1 4-3 4-6"/>
  </>,
};
const CatIcon = ({id,size=24,color="currentColor",strokeWidth=2.2}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {CAT_PATHS[id] || <circle cx="12" cy="12" r="8"/>}
  </svg>
);

/* Icone illustrate custom per le 6 macro-categorie — stile line-art premium del brand */
const MACRO_PATHS = {
  // Capelli & Barba — volto di profilo con capelli e barba
  capelli_barba: <>
    <path d="M8 21v-2.3"/>
    <path d="M16 21v-2.3"/>
    <path d="M7 11.5C7 8.4 9.2 6 12 6s5 2.4 5 5.5v1.2c0 2.6-1.6 4.7-4 5.4-.3.1-.6.1-1 .1s-.7 0-1-.1c-2.4-.7-4-2.8-4-5.4v-1.2z"/>
    <path d="M7 12c-1.3-1.6-1.6-4-.5-6C7.7 3.8 9.7 3 12 3s4.3.8 5.5 3c1.1 2 .8 4.4-.5 6"/>
    <path d="M9.5 18.2c.6.9 1.5 1.4 2.5 1.4s1.9-.5 2.5-1.4"/>
    <circle cx="9.7" cy="12" r=".5" fill="currentColor" stroke="none"/>
    <circle cx="14.3" cy="12" r=".5" fill="currentColor" stroke="none"/>
  </>,
  // Unghie — mano elegante con unghia curata
  unghie: <>
    <path d="M7 20v-6.5C7 12 8 11 9.2 11h5.6C16 11 17 12 17 13.5V20"/>
    <path d="M9.3 11V6.5a2.7 2.7 0 015.4 0V11"/>
    <path d="M9.3 7.5h5.4"/>
    <ellipse cx="12" cy="5.4" rx="2.7" ry="1.8"/>
    <path d="M7 20h10"/>
  </>,
  // Estetica — volto beauty con ciglia e labbra
  estetica: <>
    <path d="M12 3.5c-4 0-6.7 3-6.7 7 0 3.4 2.2 6.3 5.4 7.2v2.3h2.6v-2.3c3.2-.9 5.4-3.8 5.4-7.2 0-4-2.7-7-6.7-7z"/>
    <path d="M7.7 9.5C8.6 8.8 9.7 9 10.2 9.8"/>
    <path d="M16.3 9.5C15.4 8.8 14.3 9 13.8 9.8"/>
    <path d="M10 14.2c.7.7 3.3.7 4 0"/>
    <path d="M10 14.2c.6 1.1 3.4 1.1 4 0"/>
  </>,
  // Benessere — fiore di loto
  benessere: <>
    <path d="M12 19.5c-1.6-1.2-2.6-2.8-2.6-4.4 0-1.7 1.1-3.4 2.6-4.6 1.5 1.2 2.6 2.9 2.6 4.6 0 1.6-1 3.2-2.6 4.4z"/>
    <path d="M12 19.5c-2.4 0-5.4-1.4-6.5-3.7 1.4-1.4 3.3-1.9 5-1.4"/>
    <path d="M12 19.5c2.4 0 5.4-1.4 6.5-3.7-1.4-1.4-3.3-1.9-5-1.4"/>
    <path d="M9.4 15.1C7.6 14.3 6 12.6 5.7 10.6c1.9-.3 3.7.4 4.8 1.8"/>
    <path d="M14.6 15.1c1.8-.8 3.4-2.5 3.7-4.5-1.9-.3-3.7.4-4.8 1.8"/>
  </>,
  // Tattoo — macchinetta tattoo moderna a penna
  tattoo: <>
    <rect x="9" y="3.5" width="6" height="9" rx="1.8"/>
    <line x1="9" y1="6.5" x2="15" y2="6.5"/>
    <line x1="9" y1="9.5" x2="15" y2="9.5"/>
    <path d="M11 12.5v3"/>
    <path d="M13 12.5v3"/>
    <path d="M11 15.5h2v2.5l-1 3-1-3z"/>
    <path d="M15 5.5c1.4 0 2.2.9 2.2 2s-.8 2-2.2 2"/>
  </>,
  // Altro — tre puntini minimal
  altro: <>
    <circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>
    <circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>
  </>,
};
const MacroCatIcon = ({id,size=26,color="currentColor",strokeWidth=1.7}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {MACRO_PATHS[id] || <circle cx="12" cy="12" r="8"/>}
  </svg>
);

/* ── NAV 2026 — Premium flat nav ── */
const NI = {
  home: (a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1v-10.5z"/><path d="M9 22V13h6v9"/></svg>,
  search:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>,
  heart:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.brand:"none"} stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84 1-1a5.5 5.5 0 000-7.78z"/></svg>,
  cal:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.5" fill={a?T.brand:"#ADADAD"} stroke="none"/></svg>,
  user:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  grid:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  star:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.brand:"none"} stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  storefront:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0M9 20v-5h6v5"/></svg>,
  chat:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.brand:"none"} stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  bars:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.brand:"#ADADAD"} strokeWidth={a?2.2:1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V3M3 21h18M8 17v-5M13 17V7M18 17v-8"/></svg>,
};
// ── AvatarSVG — Memoji-premium style ─────────────────────────
function AvatarSVG({ config, size, animate }) {
  const [uid] = useState(function(){ return 'av' + Math.random().toString(36).slice(2,8); });
  const sz = size || 200;
  const asp = 240 / 200;
  const cfg = Object.assign({}, AVATAR_DEFAULT, config || {});
  const skin = cfg.skin;
  const hairColor = cfg.hairColor;
  const hairStyle = cfg.hairStyle || 0;
  const beardStyle = cfg.beardStyle || 0;
  const eyeColor = cfg.eyeColor;
  const browStyle = cfg.browStyle || 0;
  const glasses = cfg.glasses || 0;
  const earrings = cfg.earrings || 0;
  const hat = cfg.hat || 0;
  const outfit = cfg.outfit || 0;
  const outfitColor = cfg.outfitColor;

  const [blink, setBlink] = useState(false);
  useEffect(function() {
    if (!animate) return;
    var t = setInterval(function() {
      setBlink(true);
      setTimeout(function() { setBlink(false); }, 150);
    }, 3000);
    return function() { clearInterval(t); };
  }, [animate]);

  const eRy   = blink ? 2   : 22;
  const iRy   = blink ? 1.5 : 16;
  const pRy   = blink ? 0.8 : 9;

  // Hair front paths (if/else — no array indexing)
  var hf = "M 30 108 Q 26 44 100 38 Q 174 44 170 108 Q 156 66 100 60 Q 44 66 30 108 Z";
  if (hairStyle === 1) hf = "M 24 114 Q 18 40 100 32 Q 182 40 176 114 Q 174 78 156 60 Q 134 44 100 48 Q 66 44 44 60 Q 26 78 24 114 Z";
  if (hairStyle === 2) hf = "M 30 108 Q 26 44 100 38 Q 174 44 170 108 Q 156 66 100 60 Q 44 66 30 108 Z";
  if (hairStyle === 3) hf = "M 16 122 Q 6 26 100 16 Q 194 26 184 122 Q 188 80 170 52 Q 150 18 100 12 Q 50 18 30 52 Q 12 80 16 122 Z";
  if (hairStyle === 4) hf = "M 28 106 Q 24 44 100 38 Q 176 44 172 106 Q 158 68 100 62 Q 42 68 28 106 Z";
  if (hairStyle === 5) hf = "M 40 106 Q 38 54 100 50 Q 162 54 160 106 Q 152 76 100 74 Q 48 76 40 106 Z";

  // Brow paths
  var bL  = "M 48 92 Q 70 82 90 88"; var bR  = "M 110 88 Q 130 82 152 92"; var bW = 3.8;
  if (browStyle === 1) { bL = "M 50 94 Q 70 88 88 91"; bR = "M 112 91 Q 130 88 150 94"; bW = 2.2; }
  if (browStyle === 2) { bL = "M 45 90 Q 70 79 92 87"; bR = "M 108 87 Q 130 79 155 90"; bW = 6; }
  if (browStyle === 3) { bL = "M 48 92 Q 66 82 90 86"; bR = "M 110 86 Q 134 82 152 92"; bW = 3.8; }

  return (
    <svg viewBox="0 0 200 240" width={sz} height={sz * asp} style={{display:"block",overflow:"visible"}}>
      <defs>
        {/* Face 3-D shading */}
        <radialGradient id={uid+"-sg"} cx="36%" cy="26%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.42"/>
          <stop offset="52%" stopColor="white" stopOpacity="0"/>
          <stop offset="100%" stopColor="#000" stopOpacity="0.11"/>
        </radialGradient>
        {/* Iris gradient */}
        <radialGradient id={uid+"-ig"} cx="32%" cy="28%" r="68%">
          <stop offset="0%" stopColor="white" stopOpacity="0.55"/>
          <stop offset="38%" stopColor={eyeColor} stopOpacity="1"/>
          <stop offset="100%" stopColor={eyeColor} stopOpacity="1"/>
        </radialGradient>
        {/* Hair volume gradient */}
        <linearGradient id={uid+"-hg"} x1="25%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.38"/>
          <stop offset="38%" stopColor="white" stopOpacity="0"/>
          <stop offset="100%" stopColor="#000" stopOpacity="0.28"/>
        </linearGradient>
        {/* Drop shadow */}
        <filter id={uid+"-sh"} x="-25%" y="-15%" width="150%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#000" floodOpacity="0.10"/>
        </filter>
        {/* Lip gradient */}
        <linearGradient id={uid+"-lip"} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#D08070" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#B06050" stopOpacity="0.7"/>
        </linearGradient>
      </defs>

      {/* ══ OUTFIT ══ */}
      {outfit === 0 && <g>
        <path d="M 54 200 Q 54 188 100 184 Q 146 188 146 200 L 168 240 L 32 240 Z" fill={outfitColor}/>
        <path d="M 54 200 L 38 186 L 20 192 L 32 240 Z" fill={outfitColor} opacity=".78"/>
        <path d="M 146 200 L 162 186 L 180 192 L 168 240 Z" fill={outfitColor} opacity=".78"/>
        <path d="M 54 200 L 38 186 L 20 192 L 32 240 Z" fill="white" opacity=".06"/>
      </g>}
      {outfit === 1 && <g>
        <path d="M 50 202 Q 50 188 100 184 Q 150 188 150 202 L 174 240 L 26 240 Z" fill={outfitColor}/>
        <path d="M 50 202 L 34 186 L 16 193 L 26 240 L 56 240 Z" fill={outfitColor} opacity=".7"/>
        <path d="M 150 202 L 166 186 L 184 193 L 174 240 L 144 240 Z" fill={outfitColor} opacity=".7"/>
        <path d="M 94 186 L 82 216 L 100 226 L 118 216 L 106 186 Z" fill="white" opacity=".1"/>
        <path d="M 94 186 L 84 218 L 100 228 Z" fill="white" opacity=".12"/>
        <path d="M 106 186 L 116 218 L 100 228 Z" fill="white" opacity=".12"/>
      </g>}
      {outfit === 2 && <g>
        <path d="M 52 200 Q 52 186 100 182 Q 148 186 148 200 L 170 240 L 30 240 Z" fill={outfitColor}/>
        <path d="M 52 200 L 36 184 L 18 191 L 30 240 Z" fill={outfitColor} opacity=".8"/>
        <path d="M 148 200 L 164 184 L 182 191 L 170 240 Z" fill={outfitColor} opacity=".8"/>
        <path d="M 82 182 Q 100 194 118 182 Q 112 228 88 228 Z" fill={outfitColor} opacity=".6"/>
      </g>}
      {outfit === 3 && <g>
        <path d="M 60 194 Q 100 180 140 194 L 174 240 L 26 240 Z" fill={outfitColor}/>
        <path d="M 60 194 L 44 181 L 28 188 L 44 194 Z" fill={outfitColor}/>
        <path d="M 140 194 L 156 181 L 172 188 L 156 194 Z" fill={outfitColor}/>
      </g>}

      {/* ══ HAIR BACK (long styles only) ══ */}
      {hairStyle === 2 && hat === 0 && <g>
        <path d="M 28 108 Q 24 46 100 38 Q 176 46 172 108 L 178 218 Q 100 234 22 218 Z" fill={hairColor}/>
        <path d="M 28 108 Q 24 46 100 38 Q 176 46 172 108 L 178 218 Q 100 234 22 218 Z" fill={`url(#${uid}-hg)`} opacity=".55"/>
      </g>}
      {hairStyle === 4 && hat === 0 && <g>
        <path d="M 30 104 Q 26 46 100 38 Q 174 46 170 104 L 173 180 Q 100 196 27 180 Z" fill={hairColor}/>
        <path d="M 30 104 Q 26 46 100 38 Q 174 46 170 104 L 173 180 Q 100 196 27 180 Z" fill={`url(#${uid}-hg)`} opacity=".5"/>
      </g>}

      {/* ══ NECK ══ */}
      <rect x="82" y="180" width="36" height="22" rx="11" fill={skin}/>
      <rect x="82" y="180" width="36" height="22" rx="11" fill={`url(#${uid}-sg)`} opacity=".4"/>

      {/* ══ EARS ══ */}
      <ellipse cx="24" cy="114" rx="13" ry="18" fill={skin} filter={`url(#${uid}-sh)`}/>
      <ellipse cx="24" cy="116" rx="8"  ry="11" fill={skin} opacity=".55"/>
      <ellipse cx="24" cy="117" rx="4"  ry="6"  fill={skin} opacity=".38"/>
      <ellipse cx="176" cy="114" rx="13" ry="18" fill={skin} filter={`url(#${uid}-sh)`}/>
      <ellipse cx="176" cy="116" rx="8"  ry="11" fill={skin} opacity=".55"/>
      <ellipse cx="176" cy="117" rx="4"  ry="6"  fill={skin} opacity=".38"/>

      {/* ══ EARRINGS ══ */}
      {earrings === 1 && <g><circle cx="14" cy="122" r="5.5" fill={outfitColor}/><circle cx="186" cy="122" r="5.5" fill={outfitColor}/></g>}
      {earrings === 2 && <g fill="none" stroke={outfitColor} strokeWidth="3.5"><ellipse cx="14" cy="132" rx="5" ry="9"/><ellipse cx="186" cy="132" rx="5" ry="9"/></g>}
      {earrings === 3 && <g>
        <circle cx="14" cy="119" r="4" fill={outfitColor}/>
        <line x1="14" y1="123" x2="14" y2="136" stroke={outfitColor} strokeWidth="2.2"/>
        <circle cx="14" cy="141" r="6" fill={outfitColor}/>
        <circle cx="186" cy="119" r="4" fill={outfitColor}/>
        <line x1="186" y1="123" x2="186" y2="136" stroke={outfitColor} strokeWidth="2.2"/>
        <circle cx="186" cy="141" r="6" fill={outfitColor}/>
      </g>}

      {/* ══ HEAD ══ */}
      <ellipse cx="100" cy="112" rx="76" ry="80" fill={skin} filter={`url(#${uid}-sh)`}/>
      {/* 3-D skin shading overlay */}
      <ellipse cx="100" cy="112" rx="76" ry="80" fill={`url(#${uid}-sg)`}/>
      {/* Forehead specular highlight */}
      <ellipse cx="76" cy="76" rx="30" ry="19" fill="white" opacity=".16"/>

      {/* ══ BLUSH ══ */}
      <ellipse cx="44"  cy="138" rx="22" ry="12" fill="#FF8FA3" opacity=".18"/>
      <ellipse cx="156" cy="138" rx="22" ry="12" fill="#FF8FA3" opacity=".18"/>

      {/* ══ BEARD ══ */}
      {beardStyle === 1 && <g opacity=".28">
        <circle cx="80"  cy="154" r="2.5" fill={hairColor}/>
        <circle cx="88"  cy="158" r="2.5" fill={hairColor}/>
        <circle cx="96"  cy="160" r="2.5" fill={hairColor}/>
        <circle cx="104" cy="160" r="2.5" fill={hairColor}/>
        <circle cx="112" cy="158" r="2.5" fill={hairColor}/>
        <circle cx="120" cy="154" r="2.5" fill={hairColor}/>
        <circle cx="84"  cy="164" r="2.5" fill={hairColor}/>
        <circle cx="92"  cy="168" r="2.5" fill={hairColor}/>
        <circle cx="100" cy="169" r="2.5" fill={hairColor}/>
        <circle cx="108" cy="168" r="2.5" fill={hairColor}/>
        <circle cx="116" cy="164" r="2.5" fill={hairColor}/>
      </g>}
      {beardStyle === 2 && <path d="M 84 154 Q 100 180 116 154 Q 118 188 100 192 Q 82 188 84 154 Z" fill={hairColor} opacity=".88"/>}
      {beardStyle === 3 && <path d="M 36 144 Q 33 168 35 183 Q 50 206 100 208 Q 150 206 165 183 Q 167 168 164 144 Q 148 160 100 163 Q 52 160 36 144 Z" fill={hairColor} opacity=".88"/>}
      {beardStyle === 4 && <path d="M 78 150 Q 90 160 100 156 Q 110 160 122 150 Q 110 144 100 147 Q 90 144 78 150 Z" fill={hairColor} opacity=".9"/>}

      {/* ══ EYES ══ */}
      {/* Left eye white */}
      <ellipse cx="70" cy="108" rx="23" ry={eRy} fill="white"/>
      {/* Left iris */}
      <ellipse cx="70" cy="110" rx="16" ry={iRy} fill={`url(#${uid}-ig)`}/>
      {/* Left pupil */}
      <ellipse cx="70" cy="111" rx="9"  ry={pRy} fill="#111"/>
      {/* Left catchlights */}
      {!blink && <ellipse cx="63" cy="105" rx="5.5" ry="7" fill="white" opacity=".92"/>}
      {!blink && <circle  cx="76" cy="113" r="2.5"        fill="white" opacity=".55"/>}
      {/* Left upper lash arc */}
      <path d="M 47 108 Q 70 90 93 108" stroke="#1A1A1A" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Left individual lashes */}
      <line x1="51" y1="103" x2="46" y2="94"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="60" y1="98"  x2="57" y2="89"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="70" y1="96"  x2="70" y2="86"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="80" y1="98"  x2="83" y2="89"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="89" y1="103" x2="94" y2="94"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Left lower lid */}
      <path d="M 47 108 Q 70 122 93 108" stroke="rgba(0,0,0,.12)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* Right eye white */}
      <ellipse cx="130" cy="108" rx="23" ry={eRy} fill="white"/>
      {/* Right iris */}
      <ellipse cx="130" cy="110" rx="16" ry={iRy} fill={`url(#${uid}-ig)`}/>
      {/* Right pupil */}
      <ellipse cx="130" cy="111" rx="9"  ry={pRy} fill="#111"/>
      {/* Right catchlights */}
      {!blink && <ellipse cx="123" cy="105" rx="5.5" ry="7" fill="white" opacity=".92"/>}
      {!blink && <circle  cx="136" cy="113" r="2.5"        fill="white" opacity=".55"/>}
      {/* Right upper lash arc */}
      <path d="M 107 108 Q 130 90 153 108" stroke="#1A1A1A" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Right individual lashes */}
      <line x1="111" y1="103" x2="106" y2="94"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="120" y1="98"  x2="117" y2="89"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="130" y1="96"  x2="130" y2="86"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="140" y1="98"  x2="143" y2="89"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="149" y1="103" x2="154" y2="94"  stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Right lower lid */}
      <path d="M 107 108 Q 130 122 153 108" stroke="rgba(0,0,0,.12)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* ══ EYEBROWS ══ */}
      <path d={bL} stroke={hairColor} strokeWidth={bW} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={bR} stroke={hairColor} strokeWidth={bW} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Brow shine */}
      <path d={bL} stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".18"/>
      <path d={bR} stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".18"/>

      {/* ══ NOSE ══ */}
      <ellipse cx="95"  cy="136" rx="5.5" ry="4.5" fill="rgba(0,0,0,.07)"/>
      <ellipse cx="105" cy="136" rx="5.5" ry="4.5" fill="rgba(0,0,0,.07)"/>
      <path d="M 92 132 Q 100 138 108 132" stroke="rgba(0,0,0,.09)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* ══ MOUTH ══ */}
      {/* Smile base */}
      <path d="M 80 154 Q 100 174 120 154" stroke="#B06050" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".5"/>
      {/* Lips fill */}
      <path d="M 80 154 Q 100 172 120 154 Q 112 164 100 166 Q 88 164 80 154 Z" fill={`url(#${uid}-lip)`}/>
      {/* Upper lip line */}
      <path d="M 82 154 Q 92 148 100 150 Q 108 148 118 154" stroke="rgba(0,0,0,.14)" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      {/* Teeth */}
      <ellipse cx="100" cy="162" rx="13" ry="5.5" fill="white" opacity=".72"/>
      {/* Lip highlight */}
      <ellipse cx="97" cy="157" rx="9" ry="3" fill="white" opacity=".22"/>
      {/* Smile dimples */}
      <circle cx="79"  cy="153" r="2.5" fill="rgba(0,0,0,.07)"/>
      <circle cx="121" cy="153" r="2.5" fill="rgba(0,0,0,.07)"/>

      {/* ══ GLASSES ══ */}
      {glasses === 1 && <g stroke="#1A1A1A" strokeWidth="2.5" fill="rgba(200,230,255,.2)">
        <circle cx="70"  cy="108" r="25"/>
        <circle cx="130" cy="108" r="25"/>
        <path d="M 95 108 L 105 108"/>
        <path d="M 45 103 L 33 100"/>
        <path d="M 155 103 L 167 100"/>
      </g>}
      {glasses === 2 && <g stroke="#1A1A1A" strokeWidth="2.5" fill="rgba(200,230,255,.2)">
        <rect x="44" y="95" width="52" height="29" rx="6"/>
        <rect x="104" y="95" width="52" height="29" rx="6"/>
        <path d="M 96 109 L 104 109"/>
        <path d="M 44 103 L 33 101"/>
        <path d="M 156 103 L 167 101"/>
      </g>}
      {glasses === 3 && <g stroke="#1A1A1A" strokeWidth="2.5" fill="rgba(255,200,230,.22)">
        <path d="M 44 116 Q 45 93 70 90 Q 92 87 96 108 Q 92 124 69 124 Q 45 124 44 116 Z"/>
        <path d="M 104 108 Q 108 87 130 90 Q 155 93 156 116 Q 155 124 132 124 Q 108 124 104 108 Z"/>
        <path d="M 96 108 L 104 108"/>
        <path d="M 44 112 L 33 107"/>
        <path d="M 156 112 L 167 107"/>
      </g>}

      {/* ══ HAIR FRONT / HAT ══ */}
      {hat === 0 && <g>
        <path d={hf} fill={hairColor}/>
        <path d={hf} fill={`url(#${uid}-hg)`}/>
        {/* Long hair front strands */}
        {hairStyle === 2 && <g>
          <path d="M 28 108 Q 18 134 20 204 Q 30 216 42 212 L 41 164 Q 43 136 45 114 Z" fill={hairColor}/>
          <path d="M 28 108 Q 18 134 20 204 Q 30 216 42 212 L 41 164 Q 43 136 45 114 Z" fill={`url(#${uid}-hg)`} opacity=".5"/>
          <path d="M 172 108 Q 182 134 180 204 Q 170 216 158 212 L 159 164 Q 157 136 155 114 Z" fill={hairColor}/>
          <path d="M 172 108 Q 182 134 180 204 Q 170 216 158 212 L 159 164 Q 157 136 155 114 Z" fill={`url(#${uid}-hg)`} opacity=".5"/>
        </g>}
        {hairStyle === 4 && <g>
          <path d="M 30 104 Q 22 130 22 180 Q 32 192 44 188 L 43 148 Q 45 122 47 110 Z" fill={hairColor}/>
          <path d="M 170 104 Q 178 130 178 180 Q 168 192 156 188 L 157 148 Q 155 122 153 110 Z" fill={hairColor}/>
        </g>}
        {/* Curly volume puffs */}
        {hairStyle === 3 && <g>
          <circle cx="60"  cy="60"  r="28" fill={hairColor}/>
          <circle cx="100" cy="42"  r="32" fill={hairColor}/>
          <circle cx="140" cy="60"  r="28" fill={hairColor}/>
          <circle cx="44"  cy="86"  r="22" fill={hairColor}/>
          <circle cx="156" cy="86"  r="22" fill={hairColor}/>
          <circle cx="60"  cy="60"  r="28" fill={`url(#${uid}-hg)`} opacity=".6"/>
          <circle cx="100" cy="42"  r="32" fill={`url(#${uid}-hg)`} opacity=".6"/>
          <circle cx="140" cy="60"  r="28" fill={`url(#${uid}-hg)`} opacity=".6"/>
        </g>}
        {/* Wavy side detail */}
        {hairStyle === 1 && <g>
          <path d="M 24 114 Q 16 130 18 148 Q 24 156 30 152 Q 22 138 26 118 Z" fill={hairColor}/>
          <path d="M 176 114 Q 184 130 182 148 Q 176 156 170 152 Q 178 138 174 118 Z" fill={hairColor}/>
        </g>}
      </g>}

      {hat === 1 && <g>
        <path d="M 30 102 Q 26 44 100 38 Q 174 44 170 102 Z" fill={outfitColor}/>
        <rect x="24" y="98" width="152" height="18" rx="9" fill={outfitColor} opacity=".88"/>
        <path d="M 168 101 Q 186 106 184 113 Q 182 117 173 115" fill={outfitColor}/>
        <ellipse cx="78" cy="62" rx="24" ry="11" fill="white" opacity=".13"/>
      </g>}
      {hat === 2 && <g>
        <path d="M 30 104 Q 26 44 100 38 Q 174 44 170 104 Q 154 66 100 60 Q 46 66 30 104 Z" fill={outfitColor}/>
        <rect x="26" y="100" width="148" height="18" rx="9" fill={outfitColor} opacity=".72"/>
        <ellipse cx="76" cy="68" rx="22" ry="9" fill="white" opacity=".13"/>
      </g>}
    </svg>
  );
}

// ── Avatar3D — personaggio 3D con Three.js ───────────────────
function Avatar3D({ config, size }) {
  const mountRef = useRef(null);
  const cleanupRef = useRef(null);
  const [ready, setReady] = useState(false);
  const cfg = Object.assign({}, AVATAR_DEFAULT, config || {});
  const sz = size || 240;

  useEffect(function() {
    var alive = true;
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setReady(false);

    loadThree().then(function(THREE) {
      if (!alive || !mountRef.current) return;

      // ── Scene ──
      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
      camera.position.set(0, 0.18, 6.2);
      camera.lookAt(0, 0.18, 0);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(sz, sz);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mountRef.current.innerHTML = "";
      mountRef.current.appendChild(renderer.domElement);

      // ── Materiali ──
      var skinC  = new THREE.Color(cfg.skin);
      var hairC  = new THREE.Color(cfg.hairColor);
      var eyeC   = new THREE.Color(cfg.eyeColor);
      var outfitC= new THREE.Color(cfg.outfitColor);
      var darkSkinC = skinC.clone().multiplyScalar(0.82);

      var mSkin    = new THREE.MeshToonMaterial({ color: skinC });
      var mDarkSkin= new THREE.MeshToonMaterial({ color: darkSkinC });
      var mHair    = new THREE.MeshToonMaterial({ color: hairC });
      var mEye     = new THREE.MeshToonMaterial({ color: eyeC });
      var mPupil   = new THREE.MeshToonMaterial({ color: 0x111111 });
      var mWhite   = new THREE.MeshToonMaterial({ color: 0xFFFFFF });
      var mCatch   = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      var mOutfit  = new THREE.MeshToonMaterial({ color: outfitC });
      var mOutline = new THREE.MeshBasicMaterial({ color: 0x1A0800, side: THREE.BackSide });
      var mLip     = new THREE.MeshToonMaterial({ color: 0xC07060 });
      var mBlush   = new THREE.MeshBasicMaterial({ color: 0xFF8FA3, transparent: true, opacity: 0.22 });

      function outlined(geo, mat, scale) {
        var group = new THREE.Group();
        var mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
        var ol = new THREE.Mesh(geo, mOutline);
        ol.scale.setScalar(scale || 1.055);
        group.add(ol);
        return group;
      }

      // ── TESTA ──
      var headGeo = new THREE.SphereGeometry(0.74, 48, 48);
      var headGroup = outlined(headGeo, mSkin, 1.05);
      headGroup.scale.set(1.04, 1.14, 0.97);
      headGroup.position.set(0, 0.36, 0);
      scene.add(headGroup);
      var head = headGroup.children[0]; // mesh skin

      // Guance rosse
      [-0.54, 0.54].forEach(function(x) {
        var blush = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), mBlush);
        blush.scale.set(1, 0.48, 0.32);
        blush.position.set(x, 0.06, 0.62);
        headGroup.add(blush);
      });

      // ── ORECCHIE ──
      [-1, 1].forEach(function(s) {
        var earG = outlined(new THREE.SphereGeometry(0.17, 20, 20), mSkin, 1.06);
        earG.scale.set(0.44, 0.65, 0.4);
        earG.position.set(s * 1.02, 0.36, 0);
        scene.add(earG);
        var inner = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), mDarkSkin);
        inner.scale.set(0.38, 0.52, 0.22);
        inner.position.set(s * 1.05, 0.36, 0.04);
        scene.add(inner);
      });

      // ── OCCHI ──
      [-0.285, 0.285].forEach(function(x) {
        var eyeGroup = new THREE.Group();
        eyeGroup.position.set(x, 0.5, 0.64);
        headGroup.add(eyeGroup);
        // Bianco
        var white = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 28), mWhite);
        white.scale.set(1, 0.86, 0.7);
        eyeGroup.add(white);
        // Iride
        var iris = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 24), mEye);
        iris.position.z = 0.07;
        eyeGroup.add(iris);
        // Pupilla
        var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 18), mPupil);
        pupil.position.z = 0.12;
        eyeGroup.add(pupil);
        // Catchlight principale
        var c1 = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), mCatch);
        c1.position.set(-0.055, 0.065, 0.155);
        eyeGroup.add(c1);
        // Catchlight secondario
        var c2 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mCatch);
        c2.position.set(0.065, -0.038, 0.152);
        eyeGroup.add(c2);
        // Outline occhio
        var eyeOl = new THREE.Mesh(new THREE.SphereGeometry(0.21, 28, 28), mOutline);
        eyeOl.scale.set(1.04, 0.92, 0.72);
        eyeGroup.add(eyeOl);
      });

      // ── SOPRACCIGLIA ──
      [-0.29, 0.29].forEach(function(x, i) {
        var browGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.22, 8);
        var brow = new THREE.Mesh(browGeo, mHair);
        brow.position.set(x, 0.745, 0.65);
        brow.rotation.z = i === 0 ? -0.22 : 0.22;
        brow.rotation.x = 0.28;
        headGroup.add(brow);
      });

      // ── NASO ──
      var nose = new THREE.Mesh(new THREE.SphereGeometry(0.066, 16, 16), mSkin);
      nose.scale.set(1.15, 0.72, 0.88);
      nose.position.set(0, 0.26, 0.76);
      headGroup.add(nose);
      [-0.085, 0.085].forEach(function(x) {
        var n = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), mDarkSkin);
        n.scale.set(1.1, 0.68, 0.58);
        n.position.set(x, 0.21, 0.75);
        headGroup.add(n);
      });

      // ── BOCCA ──
      var smileGeo = new THREE.TorusGeometry(0.145, 0.022, 10, 26, Math.PI);
      var smile = new THREE.Mesh(smileGeo, mLip);
      smile.rotation.z = Math.PI;
      smile.position.set(0, 0.11, 0.72);
      headGroup.add(smile);
      var labbro = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 10), mLip);
      labbro.scale.set(1.38, 0.32, 0.48);
      labbro.position.set(0, 0.11, 0.72);
      headGroup.add(labbro);
      // denti accennati
      var denti = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8), mWhite);
      denti.scale.set(1.2, 0.38, 0.4);
      denti.position.set(0, 0.08, 0.72);
      headGroup.add(denti);

      // ── COLLO ──
      var neckG = outlined(new THREE.CylinderGeometry(0.19, 0.23, 0.34, 20), mSkin, 1.04);
      neckG.position.set(0, -0.3, 0);
      scene.add(neckG);

      // ── CORPO ──
      var bodyG = outlined(new THREE.CylinderGeometry(0.5, 0.56, 0.72, 24), mOutfit, 1.04);
      bodyG.position.set(0, -0.84, -0.06);
      scene.add(bodyG);
      // Spalle
      [-0.64, 0.64].forEach(function(x) {
        var sh = outlined(new THREE.SphereGeometry(0.29, 20, 20), mOutfit, 1.05);
        sh.scale.set(1.1, 0.74, 0.9);
        sh.position.set(x, -0.65, -0.06);
        scene.add(sh);
      });

      // ── CAPELLI ──
      var hStyle = cfg.hairStyle || 0;
      var hairGroup = new THREE.Group();
      scene.add(hairGroup);

      function addHair(geo, pos, scl) {
        var g = outlined(geo, mHair, 1.048);
        if (pos) g.position.set(pos[0], pos[1], pos[2]);
        if (scl) g.scale.set(scl[0], scl[1], scl[2]);
        hairGroup.add(g);
      }

      if (hStyle === 0) { // Corto classico
        addHair(new THREE.SphereGeometry(0.77, 36, 20, 0, Math.PI*2, 0, Math.PI*0.54), [0, 0.82, -0.04], [1.06, 1.12, 1.02]);
        addHair(new THREE.SphereGeometry(0.38, 18, 18), [-0.62, 0.5, 0.04], [0.7, 0.8, 0.72]);
        addHair(new THREE.SphereGeometry(0.38, 18, 18), [0.62, 0.5, 0.04],  [0.7, 0.8, 0.72]);
      } else if (hStyle === 1) { // Mosso
        addHair(new THREE.SphereGeometry(0.79, 36, 20, 0, Math.PI*2, 0, Math.PI*0.52), [0, 0.84, -0.06], [1.1, 1.16, 1.05]);
        [-1,1].forEach(function(s) {
          [0,1,2].forEach(function(j) {
            addHair(new THREE.SphereGeometry(0.19, 14, 14), [s*0.7, 0.12 - j*0.33, 0.08], [0.58, 1.22, 0.5]);
          });
        });
      } else if (hStyle === 2) { // Lungo
        addHair(new THREE.SphereGeometry(0.78, 36, 20, 0, Math.PI*2, 0, Math.PI*0.55), [0, 0.82, -0.05], [1.07, 1.13, 1.03]);
        addHair(new THREE.CylinderGeometry(0.54, 0.4, 1.5, 22), [0, -0.12, -0.24]);
        addHair(new THREE.CylinderGeometry(0.21, 0.15, 1.3, 14), [-0.62, -0.1, 0.04]);
        addHair(new THREE.CylinderGeometry(0.21, 0.15, 1.3, 14), [0.62, -0.1, 0.04]);
      } else if (hStyle === 3) { // Ricci
        [[0,0.88,0],[-.38,.74,0],[.38,.74,0],[-.54,.54,0],[.54,.54,0],[-.3,.92,-.2],[.3,.92,-.2],[0,.96,-.15],[-.26,.8,.24],[.26,.8,.24]].forEach(function(p) {
          addHair(new THREE.SphereGeometry(0.28, 16, 16), p);
        });
      } else if (hStyle === 4) { // Coda
        addHair(new THREE.SphereGeometry(0.77, 36, 20, 0, Math.PI*2, 0, Math.PI*0.55), [0, 0.81, -0.04], [1.06, 1.11, 1.02]);
        addHair(new THREE.CylinderGeometry(0.17, 0.11, 0.72, 14), [0, 0.03, -0.7]);
        addHair(new THREE.SphereGeometry(0.13, 12, 12), [0, -0.28, -1.04]);
        // Elastico
        var el = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.038, 8, 18), mOutfit);
        el.position.set(0, 0.22, -0.56);
        el.rotation.x = -0.5;
        hairGroup.add(el);
      } else if (hStyle === 5) { // Rasato
        addHair(new THREE.SphereGeometry(0.76, 36, 20, 0, Math.PI*2, 0, Math.PI*0.44), [0, 0.76, -0.02], [1.06, 0.82, 1.01]);
      }

      // ── BARBA ──
      var bStyle = cfg.beardStyle || 0;
      if (bStyle === 1) { // Barba leggera
        var stMat = new THREE.MeshToonMaterial({ color: hairC, transparent: true, opacity: 0.32 });
        var st = new THREE.Mesh(new THREE.SphereGeometry(0.54, 24, 24), stMat);
        st.scale.set(1.05, 0.54, 0.88);
        st.position.set(0, 0.02, 0.18);
        headGroup.add(st);
      } else if (bStyle === 2) { // Corta
        var bG = outlined(new THREE.SphereGeometry(0.5, 28, 28), mHair, 1.05);
        bG.scale.set(1.08, 0.66, 0.84);
        bG.position.set(0, 0.0, 0.2);
        headGroup.add(bG);
      } else if (bStyle === 3) { // Piena
        var fbG = outlined(new THREE.SphereGeometry(0.6, 32, 32), mHair, 1.04);
        fbG.scale.set(1.1, 0.9, 0.86);
        fbG.position.set(0, -0.06, 0.1);
        headGroup.add(fbG);
      } else if (bStyle === 4) { // Pizzetto
        var goG = outlined(new THREE.SphereGeometry(0.23, 16, 16), mHair, 1.06);
        goG.scale.set(0.88, 1.28, 0.68);
        goG.position.set(0, -0.04, 0.62);
        headGroup.add(goG);
      }

      // ── OCCHIALI ──
      if (cfg.glasses >= 1) {
        var fMat = new THREE.MeshToonMaterial({ color: cfg.glasses === 3 ? 0xCC6688 : 0x1A1A1A });
        var lMat = new THREE.MeshPhysicalMaterial({ color: 0xC8E0FF, transparent: true, opacity: 0.22, roughness: 0, metalness: 0 });
        [-0.3, 0.3].forEach(function(x) {
          var fr, ln;
          if (cfg.glasses === 2) {
            fr = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.05), fMat);
            ln = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.02), lMat);
          } else {
            fr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 10, 28), fMat);
            ln = new THREE.Mesh(new THREE.CircleGeometry(0.18, 28), lMat);
          }
          fr.position.set(x, 0.5, 0.74);
          ln.position.set(x, 0.5, 0.75);
          headGroup.add(fr); headGroup.add(ln);
        });
        var bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 8), fMat);
        bridge.rotation.z = Math.PI / 2;
        bridge.position.set(0, 0.5, 0.74);
        headGroup.add(bridge);
      }

      // ── CAPPELLO ──
      if (cfg.hat >= 1) {
        var hatMat = new THREE.MeshToonMaterial({ color: outfitC });
        if (cfg.hat === 1) {
          var dome = outlined(new THREE.SphereGeometry(0.78, 36, 20, 0, Math.PI*2, 0, Math.PI*0.5), hatMat, 1.04);
          dome.scale.set(1.09, 0.82, 1.05);
          dome.position.set(0, 1.0, -0.04);
          scene.add(dome);
          var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.06, 32), hatMat);
          brim.scale.set(1, 1, 0.68);
          brim.position.set(0, 1.05, 0.14);
          scene.add(brim);
        } else if (cfg.hat === 2) {
          var beret = outlined(new THREE.SphereGeometry(0.8, 36, 20, 0, Math.PI*2, 0, Math.PI*0.46), hatMat, 1.04);
          beret.scale.set(1.09, 0.64, 1.05);
          beret.position.set(0, 0.97, -0.06);
          scene.add(beret);
          var band = new THREE.Mesh(new THREE.CylinderGeometry(0.79, 0.79, 0.1, 32), hatMat);
          band.position.set(0, 0.96, -0.02);
          scene.add(band);
        }
      }

      // ── ORECCHINI ──
      if (cfg.earrings >= 1) {
        var erMat = new THREE.MeshPhysicalMaterial({ color: outfitC, metalness: 0.9, roughness: 0.08 });
        [-1, 1].forEach(function(s) {
          if (cfg.earrings === 1) {
            var stud = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), erMat);
            stud.position.set(s * 1.06, 0.22, 0.05);
            scene.add(stud);
          } else if (cfg.earrings === 2) {
            var hoop = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.018, 8, 26), erMat);
            hoop.position.set(s * 1.06, 0.1, 0.05);
            hoop.rotation.y = Math.PI / 2;
            scene.add(hoop);
          } else if (cfg.earrings === 3) {
            var etop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), erMat);
            etop.position.set(s * 1.06, 0.26, 0.04);
            scene.add(etop);
            var edrop = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 12), erMat);
            edrop.position.set(s * 1.06, 0.1, 0.04);
            scene.add(edrop);
            var ewire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.17, 6), erMat);
            ewire.position.set(s * 1.06, 0.18, 0.04);
            scene.add(ewire);
          }
        });
      }

      // ── LUCI (3-point) ──
      var ambient = new THREE.AmbientLight(0xFFF5E6, 0.72);
      scene.add(ambient);
      var key = new THREE.DirectionalLight(0xFFF2D9, 1.5);
      key.position.set(-3, 4, 5); key.castShadow = true;
      scene.add(key);
      var fill = new THREE.DirectionalLight(0xD6E8FF, 0.48);
      fill.position.set(4, 1, 3);
      scene.add(fill);
      var rim = new THREE.DirectionalLight(0xC0D0FF, 0.32);
      rim.position.set(0, 3, -4);
      scene.add(rim);

      // ── RENDER LOOP ──
      var raf = null;
      var render = function() {
        raf = requestAnimationFrame(render);
        renderer.render(scene, camera);
      };
      render();
      setReady(true);

      cleanupRef.current = function() {
        alive = false;
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (mountRef.current) mountRef.current.innerHTML = "";
      };
    });

    return function() {
      alive = false;
      if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    };
  }, [cfg.skin, cfg.hairColor, cfg.hairStyle, cfg.beardStyle, cfg.eyeColor,
      cfg.glasses, cfg.hat, cfg.earrings, cfg.outfitColor, cfg.outfit, sz]);

  return (
    <div style={{position:"relative", width:sz, height:sz}}>
      {!ready && (
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <AvatarSVG config={config} size={sz} animate={false}/>
        </div>
      )}
      <div ref={mountRef} style={{width:sz, height:sz, opacity: ready ? 1 : 0, transition:"opacity .4s ease"}}/>
    </div>
  );
}

function TopBar() {
  return (
    <div style={{
      position:"fixed",top:0,left:0,right:0,zIndex:300,
      background:"rgba(250,250,249,.92)",
      backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      borderBottom:`1px solid ${T.line}`,
      display:"flex",alignItems:"center",justifyContent:"center",
      height:52,
      paddingTop:"env(safe-area-inset-top,0px)",
      maxWidth:430,margin:"0 auto",
    }}>
      <img src={`${import.meta.env.BASE_URL}logo-b.png`} alt="beauty"
        style={{height:28,width:"auto",display:"block",objectFit:"contain"}}/>
    </div>
  );
}

function NavBar({items,s,nav}) {
  return (
    <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(250,250,249,.94)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderTop:`1px solid ${T.line}`,display:"flex",alignItems:"stretch",zIndex:200,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {items.map(({id,icon,label,dot}) => {
        const active = s===id;
        return (
          <button key={id} onClick={()=>nav(id)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"10px 4px 12px",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",position:"relative",transition:"transform .18s cubic-bezier(.34,1.56,.64,1)"}}>
            {NI[icon](active)}
            <span style={{fontSize:10,fontWeight:active?700:500,color:active?T.brand:T.inkSoft,letterSpacing:.2,transition:"color .15s"}}>{label}</span>
            {dot && !active && <span style={{position:"absolute",top:8,right:"calc(50% - 14px)",width:6,height:6,borderRadius:"50%",background:T.brand}}/>}
          </button>
        );
      })}
    </nav>
  );
}
function NavCl({s,nav}) {
  return <NavBar s={s} nav={nav} items={[
    {id:"cl_home",      icon:"home",   label:"Home"},
    {id:"cl_explore",   icon:"search", label:"Esplora"},
    {id:"cl_preferiti", icon:"heart",  label:"Salvati"},
    {id:"cl_appts",     icon:"cal",    label:"Prenotazioni"},
    {id:"cl_profilo",   icon:"user",   label:"Profilo"},
  ]}/>;
}
function NavPro({s,nav,dmDot}) {
  return <NavBar s={s} nav={nav} items={[
    {id:"pro_agenda",  icon:"cal",  label:"Agenda"},
    {id:"pro_chats",   icon:"chat", label:"Messaggi", dot:dmDot},
    {id:"pro_clienti", icon:"user", label:"Clienti"},
    {id:"pro_stats",   icon:"bars", label:"Statistiche"},
    {id:"pro_profilo", icon:"storefront",label:"Account"},
  ]}/>;
}

/* Singola card del carosello, con "Mostra altro" che espande i dettagli/passaggi */
function IntroSlide({s}) {
  const [open,setOpen] = useState(false);
  return (
    <div style={{flex:"0 0 100%",width:"100%",height:"100%",scrollSnapAlign:"center",boxSizing:"border-box",overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"6px 26px 24px",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{flex: open?"0 0 auto":"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",minHeight: open?"auto":"48vh",paddingTop: open?18:0,transition:"all .3s"}}>
        <div style={{width: open?92:118,height: open?92:118,borderRadius:32,background:"rgba(255,255,255,.75)",border:"1px solid #F0F0F2",boxShadow:"0 8px 30px rgba(0,0,0,.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize: open?42:54,marginBottom:24,transition:"all .3s",flexShrink:0}}>{s.icon}</div>
        <h2 style={{fontSize:25,fontWeight:900,color:"#111111",margin:"0 0 10px",letterSpacing:"-.03em",lineHeight:1.15}}>{s.title}</h2>
        <p style={{fontSize:16,color:"#8A8A8E",margin:0,lineHeight:1.55,maxWidth:300}}>{s.text}</p>
      </div>

      {s.details && s.details.length>0 && (
        <div style={{width:"100%"}}>
          <button onClick={()=>setOpen(o=>!o)} style={{margin:"10px auto 0",display:"flex",alignItems:"center",gap:6,background:"rgba(17,17,17,.05)",border:"none",borderRadius:99,padding:"9px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:13.5,fontWeight:700,color:"#111"}}>
            {open?"Mostra meno":"Mostra altro"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{transform:open?"rotate(180deg)":"none",transition:"transform .25s"}}><path d="M6 9l6 6 6-6"/></svg>
          </button>

          {open && (
            <div className="ba-fade" style={{marginTop:16,display:"flex",flexDirection:"column",gap:11}}>
              {s.details.map((d,j)=>(
                <div key={j} style={{display:"flex",gap:12,alignItems:"flex-start",background:"rgba(255,255,255,.85)",border:"1px solid #F0F0F2",borderRadius:16,padding:"13px 14px"}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:"#111",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12.5,fontWeight:800,flexShrink:0}}>{j+1}</div>
                  <div style={{flex:1,minWidth:0,textAlign:"left"}}>
                    <p style={{fontSize:14.5,fontWeight:800,color:"#111",margin:"0 0 2px"}}>{d.t}</p>
                    <p style={{fontSize:12.5,color:"#8A8A8E",margin:0,lineHeight:1.45}}>{d.s}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Card piano attività, espandibile ("Mostra cosa include") */
function PlanCard({p, onChoose}) {
  const [open,setOpen] = useState(false);
  const dark = p.hot;               // Pro → scuro
  const trial = p.trial;            // Prova gratuita → banner in evidenza
  const onDark = dark || trial;
  return (
    <div style={{borderRadius:22,padding:"18px 18px",background:trial?"linear-gradient(135deg,#5B7CFF,#8A6BFF 55%,#FF7AC8)":dark?"#111111":"rgba(255,255,255,.9)",border:onDark?"none":"1.5px solid #EAEAEA",position:"relative",boxShadow:trial?"0 10px 30px rgba(91,124,255,.30)":"0 2px 10px rgba(0,0,0,.03)"}}>
      {dark && <span style={{position:"absolute",top:16,right:16,fontSize:10,fontWeight:800,color:"#111",background:"#fff",borderRadius:99,padding:"3px 10px"}}>CONSIGLIATO</span>}
      {trial && <span style={{position:"absolute",top:16,right:16,fontSize:10,fontWeight:800,color:"#5B7CFF",background:"#fff",borderRadius:99,padding:"3px 10px"}}>OFFERTA</span>}
      <p style={{fontSize:14,fontWeight:800,color:onDark?"#fff":"#111",margin:"0 0 2px"}}>{p.name} <span style={{fontWeight:500,color:onDark?"rgba(255,255,255,.7)":"#ADADAD"}}>· {p.sub}</span></p>
      <p style={{fontSize:27,fontWeight:900,color:onDark?"#fff":"#111",margin:"0 0 6px",letterSpacing:"-.03em"}}>{p.price}</p>
      <p style={{fontSize:13,color:onDark?"rgba(255,255,255,.85)":"#8A8A8E",margin:"0 0 14px",lineHeight:1.45}}>{p.desc}</p>

      {/* Mostra cosa include */}
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,margin:"0 0 14px",background:onDark?"rgba(255,255,255,.16)":"rgba(17,17,17,.05)",border:"none",borderRadius:99,padding:"8px 15px",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,color:onDark?"#fff":"#111"}}>
        {open?"Nascondi dettagli":"Mostra cosa include"}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={onDark?"#fff":"#111"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{transform:open?"rotate(180deg)":"none",transition:"transform .25s"}}><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && (
        <div className="ba-fade" style={{display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
          {p.feat.map((ft,j)=>(
            <div key={j} style={{display:"flex",alignItems:"flex-start",gap:9}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={onDark?"#fff":"#22C483"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}><path d="M20 6L9 17l-5-5"/></svg>
              <div>
                <p style={{fontSize:14,fontWeight:700,color:onDark?"#fff":"#111",margin:0,lineHeight:1.35}}>{typeof ft==="string"?ft:ft.t}</p>
                {ft.s && <p style={{fontSize:12,color:onDark?"rgba(255,255,255,.75)":"#8A8A8E",margin:"1px 0 0",lineHeight:1.4}}>{ft.s}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={onChoose} style={{width:"100%",padding:"13px 0",borderRadius:13,border:onDark?"none":"1.5px solid #E5E5EA",background:"#fff",color:trial?"#5B7CFF":"#111",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{p.cta}</button>
    </div>
  );
}

/* Carosello introduttivo a scorrimento (swipe destra/sinistra), card espandibili */
function IntroCarousel({slides, ctaLabel, onDone, onBack}) {
  const [idx,setIdx] = useState(0);
  const ref = useRef(null);
  const onScroll = () => { const el=ref.current; if(!el) return; setIdx(Math.round(el.scrollLeft/el.clientWidth)); };
  const go = (i) => { const el=ref.current; if(!el) return; el.scrollTo({left:i*el.clientWidth,behavior:"smooth"}); };
  const last = idx>=slides.length-1;
  return (
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"56px 22px 4px",flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
        </button>
        <button onClick={onDone} style={{background:"none",border:"none",cursor:"pointer",padding:0,color:"#8A8A8E",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>Salta</button>
      </div>

      <div ref={ref} onScroll={onScroll} style={{flex:1,display:"flex",overflowX:"auto",overflowY:"hidden",scrollSnapType:"x mandatory",scrollbarWidth:"none",WebkitOverflowScrolling:"touch",minHeight:0}}>
        {slides.map((s,i)=>(<IntroSlide key={i} s={s}/>))}
      </div>

      {/* Dots */}
      <div style={{display:"flex",justifyContent:"center",gap:7,padding:"10px 0 16px",flexShrink:0}}>
        {slides.map((_,i)=>(
          <span key={i} style={{width:i===idx?22:7,height:7,borderRadius:99,background:i===idx?"#111111":"#D6D6DB",transition:"all .25s"}}/>
        ))}
      </div>

      <div style={{padding:"0 22px 34px",flexShrink:0}}>
        <button onClick={()=>last?onDone():go(idx+1)} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",background:"#111111",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          {last?ctaLabel:"Avanti"}
        </button>
      </div>
    </div>
  );
}

/* AUTH — accesso + iscrizione (cliente / attività) */
function LoginScreen({onAuth,onSignup,onLogin,authBusy,authErr,authInfo,clearAuthMsg}) {
  const [view,setView] = useState("landing"); // landing | welcome | role | clientForm | business | businessForm
  const [role,setRole] = useState(null);      // "cliente" | "pro"
  const [plan,setPlan] = useState(null);      // piano attività scelto
  const [form,setForm] = useState({nome:"",cognome:"",email:"",tel:"",pwd:"",biz:"",username:""});
  const [showPwd,setShowPwd] = useState(false);
  const up = (k,v)=>setForm(f=>({...f,[k]:v}));

  // ── @username unico (stile Instagram) ──
  const [unameState,setUnameState] = useState({s:"idle"}); // idle|invalid|checking|free|taken
  const setUsername = (v)=> up("username", (v||"").toLowerCase().replace(/[^a-z0-9._]/g,"").slice(0,20));
  useEffect(()=>{
    const u = (form.username||"").trim();
    if(!u){ setUnameState({s:"idle"}); return; }
    if(!/^[a-z0-9._]{3,20}$/.test(u)){ setUnameState({s:"invalid"}); return; }
    setUnameState({s:"checking"});
    let cancel=false;
    const t=setTimeout(async()=>{
      try{
        const sb=await getSupabase();
        const {data}=await sb.from("profiles").select("id").eq("username",u).limit(1);
        if(cancel) return;
        setUnameState({s:(data&&data.length)?"taken":"free"});
      }catch(e){ if(!cancel) setUnameState({s:"free"}); } // se il DB non risponde non blocchiamo
    },450);
    return ()=>{cancel=true;clearTimeout(t);};
  },[form.username]);
  // Campo username con @ e indicatore di disponibilità
  const usernameField = () => (
    <div>
      <label style={lbl}>Username (il tuo ID pubblico)</label>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",fontSize:16,color:"#8A8A8E",fontWeight:700}}>@</span>
        <input value={form.username} onChange={e=>setUsername(e.target.value)} placeholder="es. mario.rossi" autoCapitalize="none" spellCheck={false} style={{...inp,padding:"15px 44px 15px 30px"}}/>
        {unameState.s==="checking" && <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#8A8A8E"}}>…</span>}
        {unameState.s==="free" && <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:16,color:"#0F9D6B",fontWeight:800}}>✓</span>}
        {unameState.s==="taken" && <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:16,color:"#E8506E",fontWeight:800}}>✕</span>}
      </div>
      {unameState.s==="invalid" && <p style={{fontSize:11.5,color:"#E8506E",margin:"6px 2px 0"}}>Usa 3-20 caratteri: lettere, numeri, punto o underscore.</p>}
      {unameState.s==="taken" && <p style={{fontSize:11.5,color:"#E8506E",margin:"6px 2px 0"}}>Questo username è già in uso. Provane un altro.</p>}
      {unameState.s==="free" && <p style={{fontSize:11.5,color:"#0F9D6B",margin:"6px 2px 0"}}>@{form.username} è disponibile!</p>}
    </div>
  );
  const unameOk = unameState.s==="free"; // richiesto per registrarsi
  const AuthMsg = () => (
    <>
      {authErr && <div style={{background:"#FFF1F4",border:"1px solid #F5C6D0",borderRadius:12,padding:"11px 14px",margin:"0 0 12px"}}><p style={{fontSize:13,color:"#C43459",margin:0,fontWeight:600}}>{authErr}</p></div>}
      {authInfo && <div style={{background:"#ECFDF5",border:"1px solid #B7EBD3",borderRadius:12,padding:"11px 14px",margin:"0 0 12px"}}><p style={{fontSize:13,color:"#0F9D6B",margin:0,fontWeight:600}}>{authInfo}</p></div>}
    </>
  );
  // Campo password con occhiello per mostrare/nascondere
  const pwdField = (val,onChange,ph) => (
    <div style={{position:"relative"}}>
      <input value={val} onChange={onChange} type={showPwd?"text":"password"} placeholder={ph} style={{width:"100%",border:"1.5px solid #E5E5EA",outline:"none",background:"rgba(255,255,255,.85)",borderRadius:14,padding:"15px 48px 15px 16px",fontSize:16,color:"#111111",fontFamily:"inherit",boxSizing:"border-box"}}/>
      <button type="button" onClick={()=>setShowPwd(s=>!s)} aria-label={showPwd?"Nascondi password":"Mostra password"} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {showPwd
          ? <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/></svg>
          : <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </div>
  );

  const wrap = (children) => (
    <div style={{minHeight:"100dvh",display:"flex",flexDirection:"column",fontFamily:"'Plus Jakarta Sans',sans-serif",padding:"0 22px"}}>{children}</div>
  );
  const Logo = ({mb=28}) => (
    <img src={`${import.meta.env.BASE_URL}logo-b.png`} alt="beauty" style={{height:56,width:"auto",display:"block",margin:`0 auto ${mb}px`,objectFit:"contain"}}/>
  );
  const inp = {width:"100%",border:"1.5px solid #E5E5EA",outline:"none",background:"rgba(255,255,255,.85)",borderRadius:14,padding:"15px 16px",fontSize:16,color:"#111111",fontFamily:"inherit",boxSizing:"border-box"};
  const lbl = {fontSize:12.5,fontWeight:700,color:"#8A8A8E",display:"block",marginBottom:7,marginLeft:2};

  // ── 0. LANDING — prima pagina ──
  if (view==="landing") return wrap(
    <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column"}}>
      {/* Logo + claim centrati */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
        <img src={`${import.meta.env.BASE_URL}logo-b.png`} alt="Beauty" style={{width:150,height:"auto",display:"block",marginBottom:34,filter:"drop-shadow(0 12px 30px rgba(138,107,255,.22))"}}/>
        <h1 style={{fontSize:34,fontWeight:900,color:"#111111",margin:"0 0 16px",letterSpacing:"-.04em",lineHeight:1.12}}>
          La tua bellezza.<br/>Il tuo <span style={{background:"linear-gradient(90deg,#FF7AC8,#8A6BFF)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent"}}>momento.</span>
        </h1>
        <p style={{fontSize:16.5,color:"#8A8A8E",margin:0,fontWeight:400,lineHeight:1.55,maxWidth:290}}>Tutto ciò che ti fa stare bene,<br/>in un'unica app.</p>
      </div>

      {/* Azioni in basso */}
      <div style={{padding:"0 4px 40px"}}>
        <button onClick={()=>setView("role")} className="btn-apple" style={{width:"100%",padding:"18px 0",borderRadius:999,cursor:"pointer",fontFamily:"inherit",fontSize:17,fontWeight:800,color:"#111111",background:"rgba(255,255,255,.72)",border:"1.5px solid #E5E5EA",boxShadow:"0 2px 10px rgba(0,0,0,.05)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",letterSpacing:.2}}>
          Registrati
        </button>
        <button onClick={()=>setView("welcome")} style={{width:"100%",marginTop:8,padding:"15px 0",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:15.5,fontWeight:700,color:"#111111"}}>
          Accedi
        </button>
      </div>
    </div>
  );

  // ── 1. WELCOME / ACCEDI ──
  if (view==="welcome") return wrap(
    <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",paddingBottom:20,position:"relative"}}>
      <button onClick={()=>setView("landing")} style={{position:"absolute",top:56,left:0,background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
      </button>
      <div style={{textAlign:"center",marginBottom:40}}>
        <Logo mb={26}/>
        <h1 style={{fontSize:32,fontWeight:900,color:"#111111",margin:"0 0 10px",letterSpacing:"-.04em",lineHeight:1.1}}>Benvenuto su Beauty</h1>
        <p style={{fontSize:16,color:"#8A8A8E",margin:0,fontWeight:400,lineHeight:1.5}}>Prenota i migliori professionisti<br/>beauty vicino a te.</p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:11}}>
        {/* Accedi con Apple → login diretto (credenziali automatiche) */}
        <button onClick={()=>onAuth({name:"Alessio",type:"cliente"})} style={{width:"100%",padding:"15px 0",borderRadius:14,border:"none",background:"#000000",color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.56 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.71-1.04-2.74-4.14-.02-2.59.02.03.02.02zM14.6 4.6c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z"/></svg>
          Accedi con Apple
        </button>
        {/* Accedi con Google → login diretto */}
        <button onClick={()=>onAuth({name:"Alessio",type:"cliente"})} className="btn-apple" style={{width:"100%",padding:"15px 0",borderRadius:14,border:"1.5px solid #E5E5EA",background:"rgba(255,255,255,.9)",color:"#111111",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
          <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Accedi con Google
        </button>
        {/* Accedi con email e password → form classico */}
        <button onClick={()=>setView("emailLogin")} className="btn-apple" style={{width:"100%",padding:"15px 0",borderRadius:14,border:"1.5px solid #E5E5EA",background:"rgba(255,255,255,.9)",color:"#111111",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 7l10 6 10-6"/></svg>
          Accedi con email
        </button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:12,margin:"22px 0"}}>
        <div style={{flex:1,height:1,background:"#EAEAEA"}}/>
        <span style={{fontSize:12,color:"#B0B0B0",fontWeight:600}}>oppure</span>
        <div style={{flex:1,height:1,background:"#EAEAEA"}}/>
      </div>

      <button onClick={()=>setView("role")} style={{width:"100%",padding:"15px 0",borderRadius:14,border:"none",background:"rgba(17,17,17,.05)",color:"#111111",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
        Registrati
      </button>

      {/* 🧪 Ingresso rapido per test (fase di sviluppo) */}
      <button onClick={()=>onAuth({name:"Alessio",type:"cliente"})} style={{width:"100%",marginTop:11,padding:"13px 0",borderRadius:14,border:"1.5px dashed #C9C9CF",background:"transparent",color:"#8A8A8E",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        🧪 Entra senza accesso (test)
      </button>

      <p style={{textAlign:"center",fontSize:12,color:"#B0B0B0",margin:"18px 0 30px",lineHeight:1.6}}>
        Continuando accetti i <span style={{color:"#111",fontWeight:600}}>Termini</span> e la <span style={{color:"#111",fontWeight:600}}>Privacy policy</span>
      </p>
    </div>
  );

  // ── 2. SCELTA RUOLO ──
  if (view==="role") {
    const opts = [
      {id:"cliente",title:"Sono un cliente",sub:"Cerca, prenota e scopri i professionisti beauty.",icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>},
      {id:"pro",title:"Sono un'attività",sub:"Gestisci prenotazioni, clienti e agenda del tuo salone.",icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/></svg>},
    ];
    return wrap(
      <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column",paddingTop:70}}>
        <button onClick={()=>setView("welcome")} style={{alignSelf:"flex-start",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:24,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
        </button>
        <h1 style={{fontSize:28,fontWeight:900,color:"#111111",margin:"0 0 8px",letterSpacing:"-.04em",lineHeight:1.15}}>Cosa vuoi fare<br/>su Beauty?</h1>
        <p style={{fontSize:15,color:"#8A8A8E",margin:"0 0 28px",fontWeight:400}}>Scegli come vuoi usare l'app.</p>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {opts.map(o=>{
            const sel = role===o.id;
            return (
              <button key={o.id} onClick={()=>setRole(o.id)} style={{width:"100%",padding:"22px 20px",borderRadius:22,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:16,background:"rgba(255,255,255,.85)",border:`2px solid ${sel?"#111111":"#EEEEEE"}`,boxShadow:sel?"0 6px 24px rgba(0,0,0,.08)":"0 2px 8px rgba(0,0,0,.04)",transition:"all .22s cubic-bezier(.22,1,.36,1)"}}>
                <div style={{width:50,height:50,borderRadius:16,background:sel?"#111111":"#F2F2F4",display:"flex",alignItems:"center",justifyContent:"center",color:sel?"#fff":"#8A8A8E",flexShrink:0,transition:"all .22s"}}>{o.icon}</div>
                <div style={{flex:1}}>
                  <p style={{fontSize:17,fontWeight:800,color:"#111111",margin:"0 0 3px"}}>{o.title}</p>
                  <p style={{fontSize:13,color:"#8A8A8E",margin:0,lineHeight:1.4}}>{o.sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{flex:1}}/>
        <button disabled={!role} onClick={()=>setView(role==="pro"?"businessIntro":"clientIntro")} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",marginBottom:30,background:role?"#111111":"#EDEDED",color:role?"#fff":"#B0B0B0",fontSize:16,fontWeight:700,cursor:role?"pointer":"default",fontFamily:"inherit",transition:"all .2s"}}>
          Continua
        </button>
      </div>
    );
  }

  // ── LOGIN CLASSICO CON EMAIL E PASSWORD ──
  if (view==="emailLogin") {
    const valid = form.email.trim() && form.tel.trim(); // tel qui riusato come password
    return wrap(
      <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column",paddingTop:70}}>
        <button onClick={()=>setView("welcome")} style={{alignSelf:"flex-start",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:24,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
        </button>
        <h1 style={{fontSize:28,fontWeight:900,color:"#111111",margin:"0 0 8px",letterSpacing:"-.04em"}}>Accedi</h1>
        <p style={{fontSize:15,color:"#8A8A8E",margin:"0 0 26px",fontWeight:400}}>Inserisci le tue credenziali.</p>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div><label style={lbl}>Email</label><input value={form.email} onChange={e=>up("email",e.target.value)} type="email" inputMode="email" placeholder="tu@email.com" style={inp}/></div>
          <div><label style={lbl}>Password</label>{pwdField(form.tel,e=>up("tel",e.target.value),"La tua password")}</div>
          <p style={{fontSize:13,color:"#8A8A8E",margin:"2px 2px 0",textAlign:"right",fontWeight:600}}>Password dimenticata?</p>
        </div>
        <div style={{flex:1}}/>
        <AuthMsg/>
        <button disabled={!valid||authBusy} onClick={()=>onLogin&&onLogin({email:form.email,password:form.tel})} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",marginBottom:14,background:(valid&&!authBusy)?"#111111":"#EDEDED",color:(valid&&!authBusy)?"#fff":"#B0B0B0",fontSize:16,fontWeight:700,cursor:(valid&&!authBusy)?"pointer":"default",fontFamily:"inherit"}}>{authBusy?"Accesso…":"Accedi"}</button>
        <p style={{textAlign:"center",fontSize:13,color:"#8A8A8E",margin:"0 0 30px"}}>Non hai un account? <span onClick={()=>{clearAuthMsg&&clearAuthMsg();setView("role");}} style={{color:"#111",fontWeight:700,cursor:"pointer"}}>Registrati</span></p>
      </div>
    );
  }

  // ── INTRO CLIENTE (card a scorrimento) ──
  if (view==="clientIntro") return (
    <IntroCarousel onBack={()=>setView("role")} onDone={()=>setView("clientForm")} ctaLabel="Crea il mio account"
      slides={[
        {icon:"🔍",title:"Trova i migliori vicino a te",text:"Scopri saloni, barbieri, nail artist ed esteti selezionati nella tua zona.",details:[
          {t:"Cerca per nome o servizio",s:"Trova un negozio, una persona o un trattamento in un attimo."},
          {t:"Mappa interattiva",s:"Vedi chi è vicino a te, la distanza e chi è disponibile oggi."},
          {t:"Filtra per categoria",s:"Capelli, barba, unghie, estetica, tattoo e altro ancora."},
        ]},
        {icon:"📸",title:"Fatti ispirare",text:"Scorri i post dei professionisti come su Instagram e trova il look perfetto per te.",details:[
          {t:"Feed di ispirazioni",s:"Foto di tagli, colori, unghie e look reali dei professionisti."},
          {t:"Salva i tuoi preferiti",s:"Metti like e salva le idee che ti piacciono di più."},
          {t:"Invia al professionista",s:"Manda la foto che ti ispira e chiedi di realizzarla, anche a chi è di zona."},
        ]},
        {icon:"📅",title:"Prenota in pochi secondi",text:"Scegli servizio, giorno e ora. Vedi la disponibilità in tempo reale.",details:[
          {t:"Disponibilità reale",s:"Gli orari già occupati sono barrati: prenoti solo ciò che è libero."},
          {t:"Conferma immediata",s:"L'appuntamento va subito nelle tue Prenotazioni."},
          {t:"Promemoria automatico",s:"Ti avvisiamo prima dell'appuntamento così non lo dimentichi."},
        ]},
        {icon:"💬",title:"Chatta e ricevi offerte",text:"Invia una foto del look che vuoi e ricevi proposte su misura dai professionisti.",details:[
          {t:"Invia la tua ispirazione",s:"Una foto del taglio o del look che desideri, direttamente in chat."},
          {t:"Ricevi un'offerta su misura",s:"Il professionista ti propone servizio, prezzo e durata."},
          {t:"Accetta e prenoti",s:"Un tap per confermare: l'appuntamento è fatto."},
        ]},
      ]}/>
  );

  // ── INTRO ATTIVITÀ (card a scorrimento con i plus) ──
  if (view==="businessIntro") return (
    <IntroCarousel onBack={()=>setView("role")} onDone={()=>setView("business")} ctaLabel="Scopri i piani"
      slides={[
        {icon:"📅",title:"Agenda intelligente",text:"Gestisci appuntamenti, staff e disponibilità in tempo reale, senza sovrapposizioni.",details:[
          {t:"Calendario per giorno e mese",s:"Vedi tutta la tua giornata a colpo d'occhio."},
          {t:"Niente sovrapposizioni",s:"Il sistema blocca in automatico gli orari già occupati."},
          {t:"Gestione staff",s:"Ogni collaboratore ha la sua agenda e i suoi servizi."},
          {t:"Prenotazioni online 24/7",s:"I clienti prenotano da soli, anche di notte."},
        ]},
        {icon:"💬",title:"Chat e offerte su misura",text:"Parla con i clienti e invia proposte personalizzate in stile Vinted.",details:[
          {t:"Ricevi le richieste",s:"Il cliente ti manda una foto del look che desidera."},
          {t:"Crea un'offerta",s:"Imposta servizio, descrizione, prezzo, durata e data proposta."},
          {t:"Conferma automatica",s:"Se il cliente accetta, l'appuntamento entra in agenda da solo."},
        ]},
        {icon:"👥",title:"Clienti fidelizzati",text:"Schede clienti, storico, note e promemoria automatici per farli tornare.",details:[
          {t:"Scheda cliente completa",s:"Storico visite, servizi preferiti e spesa totale."},
          {t:"Note personali",s:"Annota preferenze, allergie o dettagli utili."},
          {t:"Promemoria automatici",s:"Riduci i mancati appuntamenti con avvisi puntuali."},
        ]},
        {icon:"📸",title:"Mostra le tue creazioni",text:"Pubblica i tuoi lavori come su Instagram e fatti scoprire da nuovi clienti.",details:[
          {t:"Pubblica i tuoi lavori",s:"Carica foto di tagli, colori, unghie e look che realizzi."},
          {t:"Fatti scoprire",s:"I clienti trovano i tuoi post nel feed e visitano il tuo profilo."},
          {t:"Trasforma i like in prenotazioni",s:"Da un post ispirante il cliente arriva dritto alla prenotazione."},
        ]},
        {icon:"📈",title:"Cresci con i dati",text:"Statistiche su incassi, servizi più richiesti e andamento della tua attività.",details:[
          {t:"Incassi e andamento",s:"Guadagni per giorno, settimana e mese sempre sotto controllo."},
          {t:"Servizi più richiesti",s:"Scopri cosa funziona di più e punta su quello."},
          {t:"Nuovi clienti",s:"Monitora quanti nuovi clienti arrivano dall'app."},
        ]},
      ]}/>
  );

  // ── 3. FORM CLIENTE ──
  if (view==="clientForm") {
    const valid = form.nome.trim() && form.email.trim() && form.pwd.length>=6 && unameOk;
    return wrap(
      <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column",paddingTop:70,paddingBottom:20,overflowY:"auto"}}>
        <button onClick={()=>setView("clientIntro")} style={{alignSelf:"flex-start",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:20,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
        </button>
        <h1 style={{fontSize:28,fontWeight:900,color:"#111111",margin:"0 0 8px",letterSpacing:"-.04em"}}>Crea il tuo account</h1>
        <p style={{fontSize:15,color:"#8A8A8E",margin:"0 0 24px",fontWeight:400}}>Bastano pochi dati e sei subito pronto.</p>

        <div style={{display:"flex",flexDirection:"column",gap:15}}>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><label style={lbl}>Nome</label><input value={form.nome} onChange={e=>up("nome",e.target.value)} placeholder="Mario" style={inp}/></div>
            <div style={{flex:1}}><label style={lbl}>Cognome</label><input value={form.cognome} onChange={e=>up("cognome",e.target.value)} placeholder="Rossi" style={inp}/></div>
          </div>
          {usernameField()}
          <div><label style={lbl}>Email</label><input value={form.email} onChange={e=>up("email",e.target.value)} type="email" inputMode="email" placeholder="mario.rossi@email.com" style={inp}/></div>
          <div><label style={lbl}>Numero di telefono</label><input value={form.tel} onChange={e=>up("tel",e.target.value)} type="tel" inputMode="tel" placeholder="+39 333 123 4567" style={inp}/></div>
          <div><label style={lbl}>Password</label>{pwdField(form.pwd,e=>up("pwd",e.target.value),"Almeno 6 caratteri")}
            {form.pwd.length>0 && form.pwd.length<6 && <p style={{fontSize:11.5,color:"#E8506E",margin:"6px 2px 0"}}>La password deve avere almeno 6 caratteri.</p>}
          </div>
        </div>

        <div style={{height:20}}/>
        <AuthMsg/>
        <button disabled={!valid||authBusy} onClick={()=>onSignup&&onSignup({email:form.email,password:form.pwd,role:"cliente",name:(form.nome.trim()+" "+form.cognome.trim()).trim()||"Cliente",extra:{telefono:form.tel,username:form.username.trim(),nome:form.nome.trim(),cognome:form.cognome.trim()}})} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",marginBottom:14,background:(valid&&!authBusy)?"#111111":"#EDEDED",color:(valid&&!authBusy)?"#fff":"#B0B0B0",fontSize:16,fontWeight:700,cursor:(valid&&!authBusy)?"pointer":"default",fontFamily:"inherit",transition:"all .2s"}}>
          {authBusy?"Creazione…":"Crea account e inizia"}
        </button>
        <p style={{textAlign:"center",fontSize:12,color:"#B0B0B0",margin:"0 0 30px",lineHeight:1.6}}>Registrandoti accetti i <span style={{color:"#111",fontWeight:600}}>Termini</span> e la <span style={{color:"#111",fontWeight:600}}>Privacy</span></p>
      </div>
    );
  }

  // ── 3b. FORM ATTIVITÀ — crea account dopo la scelta del piano ──
  if (view==="businessForm") {
    const valid = form.biz.trim() && form.email.trim() && form.pwd.length>=6 && unameOk;
    return wrap(
      <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column",paddingTop:70,paddingBottom:20,overflowY:"auto"}}>
        <button onClick={()=>setView("business")} style={{alignSelf:"flex-start",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:20,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
        </button>
        <h1 style={{fontSize:28,fontWeight:900,color:"#111111",margin:"0 0 8px",letterSpacing:"-.04em"}}>Crea l'account attività</h1>
        <p style={{fontSize:15,color:"#8A8A8E",margin:"0 0 18px",fontWeight:400}}>Ultimo passo per iniziare con Beauty.</p>

        {plan && <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(17,17,17,.05)",borderRadius:14,padding:"12px 15px",marginBottom:20}}>
          <span style={{fontSize:13.5,color:"#111",fontWeight:700}}>Piano scelto: {plan}</span>
          <button onClick={()=>setView("business")} style={{background:"none",border:"none",cursor:"pointer",fontSize:12.5,fontWeight:700,color:"#8A8A8E",fontFamily:"inherit"}}>Cambia</button>
        </div>}

        <div style={{display:"flex",flexDirection:"column",gap:15}}>
          <div><label style={lbl}>Nome attività</label><input value={form.biz} onChange={e=>up("biz",e.target.value)} placeholder="Es. Salon Elite" style={inp}/></div>
          {usernameField()}
          <div><label style={lbl}>Nome referente</label><input value={form.nome} onChange={e=>up("nome",e.target.value)} placeholder="Mario Rossi" style={inp}/></div>
          <div><label style={lbl}>Email</label><input value={form.email} onChange={e=>up("email",e.target.value)} type="email" inputMode="email" placeholder="info@tuosalone.com" style={inp}/></div>
          <div><label style={lbl}>Numero di telefono</label><input value={form.tel} onChange={e=>up("tel",e.target.value)} type="tel" inputMode="tel" placeholder="+39 333 123 4567" style={inp}/></div>
          <div><label style={lbl}>Password</label>{pwdField(form.pwd,e=>up("pwd",e.target.value),"Almeno 6 caratteri")}
            {form.pwd.length>0 && form.pwd.length<6 && <p style={{fontSize:11.5,color:"#E8506E",margin:"6px 2px 0"}}>La password deve avere almeno 6 caratteri.</p>}
          </div>
        </div>

        <div style={{height:20}}/>
        <AuthMsg/>
        <button disabled={!valid||authBusy} onClick={()=>{try{localStorage.setItem("ba-pro-plan",plan||"Prova gratuita");}catch(e){} onSignup&&onSignup({email:form.email,password:form.pwd,role:"pro",name:form.biz.trim()||form.nome.trim()||"Titolare",extra:{business_name:form.biz.trim()||"La tua attività",telefono:form.tel,plan:plan||"Prova gratuita",username:form.username.trim(),referente:form.nome.trim()}});}} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",marginBottom:14,background:(valid&&!authBusy)?"#111111":"#EDEDED",color:(valid&&!authBusy)?"#fff":"#B0B0B0",fontSize:16,fontWeight:700,cursor:(valid&&!authBusy)?"pointer":"default",fontFamily:"inherit",transition:"all .2s"}}>
          {authBusy?"Creazione…":"Crea account attività"}
        </button>
        <p style={{textAlign:"center",fontSize:12,color:"#B0B0B0",margin:"0 0 30px",lineHeight:1.6}}>Registrandoti accetti i <span style={{color:"#111",fontWeight:600}}>Termini</span> e la <span style={{color:"#111",fontWeight:600}}>Privacy</span></p>
      </div>
    );
  }

  // ── 4. ATTIVITÀ — solo i piani, ognuno espandibile ──
  if (view==="business") {
    const plans = [
      {name:"Prova gratuita",price:"3 mesi gratis",sub:"Offerta di lancio",trial:true,cta:"Inizia la prova gratuita",
        desc:"Prova tutte le funzioni Pro per 3 mesi, senza pagare nulla.",
        feat:[
          {t:"Tutte le funzioni Pro incluse",s:"Agenda, chat, offerte, statistiche e staff illimitato."},
          {t:"Nessuna carta richiesta",s:"Inizi subito, senza inserire dati di pagamento."},
          {t:"Disdici quando vuoi",s:"Alla fine dei 3 mesi scegli se continuare."},
        ]},
      {name:"Base",price:"12,99€/mese",sub:"Per iniziare",cta:"Scegli Base",
        desc:"L'essenziale per gestire prenotazioni e clienti del tuo salone.",
        feat:[
          {t:"Agenda e prenotazioni",s:"Calendario, disponibilità in tempo reale e prenotazioni online."},
          {t:"Profilo pubblico",s:"La tua vetrina su Beauty con foto, servizi e recensioni."},
          {t:"Chat coi clienti",s:"Rispondi e accordati direttamente in app."},
        ]},
      {name:"Pro",price:"29€/mese",sub:"Per crescere",hot:true,cta:"Scegli Pro",
        desc:"Tutto il necessario per far crescere davvero la tua attività.",
        feat:[
          {t:"Tutto di Base",s:"Incluse tutte le funzioni del piano Base."},
          {t:"Staff illimitato",s:"Agende separate per ogni collaboratore."},
          {t:"Offerte su misura",s:"Invia proposte personalizzate ai clienti in chat."},
          {t:"Statistiche avanzate",s:"Incassi, servizi top e andamento della tua attività."},
          {t:"Notifiche & promemoria",s:"Riduci i mancati appuntamenti in automatico."},
        ]},
    ];
    return wrap(
      <div className="ba-fade" style={{flex:1,display:"flex",flexDirection:"column",paddingTop:60,paddingBottom:24,overflowY:"auto"}}>
        <button onClick={()=>setView("businessIntro")} style={{alignSelf:"flex-start",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:18,display:"flex",alignItems:"center",gap:6,color:"#111",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Indietro
        </button>
        <h1 style={{fontSize:27,fontWeight:900,color:"#111111",margin:"0 0 8px",letterSpacing:"-.04em",lineHeight:1.15}}>Scegli il tuo piano</h1>
        <p style={{fontSize:15,color:"#8A8A8E",margin:"0 0 22px",fontWeight:400}}>Tocca "Mostra cosa include" per vedere i dettagli di ogni piano.</p>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {plans.map((p,i)=>(
            <PlanCard key={i} p={p} onChoose={()=>{setPlan(p.name);setView("businessForm");}}/>
          ))}
        </div>
        <p style={{textAlign:"center",fontSize:12,color:"#B0B0B0",margin:"18px 0 10px",lineHeight:1.6}}>Puoi cambiare o disdire quando vuoi.</p>
      </div>
    );
  }

  return null;
}

/* HOME CLIENTE */
/* Pulsante CTA stile Apple/Fresha — bianco, bordo grigio chiaro, testo nero */
const BTN_APPLE = { background:"#FFFFFF", border:"1.5px solid #E5E5EA", color:"#111111", boxShadow:"0 1px 3px rgba(0,0,0,.05)", cursor:"pointer", fontFamily:"inherit" };

/* Contatore animato che parte quando entra nello schermo */
function AnimatedCounter({ target, duration=1600, prefix="", suffix="", decimals=0 }) {
  const [val,setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting && !started.current){
          started.current = true;
          const t0 = performance.now();
          const tick = (now)=>{
            const p = Math.min(1,(now-t0)/duration);
            const eased = 1-Math.pow(1-p,3); // easeOutCubic
            setVal(target*eased);
            if(p<1) requestAnimationFrame(tick);
            else setVal(target);
          };
          requestAnimationFrame(tick);
        }
      });
    },{threshold:0.4});
    io.observe(el);
    return ()=>io.disconnect();
  },[target,duration]);
  const shown = decimals>0 ? val.toFixed(decimals).replace(".",",") : Math.round(val).toLocaleString("it-IT");
  return <span ref={ref}>{prefix}{shown}{suffix}</span>;
}

/* Sezione statistiche app — stile Fresha, numeri animati */
function AppStats() {
  const stats = [
    {n:50000, prefix:"+", suffix:"", label:"Appuntamenti prenotati"},
    {n:5000,  prefix:"+", suffix:"", label:"Professionisti iscritti"},
    {n:100,   prefix:"+", suffix:"", label:"Città disponibili"},
    {n:4.9,   prefix:"",  suffix:"", label:"Stelle di recensioni", dec:1},
  ];
  return (
    <div style={{padding:"8px 20px 4px"}}>
      <div className="glass-card" style={{borderRadius:28,padding:"26px 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"22px 12px"}}>
        {stats.map((s,i)=>(
          <div key={i} style={{textAlign:"center"}}>
            <p style={{fontSize:28,fontWeight:900,color:"#111111",margin:"0 0 4px",letterSpacing:"-.04em",fontVariantNumeric:"tabular-nums"}}>
              <AnimatedCounter target={s.n} prefix={s.prefix} suffix={s.suffix} decimals={s.dec||0}/>
            </p>
            <p style={{fontSize:12,fontWeight:600,color:"#8A8A8E",margin:0,lineHeight:1.3}}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Recensioni — card grandi con avatar, nome, testo, stelle */
const HOME_REVIEWS = [
  {name:"Giulia M.", emoji:"👩🏻", city:"Milano", stars:5, text:"App bellissima e semplicissima. Prenotare dal mio parrucchiere ci mette due secondi."},
  {name:"Luca R.",   emoji:"🧔🏻", city:"Torino", stars:5, text:"Finalmente qualcosa di elegante e non complicato. La uso ogni mese per il barbiere."},
  {name:"Martina S.",emoji:"👩🏽", city:"Roma",   stars:5, text:"Adoro poter chattare col professionista e ricevere un'offerta su misura. Top."},
  {name:"Franco P.", emoji:"👨🏼", city:"Bologna",stars:4, text:"Molto intuitiva anche per me che non sono giovanissimo. Interfaccia pulita e chiara."},
];
function HomeReviews() {
  return (
    <div style={{marginTop:22}}>
      <div style={{padding:"0 20px",marginBottom:14}}>
        <p style={{fontSize:20,fontWeight:900,color:"#111111",margin:0,letterSpacing:"-.04em"}}>Cosa dicono di noi</p>
        <p style={{fontSize:12.5,color:"#8A8A8E",margin:"3px 0 0",fontWeight:500}}>Migliaia di persone si affidano a Beauty</p>
      </div>
      <div style={{display:"flex",gap:14,overflowX:"auto",padding:"4px 20px 8px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {HOME_REVIEWS.map((r,i)=>(
          <div key={i} className="glass-card" style={{flexShrink:0,width:280,borderRadius:26,padding:"20px 20px 22px"}}>
            <div style={{display:"flex",gap:1,marginBottom:12}}>
              {Array.from({length:5}).map((_,s)=>(
                <svg key={s} width="15" height="15" viewBox="0 0 24 24" fill={s<r.stars?"#FFB020":"none"} stroke={s<r.stars?"#FFB020":"#D8D8D8"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ))}
            </div>
            <p style={{fontSize:14.5,color:"#333",margin:"0 0 16px",lineHeight:1.55,fontWeight:500}}>“{r.text}”</p>
            <div style={{display:"flex",alignItems:"center",gap:11}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,rgba(255,122,200,.18),rgba(91,124,255,.18))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{r.emoji}</div>
              <div>
                <p style={{fontSize:13.5,fontWeight:800,color:"#111111",margin:0}}>{r.name}</p>
                <p style={{fontSize:11.5,color:"#ADADAD",margin:0}}>📍 {r.city}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Data formattata breve, es. "Sab 4 lug" */
const DOW_IT = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const MON_IT_SHORT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const MON_IT_FULL = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const fmtDateShort = (d) => `${DOW_IT[d.getDay()]} ${d.getDate()} ${MON_IT_SHORT[d.getMonth()]}`;
// Elenco dei giorni prenotabili: da oggi in poi. "oggi" resta la chiave del giorno corrente
// (compatibile con i dati esistenti); i giorni successivi usano la data ISO come chiave.
const upcomingDays = (n=21) => {
  const out = []; const base = new Date(); base.setHours(0,0,0,0);
  for(let i=0;i<n;i++){
    const d = new Date(base); d.setDate(base.getDate()+i);
    const key = i===0 ? "oggi" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const label = i===0 ? "Oggi" : i===1 ? "Domani" : DOW_IT[d.getDay()];
    out.push({key,label,num:d.getDate(),mon:MON_IT_SHORT[d.getMonth()]});
  }
  return out;
};
// Data odierna a mezzanotte
const startOfToday = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
// Chiave giorno: "oggi" per la data corrente, altrimenti ISO YYYY-MM-DD
const dayKeyOf = (d) => { const t=startOfToday(); const x=new Date(d); x.setHours(0,0,0,0); return x.getTime()===t.getTime() ? "oggi" : `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
// Data (Date) da una chiave giorno
const dateFromKey = (key) => { if(key==="oggi"||!key) return startOfToday(); if(key==="ieri"){const d=startOfToday();d.setDate(d.getDate()-1);return d;} const [y,m,dd]=key.split("-").map(Number); return new Date(y,m-1,dd); };
// Etichetta leggibile di una chiave giorno
const fmtDayKey = (key) => {
  if(key==="oggi") return "Oggi";
  if(key==="ieri") return "Ieri";
  const d = dateFromKey(key); const t=startOfToday();
  const diff = Math.round((d - t)/86400000);
  if(diff===1) return "Domani";
  return `${DOW_IT[d.getDay()]} ${d.getDate()} ${MON_IT_SHORT[d.getMonth()]} ${d.getFullYear()!==t.getFullYear()?d.getFullYear():""}`.trim();
};

/* Calendario a comparsa per scegliere un giorno (anche mesi in avanti) */
function DayPickerSheet({value, onPick, onClose}) {
  const today = startOfToday();
  const sel = dateFromKey(value);
  const [vm,setVm] = useState(new Date(sel.getFullYear(), sel.getMonth(), 1));
  const y=vm.getFullYear(), m=vm.getMonth();
  const firstDow = (new Date(y,m,1).getDay()+6)%7; // lunedì-first
  const days = new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<firstDow;i++) cells.push(null); for(let d=1;d<=days;d++) cells.push(d);
  const canPrev = (y>today.getFullYear())||(y===today.getFullYear()&&m>today.getMonth());
  const sameDay = (d)=> sel.getFullYear()===y && sel.getMonth()===m && sel.getDate()===d;
  const isToday = (d)=> today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
  const isPast = (d)=> new Date(y,m,d) < today;
  return createPortal(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1100,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.white,borderRadius:"26px 26px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"18px 18px calc(24px + env(safe-area-inset-bottom,0px))"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontSize:16,fontWeight:800,color:T.ink,margin:0}}>Scegli il giorno</h3>
          <button onClick={onClose} className="clay-soft" style={{background:T.surface,border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:14,color:T.inkMid}}>×</button>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={()=>canPrev&&setVm(new Date(y,m-1,1))} disabled={!canPrev} style={{width:34,height:34,borderRadius:"50%",border:"none",background:canPrev?T.surface:"transparent",cursor:canPrev?"pointer":"default",opacity:canPrev?1:.3,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{fontSize:15,fontWeight:800,color:T.ink}}>{MON_IT_FULL[m]} {y}</span>
          <button onClick={()=>setVm(new Date(y,m+1,1))} style={{width:34,height:34,borderRadius:"50%",border:"none",background:T.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:5}}>
          {["L","M","M","G","V","S","D"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,fontWeight:700,color:T.inkSoft,padding:"3px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={i}/>;
            const past = isPast(d), selq = sameDay(d), tod = isToday(d);
            return (
              <button key={i} disabled={past} onClick={()=>{ onPick(dayKeyOf(new Date(y,m,d))); onClose(); }}
                style={{aspectRatio:"1",borderRadius:11,border:tod&&!selq?`1.5px solid ${T.ink}`:"none",cursor:past?"default":"pointer",
                  background:selq?T.ink:(past?"transparent":T.surface),color:selq?T.white:(past?"#CFCFCF":T.ink),
                  fontSize:13,fontWeight:selq||tod?800:500,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",opacity:past?.5:1}}>
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* Colonna scrollabile stile ruota (time picker iOS) */
function WheelColumn({values, value, onChange, ITEM=44}) {
  const ref = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    const i = values.indexOf(value);
    if (ref.current && i >= 0) ref.current.scrollTop = i * ITEM;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!ref.current) return;
      let i = Math.round(ref.current.scrollTop / ITEM);
      i = Math.max(0, Math.min(values.length - 1, i));
      ref.current.scrollTo({ top: i * ITEM, behavior: "smooth" });
      if (values[i] !== value) onChange(values[i]);
    }, 100);
  };
  return (
    <div ref={ref} onScroll={handleScroll} className="no-scrollbar"
      style={{ height: ITEM*5, overflowY: "scroll", scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch", flex: 1, position: "relative", zIndex: 1 }}>
      <div style={{ height: ITEM*2 }} />
      {values.map(v => (
        <div key={v} onClick={()=>{ const i=values.indexOf(v); ref.current&&ref.current.scrollTo({top:i*ITEM,behavior:"smooth"}); onChange(v); }}
          style={{ height: ITEM, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: v===value?800:500, color: v===value?T.ink:"#C7C7CC", cursor: "pointer", fontVariantNumeric: "tabular-nums", transition: "color .15s ease" }}>
          {v}
        </div>
      ))}
      <div style={{ height: ITEM*2 }} />
    </div>
  );
}

/* Sheet Data (calendario) + Ora (ruota) */
function DateTimeSheet({ initialDate, initialTime, onClose, onConfirm, onClear }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const base = initialDate || today;
  const [viewM, setViewM] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const [sel, setSel] = useState(initialDate || null);
  const [hh, setHh] = useState(initialTime ? initialTime.split(":")[0] : "10");
  const [mm, setMm] = useState(initialTime ? initialTime.split(":")[1] : "00");
  const hours = Array.from({length:24}, (_,i)=>String(i).padStart(2,"0"));
  const mins  = Array.from({length:12}, (_,i)=>String(i*5).padStart(2,"0"));
  const WEEK = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
  const first = new Date(viewM.getFullYear(), viewM.getMonth(), 1);
  const startOffset = (first.getDay()+6)%7; // lunedì = 0
  const daysInMonth = new Date(viewM.getFullYear(), viewM.getMonth()+1, 0).getDate();
  const cells = [];
  for (let i=0;i<startOffset;i++) cells.push(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(new Date(viewM.getFullYear(), viewM.getMonth(), d));
  const canPrev = viewM > new Date(today.getFullYear(), today.getMonth(), 1);
  const same = (a,b)=>a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  const ITEM = 44;
  return (
    <Modal title="Scegli data e ora" onClose={onClose}>
        {/* Calendario */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <button onClick={()=>canPrev&&setViewM(new Date(viewM.getFullYear(),viewM.getMonth()-1,1))} disabled={!canPrev} style={{width:34,height:34,borderRadius:"50%",border:"none",background:canPrev?T.surface:"transparent",cursor:canPrev?"pointer":"default",opacity:canPrev?1:.35,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{fontSize:15,fontWeight:800,color:T.ink}}>{MON_IT_FULL[viewM.getMonth()]} {viewM.getFullYear()}</span>
          <button onClick={()=>setViewM(new Date(viewM.getFullYear(),viewM.getMonth()+1,1))} style={{width:34,height:34,borderRadius:"50%",border:"none",background:T.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
          {WEEK.map(w=><div key={w} style={{textAlign:"center",fontSize:10.5,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",padding:"2px 0"}}>{w}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:20}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={"e"+i}/>;
            const past = d < today;
            const isSel = same(d,sel);
            const isToday = same(d,today);
            return (
              <button key={i} disabled={past} onClick={()=>setSel(d)} style={{aspectRatio:"1",borderRadius:"50%",border:"none",cursor:past?"default":"pointer",background:isSel?T.brand:"transparent",color:isSel?"#fff":past?"#D5D5DA":T.ink,fontSize:14,fontWeight:isSel||isToday?800:500,fontFamily:"inherit",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {d.getDate()}
                {isToday&&!isSel&&<span style={{position:"absolute",bottom:5,width:4,height:4,borderRadius:"50%",background:T.brand}}/>}
              </button>
            );
          })}
        </div>

        {/* Ora — ruota stile sveglia iPhone */}
        <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,margin:"0 0 8px"}}>Orario</p>
        <div style={{position:"relative",display:"flex",alignItems:"stretch",justifyContent:"center",gap:0,marginBottom:22,borderRadius:18,background:"#F7F7F9",overflow:"hidden"}}>
          {/* banda selezione centrale */}
          <div style={{position:"absolute",top:ITEM*2,left:12,right:12,height:ITEM,borderRadius:12,background:"#FFFFFF",boxShadow:"0 1px 4px rgba(0,0,0,.06)",zIndex:0,pointerEvents:"none"}}/>
          <WheelColumn values={hours} value={hh} onChange={setHh} ITEM={ITEM}/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:T.ink,zIndex:1}}>:</div>
          <WheelColumn values={mins} value={mm} onChange={setMm} ITEM={ITEM}/>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClear} style={{flex:1,padding:"14px 0",borderRadius:14,border:`1.5px solid ${T.line}`,background:T.white,color:T.inkMid,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Qualsiasi</button>
          <button onClick={()=>onConfirm(sel, sel?`${hh}:${mm}`:null)} style={{flex:2,padding:"14px 0",borderRadius:14,border:"none",background:T.brand,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 18px ${T.brand}44`}}>Conferma</button>
        </div>
    </Modal>
  );
}

function ClHome({nav,favorites,setFavorites,myAppts=[],conversations=[],user,avatarConfig,unreadChats=0,unseenNotifs=0}) {
  const [city,setCity] = useState("Milano");
  const [userCoords,setUserCoords] = useState(DEFAULT_COORDS);
  const futuri = myAppts.filter(a=>a.status==="confermato"||a.status==="in attesa");
  const passati = myAppts.filter(a=>a.status==="completato");
  const nextAppt = futuri[0]||null;
  const lastAppt = !nextAppt ? (passati[0]||null) : null;
  const banner = nextAppt||lastAppt;
  const [showCity,setShowCity] = useState(false);
  const [citySearch,setCitySearch] = useState("");
  const [geoStatus,setGeoStatus] = useState(null);
  const [selCat,setSelCat] = useState(null);
  const [radius,setRadius] = useState(10);
  const [q,setQ] = useState("");
  const [searching,setSearching] = useState(false);
  const [placeResults,setPlaceResults] = useState([]);
  const [placeLoading,setPlaceLoading] = useState(false);
  const [viewMode,setViewMode] = useState("lista");
  const [searchCenter,setSearchCenter] = useState(DEFAULT_COORDS);
  const [selectedPro,setSelectedPro] = useState(null);
  const [darkMap,setDarkMap] = useState(false);
  const [showMap,setShowMap] = useState(false);
  // Card di ricerca principale: filtro categoria + data/ora
  const [filterCat,setFilterCat] = useState(null);   // macro id | null = qualsiasi
  const [filterDate,setFilterDate] = useState(null);  // etichetta giorno | null
  const [filterTime,setFilterTime] = useState(null);  // orario | null
  const [showCatPick,setShowCatPick] = useState(false);
  const [showDatePick,setShowDatePick] = useState(false);

  // Solo professionisti registrati e abbonati alla piattaforma: nessun dato esterno o da Google
  const platformPros = useMemo(() => ALL_PROS.filter(p=>p.subscribed), []);

  const prosWithDist = useMemo(
    () => platformPros.map(p=>({...p,distKm:distanceKm(userCoords.lat,userCoords.lng,p.lat,p.lng)})),
    [userCoords, platformPros]
  );

  // Distanze ricalcolate dal centro mappa: la ricerca si aggiorna quando l'utente sposta la mappa
  const prosFromSearchCenter = useMemo(
    () => platformPros.map(p=>({...p,distKm:distanceKm(searchCenter.lat,searchCenter.lng,p.lat,p.lng)})),
    [searchCenter, platformPros]
  );

  const selMacro = selCat ? MACRO_CATS.find(c=>c.id===selCat) : null;
  const filteredPros = selMacro
    ? prosFromSearchCenter.filter(p=>{
        const ids = selMacro.catIds;
        return (ids.length===0 || ids.includes(p.catId)) && p.distKm<=radius;
      }).sort((a,b)=>a.distKm-b.distKm)
    : [];

  const openCategory = (macroId) => { setSelCat(macroId); setSearchCenter(userCoords); setViewMode("lista"); setSelectedPro(null); };

  const citySuggestions = ALL_CITIES.filter(c=>c.toLowerCase().includes(citySearch.toLowerCase()));

  // Ricerca luoghi reali (qualsiasi città/indirizzo nel mondo) via Nominatim/OpenStreetMap, debounced
  useEffect(() => {
    if (citySearch.length < 2) { setPlaceResults([]); return; }
    setPlaceLoading(true);
    const t = setTimeout(() => {
      searchPlaces(citySearch)
        .then(res => setPlaceResults(res))
        .catch(() => setPlaceResults([]))
        .finally(() => setPlaceLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [citySearch]);

  const selectPlace = (place) => {
    const coords = {lat:parseFloat(place.lat),lng:parseFloat(place.lon)};
    setUserCoords(coords);setSearchCenter(coords);
    setCity(place.address?.city || place.address?.town || place.address?.village || place.display_name.split(",")[0]);
    setShowCity(false);setSelCat(null);setCitySearch("");setPlaceResults([]);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    if (!window.isSecureContext) { setGeoStatus("insecure"); return; }
    setGeoStatus("loading");
    // Chiamata diretta: fa comparire il popup del browser (niente pre-check che blocca)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {lat:pos.coords.latitude,lng:pos.coords.longitude};
        setUserCoords(coords);setSearchCenter(coords);
        // reverse geocoding → nome città reale
        let label = "La mia posizione";
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=12&accept-language=it`);
          if (r.ok) { const j = await r.json(); const a = j.address||{}; label = a.city||a.town||a.village||a.municipality||a.county||label; }
        } catch(e) {}
        setCity(label);
        setGeoStatus(null);setShowCity(false);setSelCat(null);
      },
      (err) => setGeoStatus(err.code===1?"denied":err.code===3?"timeout":"error"),
      {enableHighAccuracy:true,timeout:12000,maximumAge:0}
    );
  };

  const searchResults = q.length >= 2
    ? prosWithDist
        .filter(p =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.cat.toLowerCase().includes(q.toLowerCase()) ||
          p.services.some(s=>s.name.toLowerCase().includes(q.toLowerCase()))
        )
        .sort((a,b) => {
          const aName = a.name.toLowerCase().includes(q.toLowerCase());
          const bName = b.name.toLowerCase().includes(q.toLowerCase());
          if (aName !== bName) return aName ? -1 : 1;
          return a.distKm-b.distKm;
        })
    : [];

  // ─── RENDER ───
  const gender = user?.gender; // "donna"|"uomo"|"nonspec"|null

  // Categorie ordinate per genere
  const CAT_ORDER_DONNA = ["unghie","estetica","capelli_barba","benessere","tattoo","altro"];
  const CAT_ORDER_UOMO  = ["capelli_barba","tattoo","benessere","unghie","estetica","altro"];
  const catOrder = gender==="donna" ? CAT_ORDER_DONNA : gender==="uomo" ? CAT_ORDER_UOMO : MACRO_CATS.map(c=>c.id);
  const orderedCats = catOrder.map(id=>MACRO_CATS.find(c=>c.id===id)).filter(Boolean);

  // Avatar header: custom SVG se configurato, altrimenti mascotte donna/uomo
  const AvatarBtn = () => (
    <button onClick={()=>nav("cl_profilo")} style={{width:44,height:44,borderRadius:"50%",overflow:"hidden",border:`2.5px solid ${T.brand}`,padding:0,cursor:"pointer",background:T.brandBg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 3px 10px ${T.brand}33`}}>
      {clPhoto
        ? <img src={clPhoto} onError={e=>{try{const loc=localStorage.getItem("ba-cl-photo");if(loc&&e.currentTarget.src!==loc)e.currentTarget.src=loc;}catch(x){}}} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="profilo"/>
        : gender==="donna"
          ? <img src="/beauty/donna-final.png" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top center"}} alt="profilo"/>
          : gender==="uomo"
            ? <img src="/beauty/uomo-new.png" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top center"}} alt="profilo"/>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      }
    </button>
  );

  // Emoji grandi per le categorie — stile illustrazione
  const CAT_ILLUS = {
    capelli_barba: {big:"✂️", sub:"💈", grad:["#FFF4E6","#FFE0B2"]},
    unghie:        {big:"💅", sub:"✨", grad:["#FFF0F5","#FFD6E8"]},
    estetica:      {big:"🧖", sub:"💆", grad:["#F3F0FF","#E8DFFF"]},
    benessere:     {big:"🌿", sub:"🪨", grad:["#F0FFF4","#C8F5DA"]},
    tattoo:        {big:"🖋️", sub:"🎨", grad:["#EFF6FF","#DBEAFE"]},
    altro:         {big:"⭐", sub:"💎", grad:["#FFFBEB","#FDE68A"]},
  };

  // ── Saluto dinamico + liste professionisti di fiducia ──
  const clPhoto = (()=>{ try{return localStorage.getItem("ba-cl-photo")||"";}catch(e){return "";} })();
  const firstName = ((user?.name)||"").split(" ")[0] || "";
  const hour = new Date().getHours();
  const greet = hour<12 ? "Buongiorno" : hour<18 ? "Ciao" : "Buonasera";
  const uniqById = (arr)=>{ const s=new Set(); return arr.filter(p=>p&&p.id!=null&&!s.has(p.id)&&s.add(p.id)); };
  const favPros = ALL_PROS.filter(p=>favorites?.has(p.id));
  const apptPros = uniqById(myAppts.map(a=>a.proObj));
  const myPros = uniqById([...apptPros, ...favPros]);
  const rebookPros = uniqById(passati.map(a=>a.proObj));
  const availToday = [...prosWithDist].filter(p=>p.id%3!==0).sort((a,b)=>a.distKm-b.distKm).slice(0,8);

  return (
    <div style={{paddingBottom:100,minHeight:"100dvh",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* ── HEADER — saluto personalizzato ── */}
      <div style={{background:"transparent",paddingTop:56,paddingBottom:0}}>
        <div style={{padding:"6px 20px 0",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          {/* Saluto + sottotitolo */}
          <div style={{minWidth:0,flex:1}}>
            <h1 style={{fontSize:26,fontWeight:900,color:"#0D0D0E",margin:0,letterSpacing:"-.04em",lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {greet}{firstName?` ${firstName}`:""} <span style={{fontWeight:400}}>👋</span>
            </h1>
            <button onClick={()=>setShowCity(true)} style={{display:"inline-flex",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",marginTop:5}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{fontSize:13,fontWeight:600,color:"#8A8A8E"}}>{city}</span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ADADAD" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          {/* Campanella + messaggi */}
          <div style={{display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
            <div style={{position:"relative"}}>
              <button onClick={()=>nav("cl_notifiche")} style={{width:42,height:42,borderRadius:"50%",border:"1.5px solid #EFEFEF",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"#FAFAFA",padding:0,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}} aria-label="Notifiche">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0D0D0E" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              </button>
              {unseenNotifs>0 && <span style={{position:"absolute",top:2,right:2,minWidth:16,height:16,padding:"0 4px",borderRadius:8,background:T.brand,border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",boxSizing:"border-box"}}>{unseenNotifs>9?"9+":unseenNotifs}</span>}
            </div>
            <div style={{position:"relative"}}>
              <button onClick={()=>nav("cl_chats")} style={{width:42,height:42,borderRadius:"50%",border:"1.5px solid #EFEFEF",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"#FAFAFA",padding:0,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}} aria-label="Messaggi">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D0D0E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
              </button>
              {unreadChats>0 && <span style={{position:"absolute",top:2,right:2,minWidth:16,height:16,padding:"0 4px",borderRadius:8,background:T.brand,border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",boxSizing:"border-box"}}>{unreadChats>9?"9+":unreadChats}</span>}
            </div>
          </div>
        </div>

        {/* Sottotitolo */}
        <p style={{padding:"12px 20px 0",margin:0,fontSize:15,color:"#8A8A8E",fontWeight:500}}>Cosa vuoi fare oggi?</p>

        {/* ── CARD RICERCA PRINCIPALE — cerca + categoria + data/ora ── */}
        <div style={{padding:"12px 20px 20px"}}>
          <div style={{borderRadius:24,background:"#FFFFFF",overflow:"hidden",border:`1.5px solid ${T.brand}26`,boxShadow:`0 12px 36px ${T.brand}22, 0 3px 10px rgba(0,0,0,.05)`}}>
            {/* Barra ricerca professionisti */}
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"16px 18px 13px"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={q} onChange={e=>{setQ(e.target.value);setSearching(true);}} onFocus={()=>setSearching(true)}
                placeholder="Cerca un professionista (o lascia vuoto)…"
                style={{flex:1,border:"none",outline:"none",background:"none",fontSize:15,color:"#0D0D0E",fontFamily:"inherit",fontWeight:500}}/>
              {q && <button onClick={()=>{setQ("");setSearching(false);}} style={{background:"#EFEFEF",border:"none",cursor:"pointer",width:24,height:24,borderRadius:"50%",color:"#666",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,padding:0,flexShrink:0}}>×</button>}
            </div>
            <div style={{height:1,background:"#F0F0F0",margin:"0 16px"}}/>
            {/* Selettore luogo */}
            <button onClick={()=>setShowCity(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <div style={{width:34,height:34,borderRadius:11,background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:10.5,fontWeight:700,color:"#ADADAD",margin:"0 0 1px",textTransform:"uppercase",letterSpacing:.6}}>Luogo</p>
                <p style={{fontSize:14.5,fontWeight:700,color:"#0D0D0E",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{city}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ADADAD" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <div style={{height:1,background:"#F0F0F0",margin:"0 16px"}}/>
            {/* Selettore categoria */}
            <button onClick={()=>setShowCatPick(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <div style={{width:34,height:34,borderRadius:11,background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:10.5,fontWeight:700,color:"#ADADAD",margin:"0 0 1px",textTransform:"uppercase",letterSpacing:.6}}>Categoria</p>
                <p style={{fontSize:14.5,fontWeight:700,color:"#0D0D0E",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{filterCat ? (MACRO_CATS.find(c=>c.id===filterCat)?.label.replace("\n"," ")) : "Qualsiasi"}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ADADAD" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <div style={{height:1,background:"#F0F0F0",margin:"0 16px"}}/>
            {/* Selettore data e ora */}
            <button onClick={()=>setShowDatePick(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <div style={{width:34,height:34,borderRadius:11,background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:10.5,fontWeight:700,color:"#ADADAD",margin:"0 0 1px",textTransform:"uppercase",letterSpacing:.6}}>Data e ora</p>
                <p style={{fontSize:14.5,fontWeight:700,color:"#0D0D0E",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{filterDate ? `${fmtDateShort(filterDate)}${filterTime?` · ${filterTime}`:""}` : "Qualsiasi"}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ADADAD" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {/* CTA cerca */}
            <div style={{padding:"6px 16px 16px"}}>
              <button onClick={()=>{ if(q.trim().length>=2){setSearching(true);} else {openCategory(filterCat||"altro");} }} className="btn-apple"
                style={{...BTN_APPLE,width:"100%",padding:"15px 0",borderRadius:15,fontSize:15,fontWeight:800,letterSpacing:.2,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                Cerca professionisti
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── WIDGET appuntamento premium ── */}
      {!(searching && q.length >= 2) && !selCat && banner && (
        <div style={{padding:"20px 20px 0"}}>
          <div onClick={()=>nav("cl_appts")} className="ba-lift" style={{borderRadius:24,cursor:"pointer",background:"#FFFFFF",overflow:"hidden",boxShadow:`0 8px 30px ${T.brand}14, 0 2px 8px rgba(0,0,0,.04)`,position:"relative",transition:"transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s ease"}}>

            <div style={{padding:"15px 16px 0",position:"relative"}}>

              {/* Label + freccia */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{fontSize:9.5,fontWeight:800,color:T.brand,textTransform:"uppercase",letterSpacing:1.4}}>{nextAppt?"Prossimo appuntamento":"Ultimo appuntamento"}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>

              {/* Corpo principale */}
              <div style={{display:"flex",gap:13,alignItems:"center"}}>

                {/* Calendario */}
                <div style={{flexShrink:0,width:54,height:60,borderRadius:14,background:`linear-gradient(145deg,${T.brand} 0%,${T.brand}BB 100%)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",overflow:"hidden",boxShadow:`0 5px 16px ${T.brand}33, inset 0 1px 0 rgba(255,255,255,.25)`}}>
                  <div style={{width:"100%",background:"rgba(0,0,0,.18)",padding:"4px 0 3px",textAlign:"center"}}>
                    <span style={{fontSize:7.5,fontWeight:800,color:"rgba(255,255,255,.9)",textTransform:"uppercase",letterSpacing:1}}>
                      {banner.date==="Oggi"?"oggi":banner.date==="Domani"?"dom":banner.date.split(" ")[1]||banner.date.slice(0,3)}
                    </span>
                  </div>
                  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:23,fontWeight:900,color:"#FFFFFF",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>
                      {banner.date==="Oggi"
                        ? new Date().getDate()
                        : banner.date==="Domani"
                          ? new Date(Date.now()+86400000).getDate()
                          : (banner.date.match(/\d+/)||["?"])[0]}
                    </span>
                  </div>
                </div>

                {/* Info servizio */}
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:16.5,fontWeight:900,color:"#0D0D0E",margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"-.02em",lineHeight:1.15}}>{banner.service}</p>
                  <p style={{fontSize:12.5,color:"#8A8A8E",margin:"0 0 7px",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{banner.pro}</p>
                  <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${T.brand}10`,borderRadius:999,padding:"3px 9px"}}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    <span style={{fontSize:10.5,fontWeight:700,color:T.brand}}>{banner.date}{banner.time&&` · ${banner.time}`} · € {banner.price}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pulsante bottom */}
            <div style={{padding:"12px 16px 14px"}}>
              <button onClick={e=>{e.stopPropagation();nav("cl_appts");}} className="btn-apple" style={{...BTN_APPLE,width:"100%",padding:"13px 0",borderRadius:14,fontSize:13.5,fontWeight:700,letterSpacing:.2}}>
                Visualizza appuntamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RISULTATI RICERCA ── */}
      {searching && q.length >= 2 && (
        <div style={{padding:"20px 20px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <p style={{fontSize:14,color:"#ADADAD",margin:0}}><strong style={{color:"#0D0D0E"}}>{searchResults.length}</strong> risultati per "{q}"</p>
            <button onClick={()=>{setQ("");setSearching(false);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#ADADAD",fontFamily:"inherit",fontWeight:600}}>Chiudi</button>
          </div>
          {searchResults.length === 0 && (
            <div style={{textAlign:"center",padding:"60px 0"}}>
              <div style={{fontSize:64,marginBottom:16}}>{gender==="donna"?"💅":"✂️"}</div>
              <p style={{fontSize:16,fontWeight:700,color:"#0D0D0E",margin:"0 0 6px"}}>Nessun risultato</p>
              <p style={{fontSize:14,color:"#ADADAD",fontWeight:400,margin:0}}>Prova con un termine diverso</p>
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {searchResults.map((pro) => {
              const photoUrl = proImg(pro);
              return (
                <div key={pro.id} onClick={()=>{nav("cl_pro",pro);setQ("");setSearching(false);}} style={{display:"flex",gap:14,cursor:"pointer",alignItems:"center",padding:"14px 16px",borderRadius:18,background:"#FFFFFF",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                  <div style={{width:56,height:56,borderRadius:16,background:"#F5F5F5",overflow:"hidden",flexShrink:0}}>
                    {photoUrl ? <img src={photoUrl} alt={pro.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{pro.emoji}</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:15,fontWeight:700,color:"#0D0D0E",margin:"0 0 2px"}}>{pro.name}</p>
                    <p style={{fontSize:12,color:"#ADADAD",margin:"0 0 3px"}}>{pro.cat} · {pro.city}</p>
                    <span style={{fontSize:12,color:"#F59E0B",fontWeight:700}}>★ {pro.rating}</span>
                  </div>
                  <button onClick={e=>{e.stopPropagation();nav("cl_prenota",{pro});}} className="btn-apple" style={{...BTN_APPLE,padding:"10px 18px",borderRadius:999,fontSize:13,fontWeight:700,flexShrink:0}}>Prenota</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CONTENUTO PRINCIPALE ── */}
      {!(searching && q.length >= 2) && (
        <div>
          {!selCat && (
            <>
              {/* ✨ CATEGORIE — card con illustrazione emoji grande */}
              <div style={{marginTop:24}}>
                <div style={{padding:"0 20px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <p style={{fontSize:18,fontWeight:900,color:"#0D0D0E",margin:0,letterSpacing:"-.04em"}}>✨ Cosa ti va di fare oggi?</p>
                  <button onClick={()=>openCategory("altro")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.brand,fontWeight:700,fontFamily:"inherit",padding:0}}>Tutto →</button>
                </div>
                <div style={{display:"flex",gap:10,overflowX:"auto",padding:"4px 20px 16px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
                  {orderedCats.map(cat => {
                    const illus = CAT_ILLUS[cat.id] || CAT_ILLUS.altro;
                    return (
                      <button key={cat.id} onClick={()=>openCategory(cat.id)}
                        style={{flexShrink:0,width:100,height:118,borderRadius:24,overflow:"hidden",position:"relative",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",background:`linear-gradient(145deg,${illus.grad[0]},${illus.grad[1]})`,boxShadow:`0 4px 16px ${cat.shadowColor||"rgba(0,0,0,.10)"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
                        {/* Glow dietro emoji */}
                        <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:60,height:60,borderRadius:"50%",background:cat.color+"22",filter:"blur(12px)"}}/>
                        {/* Emoji grande */}
                        <span style={{fontSize:40,lineHeight:1,filter:"drop-shadow(0 4px 8px rgba(0,0,0,.15))",position:"relative",zIndex:1}}>{illus.big}</span>
                        {/* Label */}
                        <p style={{fontSize:11,fontWeight:800,color:cat.color||"#333",margin:0,textAlign:"center",lineHeight:1.2,whiteSpace:"pre-line",letterSpacing:"-.01em",position:"relative",zIndex:1}}>{cat.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 📍 VICINO A TE — card professionisti premium */}
              <div style={{marginTop:24}}>
                <div style={{padding:"0 20px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <p style={{fontSize:18,fontWeight:900,color:"#0D0D0E",margin:0,letterSpacing:"-.04em"}}>Vicino a te 📍</p>
                  <button onClick={()=>openCategory("altro")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.brand,fontWeight:700,fontFamily:"inherit",padding:0}}>Vedi tutti →</button>
                </div>
                <div style={{display:"flex",gap:14,overflowX:"auto",padding:"4px 20px 16px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
                  {[...prosWithDist].sort((a,b)=>a.distKm-b.distKm).slice(0,8).map((pro) => {
                    const photoUrl = proImg(pro);
                    const isFav = favorites?.has(pro.id);
                    const distLabel = pro.distKm < 1 ? `${Math.round(pro.distKm*1000)} m` : `${pro.distKm.toFixed(1)} km`;
                    const isOpen = pro.id % 3 !== 0;
                    const services = ["Taglio","Colore","Piega","Manicure","Trattamento"].slice(0,3);
                    return (
                      <div key={pro.id} className="glass-card" style={{flexShrink:0,width:236,borderRadius:26,overflow:"hidden",cursor:"pointer"}} onClick={()=>nav("cl_pro",pro)}>
                        {/* Foto grande con angoli arrotondati (stile Fresha) */}
                        <div style={{padding:8}}>
                          <div style={{height:150,borderRadius:20,background:"#F0F0F0",position:"relative",overflow:"hidden"}}>
                            {photoUrl
                              ? <img src={photoUrl} alt={pro.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/>
                              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:52}}>{pro.emoji}</div>}
                            {/* Badge stato in alto-sinistra */}
                            {isOpen && <div style={{position:"absolute",top:9,left:9,display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.96)",borderRadius:999,padding:"4px 10px",backdropFilter:"blur(4px)"}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:"#22C483",display:"inline-block"}}/>
                              <span style={{fontSize:10,fontWeight:700,color:"#111111"}}>Aperto ora</span>
                            </div>}
                            {/* Cuore */}
                            <button onClick={e=>{e.stopPropagation();setFavorites&&setFavorites(f=>{const n=new Set(f);n.has(pro.id)?n.delete(pro.id):n.add(pro.id);return n;});}} style={{position:"absolute",top:9,right:9,width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,.92)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav?"#FF5A8A":"none"} stroke={isFav?"#FF5A8A":"#8A8A8E"} strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84 1-1a5.5 5.5 0 000-7.78z"/></svg>
                            </button>
                          </div>
                        </div>
                        {/* Info — pulita stile Fresha */}
                        <div style={{padding:"4px 16px 16px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <p style={{fontSize:15.5,fontWeight:800,color:"#111111",margin:0,letterSpacing:"-.02em",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                            {pro.verified && <svg width="15" height="15" viewBox="0 0 24 24" fill="#5B7CFF" style={{flexShrink:0}}><path d="M12 2l2.4 2.1 3.1-.5 1 3 2.7 1.6-1.2 2.9 1.2 2.9-2.7 1.6-1 3-3.1-.5L12 22l-2.4-2.1-3.1.5-1-3L2.8 15l1.2-2.9L2.8 9.2l2.7-1.6 1-3 3.1.5z"/><path d="M8.5 12.5l2 2 4-4.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                            <span style={{fontSize:13,fontWeight:800,color:"#111111"}}>★ {pro.rating}</span>
                            <span style={{fontSize:12,color:"#ADADAD",fontWeight:500}}>({pro.reviews})</span>
                          </div>
                          <p style={{fontSize:12,color:"#8A8A8E",margin:"0 0 13px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.cat} · {distLabel}</p>
                          <button onClick={e=>{e.stopPropagation();nav("cl_prenota",{pro});}} className="btn-apple" style={{...BTN_APPLE,width:"100%",padding:"12px 0",borderRadius:14,fontSize:13,fontWeight:700,letterSpacing:.2}}>Prenota ora</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 👥 I PIÙ RICHIESTI — avatar circolari con nome */}
              <div style={{marginTop:24,paddingBottom:12}}>
                <div style={{padding:"0 20px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <p style={{fontSize:18,fontWeight:900,color:"#0D0D0E",margin:0,letterSpacing:"-.04em"}}>I più richiesti 🏆</p>
                  <button onClick={()=>openCategory("altro")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.brand,fontWeight:700,fontFamily:"inherit",padding:0}}>Vedi tutti →</button>
                </div>
                <div style={{display:"flex",gap:14,overflowX:"auto",padding:"4px 20px 12px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
                  {[...prosWithDist].sort((a,b)=>b.reviews-a.reviews).slice(0,8).map(pro=>{
                    const photoUrl = proImg(pro);
                    return (
                      <div key={pro.id} onClick={()=>nav("cl_pro",pro)} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",width:76}}>
                        <div style={{position:"relative"}}>
                          <div style={{width:66,height:66,borderRadius:"50%",overflow:"hidden",background:"#F2F2F4",boxShadow:"0 6px 18px rgba(0,0,0,.10)"}}>
                            {photoUrl ? <img src={photoUrl} alt={pro.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{pro.emoji}</div>}
                          </div>
                          <div style={{position:"absolute",bottom:-2,right:-2,minWidth:22,height:22,padding:"0 5px",borderRadius:999,background:"#FFFFFF",boxShadow:"0 2px 8px rgba(0,0,0,.14)",display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
                            <span style={{fontSize:9}}>⭐</span><span style={{fontSize:9.5,fontWeight:800,color:"#0D0D0E"}}>{pro.rating}</span>
                          </div>
                        </div>
                        <p style={{fontSize:11,fontWeight:700,color:"#0D0D0E",margin:0,textAlign:"center",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%"}}>{pro.name.split(" ")[0]}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 🟢 DISPONIBILE OGGI */}
              <div style={{marginTop:24}}>
                <div style={{padding:"0 20px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <p style={{fontSize:18,fontWeight:900,color:"#111111",margin:0,letterSpacing:"-.04em"}}>Disponibile oggi 🟢</p>
                  <button onClick={()=>openCategory("altro")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.brand,fontWeight:700,fontFamily:"inherit",padding:0}}>Vedi tutti →</button>
                </div>
                <div style={{display:"flex",gap:12,overflowX:"auto",padding:"4px 20px 8px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
                  {availToday.map(pro=>{
                    const photoUrl = proImg(pro);
                    const firstSlot = pro.slots&&pro.slots[0];
                    return (
                      <div key={pro.id} onClick={()=>nav("cl_pro",pro)} className="glass-card" style={{flexShrink:0,width:158,borderRadius:22,cursor:"pointer",overflow:"hidden"}}>
                        <div style={{height:96,background:"#F0F0F0",position:"relative",overflow:"hidden"}}>
                          {photoUrl ? <img src={photoUrl} alt={pro.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>{pro.emoji}</div>}
                          <div style={{position:"absolute",top:8,left:8,display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,.96)",borderRadius:999,padding:"3px 9px"}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:"#22C483"}}/>
                            <span style={{fontSize:9.5,fontWeight:800,color:"#111111"}}>Oggi</span>
                          </div>
                        </div>
                        <div style={{padding:"11px 13px 13px"}}>
                          <p style={{fontSize:13.5,fontWeight:800,color:"#111111",margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                          <p style={{fontSize:11,color:"#ADADAD",margin:"0 0 10px"}}>{firstSlot?`Prima alle ${firstSlot}`:pro.cat}</p>
                          <button onClick={e=>{e.stopPropagation();nav("cl_prenota",{pro});}} className="btn-apple" style={{...BTN_APPLE,width:"100%",padding:"10px 0",borderRadius:12,fontSize:12.5,fontWeight:700}}>Prenota</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 🔁 PRENOTA DI NUOVO — dai professionisti già visitati */}
              {rebookPros.length>0 && (
                <div style={{marginTop:24}}>
                  <div style={{padding:"0 20px",marginBottom:14}}>
                    <p style={{fontSize:18,fontWeight:900,color:"#111111",margin:0,letterSpacing:"-.04em"}}>Prenota di nuovo 🔁</p>
                    <p style={{fontSize:12.5,color:"#ADADAD",margin:"3px 0 0",fontWeight:500}}>Ripeti un trattamento che hai già fatto</p>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10,padding:"0 20px"}}>
                    {rebookPros.slice(0,4).map(pro=>{
                      const photoUrl = proImg(pro);
                      const lastSvc = passati.find(a=>a.proObj&&a.proObj.id===pro.id);
                      return (
                        <div key={pro.id} onClick={()=>nav("cl_pro",pro)} className="glass-card" style={{display:"flex",alignItems:"center",gap:13,padding:"12px 14px",borderRadius:20,cursor:"pointer"}}>
                          <div style={{width:52,height:52,borderRadius:14,overflow:"hidden",background:"#F5F5F5",flexShrink:0}}>
                            {photoUrl ? <img src={photoUrl} alt={pro.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{pro.emoji}</div>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{fontSize:14.5,fontWeight:800,color:"#111111",margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                            <p style={{fontSize:12,color:"#ADADAD",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lastSvc?lastSvc.service:pro.cat}</p>
                          </div>
                          <button onClick={e=>{e.stopPropagation();nav("cl_prenota",{pro});}} className="btn-apple" style={{...BTN_APPLE,padding:"10px 18px",borderRadius:999,fontSize:13,fontWeight:700,flexShrink:0}}>Ripeti</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* Passo 2: Browse professionisti — Lista / Mappa */}
      {selCat && !(searching && q.length >= 2) && (
        <BrowsePros
          catId={selCat}
          catLabel={MACRO_CATS.find(c=>c.id===selCat)?.label?.replace("\n"," ")}
          catColor={MACRO_CATS.find(c=>c.id===selCat)?.color}
          city={city}
          onBack={()=>setSelCat(null)}
          onChangeCity={()=>setShowCity(true)}
          pros={filteredPros}
          radius={radius}
          setRadius={setRadius}
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchCenter={searchCenter}
          onMapMove={setSearchCenter}
          selectedPro={selectedPro}
          setSelectedPro={setSelectedPro}
          darkMap={darkMap}
          setDarkMap={setDarkMap}
          onSelectPro={pro=>nav("cl_pro",pro)}
          onBook={pro=>nav("cl_prenota",{pro})}
        />
      )}

      {/* Modal scelta posizione */}
      {showCity && (
        <Modal title="Scegli il luogo" onClose={()=>{setShowCity(false);setCitySearch("");setGeoStatus(null);}}>
            {/* Mappa (stile Apple) del luogo selezionato */}
            <div style={{borderRadius:18,overflow:"hidden",height:170,position:"relative",zIndex:0,isolation:"isolate",marginBottom:16,boxShadow:"0 2px 12px rgba(0,0,0,.08)"}}>
              <MapView pros={[]} center={userCoords} onSelectPro={()=>{}} onMapMove={c=>{setUserCoords(c);setSearchCenter(c);}} dark={false} height="170px"/>
              <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-100%)",zIndex:5,pointerEvents:"none",filter:"drop-shadow(0 3px 5px rgba(0,0,0,.35))"}}>
                <svg width="30" height="38" viewBox="0 0 36 44"><path d="M18 0C8 0 0 8 0 18c0 12 18 26 18 26s18-14 18-26C36 8 28 0 18 0z" fill={T.brand}/><circle cx="18" cy="17" r="6" fill="#fff"/></svg>
              </div>
            </div>

            {/* Barra di ricerca città */}
            <div style={{display:"flex",alignItems:"center",gap:10,background:T.surface,borderRadius:14,padding:"12px 15px",border:`1.5px solid ${T.line}`,marginBottom:12}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={citySearch}
                onChange={e=>setCitySearch(e.target.value)}
                placeholder="Cerca qualsiasi città o indirizzo..."
                style={{flex:1,border:"none",outline:"none",background:"none",fontSize:15,color:T.ink,fontFamily:"inherit"}}
              />
              {citySearch && (
                <button onClick={()=>setCitySearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.inkSoft,padding:0}}>x</button>
              )}
            </div>

            {/* Usa la mia posizione */}
            <button onClick={useMyLocation} disabled={geoStatus==="loading"} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"13px 15px",borderRadius:13,border:`1.5px solid ${T.ink}`,background:T.white,cursor:geoStatus==="loading"?"default":"pointer",fontFamily:"inherit",marginBottom:14}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
              <span style={{fontSize:14,fontWeight:700,color:T.ink}}>{geoStatus==="loading"?"Rilevamento in corso...":"Usa la mia posizione"}</span>
            </button>
            {geoStatus==="error" && (
              <p style={{fontSize:12,color:T.red,margin:"-8px 0 14px"}}>Non è stato possibile rilevare la posizione. Riprova.</p>
            )}
            {geoStatus==="timeout" && (
              <p style={{fontSize:12,color:T.red,margin:"-8px 0 14px"}}>Rilevamento troppo lento. Riprova o cerca la città manualmente.</p>
            )}
            {geoStatus==="insecure" && (
              <p style={{fontSize:12,color:T.red,margin:"-8px 0 14px"}}>La localizzazione richiede una connessione sicura (https). Apri l'app dal link ufficiale.</p>
            )}
            {geoStatus==="denied" && (
              <p style={{fontSize:12,color:T.red,margin:"-8px 0 14px",lineHeight:1.5}}>Permesso negato. Attivalo così: tocca il lucchetto 🔒 accanto all'indirizzo → Posizione → Consenti; su Mac verifica anche Impostazioni di sistema → Privacy e sicurezza → Localizzazione (attiva per il browser). Poi riprova.</p>
            )}

            {citySearch.length < 2 ? (
              <>
                <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,margin:"0 0 8px"}}>Città suggerite</p>
                <div style={{borderRadius:13,overflow:"hidden",border:`1px solid ${T.line}`}}>
                  {citySuggestions.map((c,i) => (
                    <div key={c}>
                      <button onClick={()=>{setCity(c);const cc=CITY_COORDS[c]||DEFAULT_COORDS;setUserCoords(cc);setSearchCenter(cc);setShowCity(false);setSelCat(null);setCitySearch("");setGeoStatus(null);}} style={{width:"100%",padding:"15px 16px",border:"none",background:city===c?T.surface:T.white,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:17}}>📍</span>
                          <span style={{fontSize:15,fontWeight:city===c?700:500,color:T.ink}}>{c}</span>
                        </div>
                        {city===c && (
                          <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={T.green}/><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/></svg>
                        )}
                      </button>
                      {i < citySuggestions.length-1 && <Div/>}
                    </div>
                  ))}
                </div>
                <p style={{fontSize:11,color:T.inkSoft,margin:"10px 0 0"}}>Oppure digita per cercare qualsiasi città o indirizzo reale nel mondo.</p>
              </>
            ) : (
              <>
                <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,margin:"0 0 8px"}}>Risultati</p>
                {placeLoading && (
                  <p style={{fontSize:13,color:T.inkSoft,margin:0}}>Ricerca in corso...</p>
                )}
                {!placeLoading && placeResults.length === 0 && (
                  <div style={{padding:"20px",textAlign:"center"}}><p style={{fontSize:13,color:T.inkSoft,margin:0}}>Nessun risultato</p></div>
                )}
                {!placeLoading && placeResults.length > 0 && (
                  <div style={{borderRadius:13,overflow:"hidden",border:`1px solid ${T.line}`}}>
                    {placeResults.map((p,i) => (
                      <div key={p.place_id}>
                        <button onClick={()=>selectPlace(p)} style={{width:"100%",padding:"15px 16px",border:"none",background:T.white,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                          <span style={{fontSize:17}}>📍</span>
                          <span style={{fontSize:14,fontWeight:500,color:T.ink}}>{p.display_name}</span>
                        </button>
                        {i < placeResults.length-1 && <Div/>}
                      </div>
                    ))}
                  </div>
                )}
                <p style={{fontSize:9,color:T.inkSoft,margin:"10px 0 0",textAlign:"center"}}>Ricerca fornita da OpenStreetMap / Nominatim</p>
              </>
            )}
        </Modal>
      )}

      {/* Modal selettore categoria */}
      {showCatPick && (
        <Modal title="Scegli categoria" onClose={()=>setShowCatPick(false)}>
          <button onClick={()=>{setFilterCat(null);setShowCatPick(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 14px",borderRadius:14,border:`1.5px solid ${filterCat===null?T.brand:T.line}`,background:filterCat===null?T.brandBg:T.white,cursor:"pointer",fontFamily:"inherit",marginBottom:8,textAlign:"left"}}>
            <div style={{width:38,height:38,borderRadius:11,background:T.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🔎</div>
            <span style={{fontSize:15,fontWeight:700,color:T.ink,flex:1}}>Qualsiasi categoria</span>
            {filterCat===null && <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={T.brand}/><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/></svg>}
          </button>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {MACRO_CATS.map(cat=>(
              <button key={cat.id} onClick={()=>{setFilterCat(cat.id);setShowCatPick(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 14px",borderRadius:14,border:`1.5px solid ${filterCat===cat.id?T.brand:T.line}`,background:filterCat===cat.id?T.brandBg:T.white,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                <div style={{width:38,height:38,borderRadius:11,background:cat.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <span style={{fontSize:15,fontWeight:700,color:T.ink,flex:1}}>{cat.label.replace("\n"," ")}</span>
                {filterCat===cat.id && <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={T.brand}/><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/></svg>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Modal selettore data e ora — calendario + ruota ora */}
      {showDatePick && (
        <DateTimeSheet
          initialDate={filterDate}
          initialTime={filterTime}
          onClose={()=>setShowDatePick(false)}
          onClear={()=>{setFilterDate(null);setFilterTime(null);setShowDatePick(false);}}
          onConfirm={(d,t)=>{setFilterDate(d);setFilterTime(t);setShowDatePick(false);}}
        />
      )}
    </div>
  );
}

/* ESPLORA */
const POST_CATS = ["Nail Art","Capelli","Barba","Estetica","Make-up","Altro"];
function ClExplore({nav,user,feed=FEED,setFeed,onPublishPost,onDeletePost,onLikePost,onCommentPost,likedPosts,setLikedPosts,savedPosts,setSavedPosts,onSendPost}) {
  const [cat,setCat] = useState("Tutti");
  const [q,setQ] = useState("");
  const [searchMode,setSearchMode] = useState(false);
  const [showCompose,setShowCompose] = useState(false);
  const [viewId,setViewId] = useState(null); // post aperto nel visualizzatore a scorrimento
  const liked = likedPosts||new Set(), saved = savedPosts||new Set();
  const [sentPost,setSentPost] = useState(null);   // post appena inviato (per il dialog di conferma)
  const toggleLike = (id) => setLikedPosts && setLikedPosts(s=>{const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n;});
  const toggleSave = (id) => setSavedPosts && setSavedPosts(s=>{const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n;});
  const CATS = ["Tutti","Nail Art","Capelli","Barba"];
  const _pts = p => p.created || (typeof p.id==="number"?p.id:0);
  const orderedFeed = [...(feed||[])].sort((a,b)=>_pts(b)-_pts(a)); // più recenti in cima
  const posts = cat==="Tutti" ? orderedFeed : orderedFeed.filter(p=>p.cat===cat);
  const publish = (post) => { if(onPublishPost) onPublishPost(post); else setFeed && setFeed(f=>[post,...f]); setShowCompose(false); setCat("Tutti"); };
  const accountResults = q.length >= 1
    ? ALL_PROS.filter(p=>{
        const t = q.toLowerCase();
        return p.name.toLowerCase().includes(t)
          || p.handle.toLowerCase().includes(t)
          || p.city.toLowerCase().includes(t)
          || (p.cat||"").toLowerCase().includes(t)
          || (p.services||[]).some(s=>s.name.toLowerCase().includes(t));
      })
    : ALL_PROS;

  return (
    <div style={{paddingBottom:90}}>
      <div style={{position:"sticky",top:0,zIndex:20,background:T.white,borderBottom:`1px solid ${T.line}`}}>
        <div style={{padding:"50px 14px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:8,background:T.surface,borderRadius:11,padding:"10px 12px"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setSearchMode(true)} placeholder="Cerca un negozio, una persona o un servizio…" style={{flex:1,border:"none",outline:"none",background:"none",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
              {q && <button onClick={()=>setQ("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.inkSoft,padding:0}}>x</button>}
            </div>
            {searchMode ? (
              <button onClick={()=>{setSearchMode(false);setQ("");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,color:T.ink,fontFamily:"inherit",flexShrink:0}}>Annulla</button>
            ) : (
              <button onClick={()=>setShowCompose(true)} aria-label="Nuovo post" className="clay-btn" style={{flexShrink:0,width:38,height:38,borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:T.brand,color:T.white,fontFamily:"inherit"}}><IPlus/></button>
            )}
          </div>
          {!searchMode && (
            <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",marginTop:9,paddingBottom:2}}>
              {CATS.map(c => (
                <button key={c} onClick={()=>setCat(c)} style={{flexShrink:0,padding:"6px 13px",borderRadius:99,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,background:cat===c?T.ink:T.surface,color:cat===c?T.white:T.inkMid,fontFamily:"inherit"}}>{c}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchMode ? (
        <div style={{padding:"14px 16px"}}>
          <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>{q ? `Risultati per "${q}"` : "Suggeriti"}</p>
          {accountResults.length === 0 && (
            <div style={{textAlign:"center",padding:"40px 0"}}>
              <p style={{fontSize:32,marginBottom:8}}>🔍</p>
              <p style={{fontSize:14,color:T.inkSoft}}>Nessun risultato</p>
            </div>
          )}
          {accountResults.map((pro,i) => (
            <div key={pro.id}>
              <div onClick={()=>{nav("cl_pro",pro);setSearchMode(false);setQ("");}} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",cursor:"pointer"}}>
                <Av pro={pro} size={48} fs={21}/>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:"0 0 1px"}}>@{pro.handle}</p>
                  <p style={{fontSize:12,color:T.inkSoft,margin:"0 0 2px"}}>{pro.name}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{pro.cat} - {pro.city} - {pro.followers} follower</p>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.line} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
              {i < accountResults.length-1 && <Div/>}
            </div>
          ))}
        </div>
      ) : (
        posts.map(post => {
          const pro = post.author ? null : (ALL_PROS.find(p=>p.id===post.proId)||ALL_PROS[0]);
          const av = pro || {emoji:post.author.emoji,accent:post.author.accent,verified:false};
          const handle = pro ? pro.handle : post.author.handle;
          const sub = pro ? `${pro.city} - ${post.cat}` : `Tu - ${post.cat}`;
          const openPro = pro ? ()=>nav("cl_pro",pro) : undefined;
          return (
            <div key={post.id} className="clay" style={{background:T.white,borderRadius:22,overflow:"hidden",margin:"0 16px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 13px"}}>
                <div onClick={openPro} style={{cursor:pro?"pointer":"default"}}><Av pro={av} size={33} fs={15}/></div>
                <div style={{flex:1,cursor:pro?"pointer":"default"}} onClick={openPro}>
                  <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>@{handle}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{sub}</p>
                </div>
                {pro
                  ? <button onClick={()=>nav("cl_prenota",{pro})} className="btn-apple" style={{padding:"7px 14px",borderRadius:99,border:"1.5px solid #E5E5EA",background:"#FFFFFF",cursor:"pointer",fontSize:12,fontWeight:700,color:"#111111",fontFamily:"inherit"}}>Prenota</button>
                  : <span style={{padding:"6px 12px",borderRadius:99,background:T.surface,fontSize:12,fontWeight:600,color:T.inkSoft}}>Il tuo post</span>}
              </div>
              <div onClick={()=>setViewId(post.id)} style={{cursor:"pointer"}}><Photo src={post.img} style={{width:"100%",aspectRatio:"4/5"}}/></div>
              {/* Barra azioni: like · salva · invia al pro */}
              <div style={{display:"flex",alignItems:"center",gap:18,padding:"11px 14px 4px"}}>
                <button onClick={()=> onLikePost ? onLikePost(post) : toggleLike(post.id)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
                  <svg width="23" height="23" viewBox="0 0 24 24" fill={liked.has(post.id)?T.brand:"none"} stroke={liked.has(post.id)?T.brand:T.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1a5.5 5.5 0 00-7.8 7.8l1.1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
                  <span style={{fontSize:13,fontWeight:700,color:T.inkMid}}>{post.likes+(liked.has(post.id)?1:0)}</span>
                </button>
                <button onClick={()=>setViewId(post.id)} title="Commenti" style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                  {(post.comments&&post.comments.length>0) && <span style={{fontSize:13,fontWeight:700,color:T.inkMid}}>{post.comments.length}</span>}
                </button>
                {pro && (
                  <button onClick={()=>{onSendPost&&onSendPost(post);}} title="Invia al professionista" style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                    <span style={{fontSize:12,fontWeight:600,color:T.inkMid}}>Invia</span>
                  </button>
                )}
                <button onClick={()=>toggleSave(post.id)} title="Salva" style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",fontFamily:"inherit"}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={saved.has(post.id)?T.ink:"none"} stroke={T.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                </button>
              </div>
              <div style={{padding:"4px 14px 12px"}}>
                <p style={{fontSize:13,color:T.ink,margin:"0 0 3px",lineHeight:1.5}}><span style={{fontWeight:700,marginRight:3}}>@{handle}</span>{post.caption}</p>
                <p style={{fontSize:11,color:T.brand,margin:0}}>{post.tags.map(t=><span key={t} style={{marginRight:4}}>{t}</span>)}</p>
              </div>
            </div>
          );
        })
      )}
      {showCompose && <ComposePost user={user} onClose={()=>setShowCompose(false)} onPublish={publish}/>}
      {viewId!=null && (
        <PostViewer posts={posts} startId={viewId}
          isOwner={(p)=> !!(p.author && p.author.name===(user&&user.name))}
          likedPosts={likedPosts}
          onToggleLike={(p)=> onLikePost ? onLikePost(p) : toggleLike(p.id)}
          onAddComment={(p,text)=> onCommentPost ? onCommentPost(p,text) : (setFeed&&setFeed(f=>f.map(x=>String(x.id)===String(p.id)?{...x,comments:[...(x.comments||[]),{id:Date.now(),by:(user&&user.name)||"Tu",text}]}:x)))}
          onEditCaption={(id,text)=>setFeed&&setFeed(f=>f.map(x=>String(x.id)===String(id)?{...x,caption:text}:x))}
          onDelete={(p)=>{onDeletePost&&onDeletePost(p);setViewId(null);}}
          onClose={()=>setViewId(null)}/>
      )}
    </div>
  );
}

/* COMPOSER POST ESPLORA — il cliente pubblica un contenuto nel feed */
function ComposePost({user,onClose,onPublish}) {
  const [cat,setCat] = useState(POST_CATS[0]);
  const [imgData,setImgData] = useState("");   // foto caricata dal dispositivo (data URL)
  const [imgKw,setImgKw] = useState("");        // in alternativa: genera da descrizione
  const [imgErr,setImgErr] = useState("");
  const [caption,setCaption] = useState("");
  const [tags,setTags] = useState("");
  const fileRef = useRef(null);
  const preview = imgData || (imgKw.trim() ? U(imgKw.trim()) : "");
  const name = user?.name || "Tu";
  const handle = user?.username || user?.handle || (name.toLowerCase().replace(/[^a-z0-9]/g,"") || "tu");
  const canPublish = !!imgData || caption.trim().length > 0 || imgKw.trim().length > 0;

  const pickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    if(!file.type.startsWith("image/")){ setImgErr("Seleziona un file immagine."); return; }
    if(file.size > 20*1024*1024){ setImgErr("Immagine troppo grande (max 20MB)."); return; }
    setImgErr("");
    // Ridimensiona/comprime prima di salvare → feed leggero e scroll fluido
    downscaleImage(file,1200,0.82).then(d=>{
      if(d){ setImgData(d); setImgKw(""); }
      else setImgErr("Impossibile leggere il file.");
    });
  };

  const submit = () => {
    if(!canPublish) return;
    const parsedTags = tags.split(/[\s,]+/).map(t=>t.trim()).filter(Boolean).map(t=>t.startsWith("#")?t:`#${t}`);
    onPublish({
      id: Date.now(),
      created: Date.now(),
      cat,
      img: preview || U(caption.trim()||"beauty"),
      caption: caption.trim(),
      tags: parsedTags,
      likes: 0,
      comments: [],
      author: {name, handle, emoji: name.trim()[0]?.toUpperCase()||"🙂", accent: T.brand},
    });
  };

  const lbl = {fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:.6};
  const inp = {width:"100%",boxSizing:"border-box",border:`1.5px solid ${T.line}`,borderRadius:12,padding:"11px 12px",fontSize:14,color:T.ink,fontFamily:"inherit",background:T.white,outline:"none"};

  return (
    <Modal title="Nuovo post" onClose={onClose}>
      <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{display:"none"}}/>
      <div style={{marginBottom:14,position:"relative"}}>
        <div onClick={()=>fileRef.current&&fileRef.current.click()} style={{cursor:"pointer"}}>
          {preview
            ? <Photo src={preview} style={{width:"100%",aspectRatio:"4/5",borderRadius:16}}/>
            : <div style={{width:"100%",aspectRatio:"4/5",borderRadius:16,background:T.surface,border:`1.5px dashed ${T.line}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:T.inkSoft}}>
                <span style={{fontSize:34}}>📷</span>
                <span style={{fontSize:13,fontWeight:700,color:T.inkMid}}>Tocca per caricare una foto</span>
                <span style={{fontSize:11,fontWeight:600}}>dalla galleria o dalla fotocamera</span>
              </div>}
        </div>
        {imgData && (
          <button onClick={()=>{setImgData("");if(fileRef.current)fileRef.current.value="";}} style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.55)",border:"none",borderRadius:99,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>Rimuovi</button>
        )}
      </div>
      <div style={{marginBottom:14}}>
        <button onClick={()=>fileRef.current&&fileRef.current.click()} className="clay-soft" style={{width:"100%",padding:"12px 0",borderRadius:14,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontSize:14,fontWeight:700,color:T.ink,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
          {imgData ? "Cambia foto" : "Carica foto"}
        </button>
        {imgErr && <p style={{fontSize:11,color:"#E5484D",margin:"6px 2px 0",fontWeight:600}}>{imgErr}</p>}
      </div>
      {!imgData && (
        <div style={{marginBottom:14}}>
          <label style={lbl}>Oppure genera da descrizione</label>
          <input value={imgKw} onChange={e=>setImgKw(e.target.value)} placeholder="es. nail art rosa" style={inp}/>
        </div>
      )}
      <div style={{marginBottom:14}}>
        <label style={lbl}>Categoria</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {POST_CATS.map(c => (
            <button key={c} onClick={()=>setCat(c)} style={{padding:"7px 13px",borderRadius:99,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:cat===c?T.ink:T.surface,color:cat===c?T.white:T.inkMid,fontFamily:"inherit"}}>{c}</button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={lbl}>Didascalia</label>
        <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Scrivi qualcosa..." rows={3} style={{...inp,resize:"vertical",lineHeight:1.5}}/>
      </div>
      <div style={{marginBottom:20}}>
        <label style={lbl}>Tag</label>
        <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="es. nailart estate glow" style={inp}/>
      </div>
      <BigBtn label="Pubblica" onClick={submit} disabled={!canPublish}/>
    </Modal>
  );
}

/* PREFERITI */
function ClPreferiti({nav,favorites,setFavorites}) {
  const favPros = ALL_PROS.filter(p=>favorites.has(p.id));
  const [confirmId,setConfirmId] = useState(null); // id del pro da rimuovere, null = chiuso
  const confirmPro = ALL_PROS.find(p=>p.id===confirmId);

  const doRemove = () => {
    setFavorites(f=>{const n=new Set(f);n.delete(confirmId);return n;});
    setConfirmId(null);
  };

  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{padding:"52px 20px 18px",background:T.paper}}>
        <h1 className="ba-display" style={{fontSize:30,color:T.ink,margin:"0 0 4px"}}>Preferiti</h1>
        <p style={{fontSize:14,color:T.inkMid,margin:0,fontWeight:500}}>I tuoi professionisti salvati</p>
      </div>
      {favPros.length === 0 ? (
        <div style={{textAlign:"center",padding:"80px 30px"}}>
          <div style={{fontSize:48,marginBottom:14}}>🤍</div>
          <p style={{fontSize:17,fontWeight:700,color:T.ink,marginBottom:8}}>Nessun preferito</p>
          <p style={{fontSize:14,color:T.inkSoft,marginBottom:22,lineHeight:1.6}}>Apri un profilo e tocca il cuore per salvarlo qui.</p>
          <button onClick={()=>nav("cl_home")} className="btn-apple" style={{padding:"14px 30px",borderRadius:99,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cerca professionisti</button>
        </div>
      ) : (
        <div style={{padding:"12px 16px"}}>
          {favPros.map((pro,i) => (
            <div key={pro.id} className="ba-rise ba-zoom clay" style={{background:T.white,borderRadius:22,marginBottom:14,overflow:"hidden",animationDelay:`${i*.06}s`}}>
              {/* Header card con foto */}
              <div style={{display:"flex",alignItems:"center",gap:0}}>
                {(()=>{const cd=CAT_LIST.find(c=>c.id===pro.catId)||CAT_LIST[0];const ph=proImg(pro);return(
                <div style={{width:72,height:72,flexShrink:0,overflow:"hidden",position:"relative",background:cd.grad}}>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><CatIcon id={pro.catId} size={28} color="rgba(255,255,255,.55)" strokeWidth={1.5}/></div>
                  {ph&&<img src={ph} alt={pro.name} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.currentTarget.style.display="none";}}/>}
                </div>);})()}
                <div style={{flex:1,padding:"12px 12px",minWidth:0}}>
                  <p style={{fontSize:15,fontWeight:800,color:T.ink,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 3px"}}>{pro.cat} · ★ {pro.rating}</p>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {pro.slots.slice(0,3).map(slot => (
                      <button key={slot} onClick={()=>nav("cl_prenota",{pro,preselSlot:slot})} style={{padding:"4px 10px",borderRadius:99,border:`1px solid ${T.line}`,background:T.surface,cursor:"pointer",fontSize:11,fontWeight:600,color:T.inkMid,fontFamily:"inherit"}}>{slot}</button>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setConfirmId(pro.id)} style={{background:"none",border:"none",padding:"12px 14px",cursor:"pointer",flexShrink:0}} title="Rimuovi dai preferiti">
                  <IHeart a={true}/>
                </button>
              </div>
              <div style={{display:"flex",gap:8,padding:"10px 12px",borderTop:`1px solid ${T.line}`}}>
                <button onClick={()=>nav("cl_pro",pro)} style={{flex:1,padding:"10px 0",borderRadius:12,border:`1px solid ${T.line}`,background:T.white,cursor:"pointer",fontSize:13,fontWeight:600,color:T.inkMid,fontFamily:"inherit"}}>Profilo</button>
                <button onClick={()=>nav("cl_prenota",{pro})} className="btn-apple" style={{flex:2,padding:"11px 0",borderRadius:12,border:"1.5px solid #E5E5EA",background:"#FFFFFF",cursor:"pointer",fontSize:13,fontWeight:700,color:"#111111",fontFamily:"inherit"}}>Prenota ora</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conferma rimozione — dialog minimal */}
      {confirmId && confirmPro && (
        <ConfirmDialog
          title={`Rimuovere ${confirmPro.name}?`}
          message="Non comparirà più nei preferiti. Potrai sempre ri-aggiungerlo."
          confirmLabel="Rimuovi" danger
          onConfirm={doRemove} onCancel={()=>setConfirmId(null)}
        />
      )}
    </div>
  );
}

/* PROFILO PRO */
function ClPro({pro,nav,favorites,setFavorites,following,setFollowing,onMessage}) {
  const isFav = favorites?.has(pro.id)||false;
  const [confirmUnfav,setConfirmUnfav] = useState(false);
  const [confirmUnfollow,setConfirmUnfollow] = useState(false);
  const toggleFav = () => {
    if(isFav){ setConfirmUnfav(true); return; }           // rimozione → conferma
    setFavorites&&setFavorites(f=>{const n=new Set(f);n.add(pro.id);return n;});
  };
  const doUnfav = () => { setFavorites&&setFavorites(f=>{const n=new Set(f);n.delete(pro.id);return n;}); setConfirmUnfav(false); };
  const isFollowing = following?.has(pro.id)||false;
  const followerCount = pro.followers + (isFollowing?1:0);
  const doUnfollow = () => { setFollowing&&setFollowing(f=>{const n=new Set(f);n.delete(pro.id);return n;}); setConfirmUnfollow(false); };
  const toggleFollow = () => isFollowing ? setConfirmUnfollow(true) : setFollowing&&setFollowing(f=>{const n=new Set(f);n.add(pro.id);return n;});
  const [selSvc,setSvc] = useState(null);
  const [showRev,setShowRev] = useState(false);
  const [stars,setStars] = useState(5);
  const [revText,setRevText] = useState("");
  const [reviews,setReviews] = useState([
    {name:"Marco T.",text:"Risultato perfetto!",stars:5,date:"10 giu 2026"},
    {name:"Lucia F.",text:"Professionale e puntuale.",stars:5,date:"28 mag 2026"},
  ]);
  const proPosts = FEED.filter(p=>p.proId===pro.id);
  const coverPhotoId = (CAT_PHOTOS[pro.catId]||[])[0];
  const coverSrc = coverPhotoId
    ? `https://images.unsplash.com/photo-${coverPhotoId}?w=860&h=400&fit=crop&crop=center&auto=format&q=80`
    : null;

  return (
    <div style={{paddingBottom:140}}>
      {/* Cover */}
      <div style={{position:"relative",height:170}}>
        {coverSrc
          ? <img src={coverSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.currentTarget.style.display="none";}}/>
          : <div style={{width:"100%",height:"100%",background:`${pro.accent}44`}}/>
        }
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,.1),rgba(0,0,0,.5))"}}/>
        <button onClick={()=>nav("cl_home")} style={{position:"absolute",top:48,left:14,width:32,height:32,borderRadius:16,background:"rgba(0,0,0,.4)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <button onClick={toggleFav} style={{position:"absolute",top:48,right:14,width:32,height:32,borderRadius:16,background:"rgba(0,0,0,.4)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill={isFav?"#E91E8C":"none"} stroke={isFav?"#E91E8C":"white"} strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
        <div style={{position:"absolute",bottom:-24,left:16,width:58,height:58,borderRadius:"50%",border:`3px solid ${T.white}`,background:`${pro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,boxShadow:"0 2px 10px rgba(0,0,0,.2)"}}>{pro.emoji}</div>
      </div>

      {/* Info */}
      <div style={{padding:"30px 16px 12px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
          <div><h1 style={{fontSize:19,fontWeight:700,color:T.ink,margin:"0 0 2px"}}>{pro.name}</h1><p style={{fontSize:12,color:T.inkSoft,margin:0}}>@{pro.handle} - {pro.city}</p></div>
        </div>
        <p style={{fontSize:13,color:T.inkMid,lineHeight:1.6,margin:"0 0 10px"}}>{pro.bio}</p>
        <div style={{display:"flex",borderTop:`1px solid ${T.line}`,borderBottom:`1px solid ${T.line}`,padding:"10px 0",marginBottom:11}}>
          {[[proPosts.length,"post"],[followerCount,"follower"],[pro.reviews,"rec."],[pro.rating,""]].map(([v,l],i,arr) => (
            <div key={l+i} style={{flex:1,textAlign:"center",borderRight:i<arr.length-1?`1px solid ${T.line}`:"none"}}>
              <p style={{fontSize:15,fontWeight:700,color:T.ink,margin:0}}>{i===3?"★":""}{v}</p>
              <p style={{fontSize:10,color:T.inkSoft,margin:0}}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:9}}>
          <button onClick={toggleFollow} style={{flex:2,padding:"11px 0",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",
            background:isFollowing?T.surface:T.grad,
            color:isFollowing?T.inkMid:"#fff",
            boxShadow:isFollowing?"none":"0 4px 14px rgba(140,115,83,.3)"}}>
            {isFollowing?"✓ Segui già":"+ Segui"}
          </button>
          <button onClick={()=>onMessage&&onMessage()} style={{flex:1,padding:"11px 0",borderRadius:10,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontSize:13,fontWeight:700,color:T.brandDeep,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.brandDeep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            Messaggio
          </button>
        </div>
      </div>

      {/* Conferma smetti di seguire */}
      {confirmUnfollow && (
        <ConfirmDialog
          title={`Smettere di seguire ${pro.name}?`}
          message="Non riceverai più aggiornamenti da questo professionista."
          confirmLabel="Smetti" danger
          onConfirm={doUnfollow} onCancel={()=>setConfirmUnfollow(false)}
        />
      )}

      {/* Conferma rimozione preferito — dialog minimal */}
      {confirmUnfav && (
        <ConfirmDialog
          title={`Rimuovere ${pro.name}?`}
          message="Non comparirà più nei preferiti. Potrai sempre ri-aggiungerlo."
          confirmLabel="Rimuovi" danger
          onConfirm={doUnfav} onCancel={()=>setConfirmUnfav(false)}
        />
      )}

      {/* Foto griglia */}
      {proPosts.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:2}}>
          {proPosts.map(post => <div key={post.id} style={{aspectRatio:"1",overflow:"hidden"}}><Photo src={post.img} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>)}
        </div>
      )}

      {/* Servizi */}
      <div style={{padding:"14px 16px 0"}}>
        <p style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:8}}>Servizi</p>
        {pro.services.map((s,i) => {
          const act = selSvc?.id===s.id;
          return (
            <div key={s.id}>
              <div onClick={()=>setSvc(act?null:s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",cursor:"pointer"}}>
                <div><p style={{fontSize:13,fontWeight:act?600:500,color:act?T.ink:T.inkMid,margin:"0 0 1px"}}>{s.name}</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>{s.min} min</p></div>
                <span style={{fontSize:14,fontWeight:700,color:T.ink}}>{s.price}€</span>
              </div>
              {act && (
                <div style={{paddingBottom:10}}>
                  <button onClick={()=>nav("cl_prenota",{pro,service:s})} className="btn-apple" style={{width:"100%",padding:"12px 0",borderRadius:12,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Scegli data e orario</button>
                </div>
              )}
              {i < pro.services.length-1 && <DivP/>}
            </div>
          );
        })}
      </div>

      {/* Recensioni */}
      <div style={{padding:"14px 16px 0"}}>
        <p style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:10}}>Recensioni</p>
        {reviews.map((r,i) => (
          <div key={i} style={{marginBottom:10,padding:"11px 12px",background:T.surface,borderRadius:11}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <p style={{fontSize:13,fontWeight:600,color:T.ink,margin:0}}>{r.name}</p>
              <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{r.date}</p>
            </div>
            <div style={{color:T.gold,fontSize:13,marginBottom:4}}>{"★".repeat(r.stars)}</div>
            <p style={{fontSize:13,color:T.inkMid,margin:0,lineHeight:1.5}}>{r.text}</p>
          </div>
        ))}
      </div>

      {/* PRENOTA ORA sticky */}
      <div style={{position:"fixed",bottom:98,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 32px)",maxWidth:398,zIndex:50}}>
        <button onClick={()=>nav("cl_prenota",{pro})} className="btn-apple ba-btn-bounce" style={{width:"100%",padding:"16px 0",borderRadius:18,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>
          PRENOTA ORA
        </button>
      </div>

      {/* Modal recensione */}
      {showRev && (
        <Modal title={`Recensisci ${pro.name}`} onClose={()=>setShowRev(false)}>
          <p style={{fontSize:13,color:T.inkMid,marginBottom:12}}>Come valuti la tua esperienza?</p>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:14}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>setStars(n)} style={{fontSize:28,background:"none",border:"none",cursor:"pointer",color:n<=stars?T.gold:"#D1D5DB",padding:0}}>{n<=stars?"★":"☆"}</button>
            ))}
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:.7}}>La tua recensione</label>
            <textarea value={revText} onChange={e=>setRevText(e.target.value)} placeholder="Racconta la tua esperienza..." style={{width:"100%",padding:"11px 13px",borderRadius:10,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",resize:"none",minHeight:80,boxSizing:"border-box",lineHeight:1.5}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Annulla" onClick={()=>setShowRev(false)} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
            <button onClick={()=>{if(!revText)return;const now=new Date();setReviews(p=>[{name:"Tu",text:revText,stars,date:`${now.getDate()} giu 2026`},...p]);setShowRev(false);setRevText("");}} disabled={!revText} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,color:T.white,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:!revText?.4:1}}>Pubblica</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* PRENOTA con calendario */
/* ── Disponibilità condivisa: date e orari uniformi in tutta l'app ── */
const DAY_N = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const MON_N = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
function genDates(count){
  const today = new Date(); today.setHours(0,0,0,0);
  return Array.from({length:count},(_,i)=>{
    const d = new Date(today); d.setDate(today.getDate()+i);
    return {label:i===0?"Oggi":i===1?"Domani":`${DAY_N[d.getDay()]} ${d.getDate()} ${MON_N[d.getMonth()]}`,day:d.getDate(),dayName:DAY_N[d.getDay()],key:dayKeyOf(d)};
  });
}
const BOOKING_TIMES = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30"];

function ClPrenota({data,nav,isBooked,onBook}) {
  const {pro,service:preselSvc} = data;
  const [svc,setSvc] = useState(preselSvc||pro.services[0]);
  const [selDate,setSelDate] = useState(null);
  const [selTime,setSelTime] = useState(data.preselSlot||null);
  const [step,setStep] = useState(preselSvc?2:1);
  const [done,setDone] = useState(false);

  const DATES = genDates(14);
  const TIMES = BOOKING_TIMES;
  const taken = (t)=> isBooked && selDate && isBooked(pro.id, selDate.label, t);

  if (done) return (
    <div style={{minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 26px",textAlign:"center"}}>
      <div style={{width:68,height:68,borderRadius:34,background:T.amberBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:16}}>📨</div>
      <h1 style={{fontSize:22,fontWeight:700,color:T.ink,marginBottom:8}}>Richiesta inviata!</h1>
      <p style={{fontSize:13,color:T.inkMid,marginBottom:8,lineHeight:1.6}}>{svc.name} - {pro.name}<br/>{selDate?.label} alle {selTime}</p>
      <p style={{fontSize:12.5,color:T.inkSoft,marginBottom:22,lineHeight:1.6,maxWidth:300}}>Il professionista deve confermare. Riceverai la risposta in <b>Messaggi</b> e la trovi tra i tuoi appuntamenti come <b>“In attesa”</b>.</p>
      <BigBtn label="Vedi appuntamenti" onClick={()=>nav("cl_appts")}/>
      <button onClick={()=>nav("cl_chats")} style={{marginTop:9,background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.inkSoft,padding:"9px 0",fontFamily:"inherit"}}>Vai ai messaggi</button>
    </div>
  );

  return (
    <div style={{paddingBottom:90}}>
      <div style={{padding:"48px 18px 12px"}}>
        <BackBtn onClick={()=>step===1?nav("cl_pro",pro):setStep(s=>s-1)}/>
        <h1 style={{fontSize:19,fontWeight:700,color:T.ink,margin:"10px 0 10px"}}>Prenota - {pro.name}</h1>
        <div style={{display:"flex",gap:5}}>
          {["Servizio","Data e ora","Conferma"].map((l,i) => (
            <div key={l} style={{flex:1}}>
              <div style={{height:3,borderRadius:2,background:step>i?T.ink:T.line,marginBottom:3}}/>
              <p style={{fontSize:9,color:step>i?T.ink:T.inkSoft,margin:0,fontWeight:step===i+1?700:400}}>{l}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{height:1,background:T.line}}/>

      {step===1 && (
        <div style={{padding:"12px 18px"}}>
          <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Scegli servizio</p>
          {pro.services.map((s,i) => (
            <div key={s.id}>
              <div onClick={()=>setSvc(s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:19,height:19,borderRadius:10,border:`2px solid ${svc.id===s.id?T.ink:T.line}`,background:svc.id===s.id?T.ink:T.white,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {svc.id===s.id && <div style={{width:7,height:7,borderRadius:4,background:T.white}}/>}
                  </div>
                  <div><p style={{fontSize:14,fontWeight:svc.id===s.id?600:400,color:T.ink,margin:"0 0 1px"}}>{s.name}</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>{s.min} min</p></div>
                </div>
                <span style={{fontSize:14,fontWeight:700,color:T.ink}}>{s.price}€</span>
              </div>
              {i < pro.services.length-1 && <div style={{height:1,background:T.line}}/>}
            </div>
          ))}
          <div style={{marginTop:14}}><BigBtn label="Continua" onClick={()=>setStep(2)}/></div>
        </div>
      )}

      {step===2 && (
        <div style={{padding:"12px 18px"}}>
          <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Scegli il giorno</p>
          <div style={{display:"flex",gap:7,overflowX:"auto",scrollbarWidth:"none",marginBottom:18,paddingBottom:2}}>
            {DATES.map((d,i) => {
              const sel = selDate?.label===d.label;
              return (
                <button key={i} onClick={()=>{setSelDate(d);setSelTime(null);}} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",padding:"9px 10px",borderRadius:11,border:`1.5px solid ${sel?T.ink:T.line}`,background:sel?T.ink:T.white,cursor:"pointer",minWidth:52,fontFamily:"inherit"}}>
                  <span style={{fontSize:9,color:sel?T.gold:T.inkSoft,fontWeight:600,marginBottom:3}}>{d.dayName}</span>
                  <span style={{fontSize:17,fontWeight:700,color:sel?T.white:T.ink}}>{d.day}</span>
                </button>
              );
            })}
          </div>
          {selDate && (
            <>
              <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Scegli l'orario</p>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
                {TIMES.map(t => {
                  const busy = taken(t);
                  const isSel = selTime===t;
                  return (
                    <button key={t} disabled={busy} onClick={()=>!busy&&setSelTime(t)} title={busy?"Orario occupato":""}
                      style={{padding:"8px 13px",borderRadius:9,position:"relative",
                        border:`1.5px solid ${busy?T.line:isSel?T.ink:T.line}`,
                        background:busy?T.surface:isSel?T.ink:T.white,
                        cursor:busy?"not-allowed":"pointer",
                        fontSize:13,fontWeight:isSel?700:400,
                        color:busy?T.inkSoft:isSel?T.white:T.ink,
                        textDecoration:busy?"line-through":"none",opacity:busy?.6:1,fontFamily:"inherit"}}>{t}</button>
                  );
                })}
              </div>
              <p style={{fontSize:11,color:T.inkSoft,margin:"-8px 0 16px"}}>Gli orari <span style={{textDecoration:"line-through"}}>barrati</span> sono già occupati.</p>
            </>
          )}
          {selDate && selTime && (
            <div style={{padding:"10px 12px",background:T.greenBg,borderRadius:9,marginBottom:12}}>
              <p style={{fontSize:13,color:T.green,margin:0,fontWeight:600}}>✓ {selDate.label} alle {selTime} - {svc.name} - {svc.price}€</p>
            </div>
          )}
          <BigBtn label="Continua" disabled={!selDate||!selTime} onClick={()=>setStep(3)}/>
        </div>
      )}

      {step===3 && (
        <div style={{padding:"12px 18px"}}>
          <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Riepilogo</p>
          <div style={{background:T.surface,borderRadius:13,padding:"2px 0",marginBottom:14}}>
            {[["Professionista",pro.name],["Servizio",svc.name],["Giorno",selDate?.label],["Orario",selTime],["Durata",`${svc.min} min`]].map(([k,v]) => (
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderBottom:`1px solid ${T.line}`}}><span style={{fontSize:13,color:T.inkSoft}}>{k}</span><span style={{fontSize:13,color:T.ink,fontWeight:500}}>{v}</span></div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 14px"}}><span style={{fontSize:15,fontWeight:700,color:T.ink}}>Totale</span><span style={{fontSize:18,fontWeight:700,color:T.ink}}>{svc.price}€</span></div>
          </div>
          <div style={{padding:"10px 12px",background:T.amberBg,borderRadius:9,marginBottom:14}}>
            <p style={{fontSize:12,color:T.amber,margin:0}}>Promemoria 1 ora prima</p>
          </div>
          <BigBtn label="Invia richiesta" onClick={()=>{ onBook&&onBook(pro.id,selDate,selTime,svc); setDone(true); }}/>
          <button onClick={()=>setStep(2)} style={{width:"100%",marginTop:9,background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.inkSoft,padding:"9px 0",fontFamily:"inherit"}}>Modifica data e orario</button>
        </div>
      )}
    </div>
  );
}

/* APPUNTAMENTI CLIENTE */
// Helper avatar editor — definiti a livello modulo (non dentro altri component)
function AvSelPill({label,active,onClick}) {
  return (
    <button onClick={onClick} style={{flexShrink:0,padding:"10px 16px",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:active?T.brand:"#F0F0F0",color:active?"#fff":"#555",boxShadow:active?`0 3px 10px ${T.brand}44`:"none",transition:"all .18s ease"}}>
      {label}
    </button>
  );
}
function AvColorDot({color,active,onClick,size}) {
  const s = size||46;
  return (
    <button onClick={onClick} style={{width:s,height:s,borderRadius:"50%",background:color,border:active?`3px solid ${T.brand}`:"3px solid transparent",cursor:"pointer",flexShrink:0,boxShadow:active?`0 0 0 2px white, 0 4px 12px ${color}88`:"0 2px 8px rgba(0,0,0,.14)",transition:"all .2s ease",padding:0}}/>
  );
}
const AV_HAIR_EMOJI = ["✂️","〰️","💁","🌀","💆","🪒"];

// Sub-component a livello modulo (non dentro funzioni) per evitare bug React
function AvSectionTitle({children}) {
  return <p style={{fontSize:13,fontWeight:800,color:"#888",margin:"0 0 14px",textTransform:"uppercase",letterSpacing:1.1}}>{children}</p>;
}
function AvColorGrid({colors, active, onSelect, size, labels}) {
  return (
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:4}}>
      {colors.map(function(c,i) {
        const isActive = active===c;
        return (
          <div key={c} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <button onClick={function(){onSelect(c);}} style={{width:size||48,height:size||48,borderRadius:"50%",background:c,border:isActive?`3.5px solid ${T.brand}`:"3.5px solid transparent",cursor:"pointer",padding:0,flexShrink:0,boxShadow:isActive?`0 0 0 2.5px white,0 4px 14px ${c}99`:`0 2px 8px rgba(0,0,0,.15)`,transition:"all .18s ease"}}/>
            {labels && <span style={{fontSize:9,fontWeight:700,color:isActive?T.brand:"#AAA"}}>{labels[i]}</span>}
          </div>
        );
      })}
    </div>
  );
}
function AvStyleGrid({options, active, onSelect, emojis}) {
  return (
    <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
      {options.map(function(label,i) {
        const isActive = active===i;
        return (
          <button key={i} onClick={function(){onSelect(i);}} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"16px 14px",minWidth:76,borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",background:isActive?T.brand:"#F2F2F5",transition:"all .2s cubic-bezier(.34,1.56,.64,1)",transform:isActive?"scale(1.06)":"scale(1)",boxShadow:isActive?`0 6px 20px ${T.brand}44`:"0 2px 6px rgba(0,0,0,.06)"}}>
            {emojis && <span style={{fontSize:26,lineHeight:1}}>{emojis[i]}</span>}
            <span style={{fontSize:11,fontWeight:800,color:isActive?"#fff":"#666",letterSpacing:.2}}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
function AvPillRow({options, active, onSelect}) {
  return (
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {options.map(function(label,i) {
        const isActive = active===i;
        return (
          <button key={i} onClick={function(){onSelect(i);}} style={{padding:"10px 18px",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,background:isActive?T.brand:"#F2F2F5",color:isActive?"#fff":"#555",boxShadow:isActive?`0 4px 12px ${T.brand}44`:"none",transition:"all .2s ease"}}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── AvatarEditorScreen — UI premium istantanea ───────────────
function AvatarEditorScreen({ nav, avatarConfig, setAvatarConfig }) {
  const [cfg, setCfg] = useState(Object.assign({}, AVATAR_DEFAULT, avatarConfig || {}));
  const [tab, setTab] = useState("viso");
  const up = (k,v) => setCfg(function(c){ return Object.assign({},c,{[k]:v}); });
  const save = function() { setAvatarConfig(cfg); nav("cl_profilo"); };

  const TABS = [
    {id:"viso",    label:"Viso",     emoji:"🧑"},
    {id:"capelli", label:"Capelli",  emoji:"💇"},
    {id:"occhi",   label:"Occhi",    emoji:"👁️"},
    {id:"barba",   label:"Barba",    emoji:"🧔"},
    {id:"access",  label:"Accessori",emoji:"👓"},
    {id:"vestiti", label:"Vestiti",  emoji:"👕"},
  ];

  return (
    <div style={{background:"#F5F5F8",minHeight:"100dvh",paddingBottom:110}}>

      {/* ── Top bar ── */}
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(245,245,248,.95)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"52px 20px 0"}}>
          <button onClick={()=>nav("cl_profilo")} style={{width:36,height:36,borderRadius:12,background:"#EAEAEA",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{fontSize:16,fontWeight:900,color:"#0D0D0E",letterSpacing:"-.03em"}}>Il tuo Avatar</span>
          <button onClick={save} style={{padding:"9px 22px",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:800,background:T.brand,color:"#fff",boxShadow:`0 4px 16px ${T.brand}55`,letterSpacing:.2}}>Salva</button>
        </div>

        {/* Avatar preview */}
        <div style={{display:"flex",justifyContent:"center",padding:"20px 0 8px"}}>
          <div className="av-float" style={{width:160,height:160,borderRadius:"50%",background:`radial-gradient(ellipse at 35% 30%, ${T.brandBg} 0%, #FFFFFF 70%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 20px 60px ${T.brand}22, 0 4px 20px rgba(0,0,0,.07), inset 0 1px 0 rgba(255,255,255,.8)`}}>
            <Avatar3D config={cfg} size={136}/>
          </div>
        </div>

        {/* Tab pills */}
        <div style={{display:"flex",gap:6,overflowX:"auto",padding:"10px 16px 16px",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
          {TABS.map(function(t) {
            const active = tab===t.id;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,padding:"9px 14px",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:800,background:active?T.brand:"#EAEAEA",color:active?"#fff":"#666",boxShadow:active?`0 3px 12px ${T.brand}44`:"none",transition:"all .22s ease"}}>
                <span style={{fontSize:14}}>{t.emoji}</span>{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Pannello opzioni ── */}
      <div style={{padding:"20px 20px 0"}}>

        {tab==="viso" && (
          <div className="av-pop" style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
            <AvSectionTitle>Carnagione</AvSectionTitle>
            <AvColorGrid colors={AV_SKINS.map(function(s){return s.v;})} labels={AV_SKINS.map(function(s){return s.l;})} active={cfg.skin} onSelect={function(c){up("skin",c);}} size={50}/>
          </div>
        )}

        {tab==="capelli" && (
          <div className="av-pop" style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Taglio</AvSectionTitle>
              <AvStyleGrid options={AV_HAIR_LABELS} emojis={AV_HAIR_EMOJI} active={cfg.hairStyle} onSelect={function(i){up("hairStyle",i);}}/>
            </div>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Colore capelli</AvSectionTitle>
              <AvColorGrid colors={AV_HAIR_COLORS} active={cfg.hairColor} onSelect={function(c){up("hairColor",c);}} size={44}/>
            </div>
          </div>
        )}

        {tab==="occhi" && (
          <div className="av-pop" style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Colore occhi</AvSectionTitle>
              <AvColorGrid colors={AV_EYE_COLORS} active={cfg.eyeColor} onSelect={function(c){up("eyeColor",c);}} size={52}/>
            </div>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Sopracciglia</AvSectionTitle>
              <AvPillRow options={["Naturali","Sottili","Spesse","Alzate"]} active={cfg.browStyle} onSelect={function(i){up("browStyle",i);}}/>
            </div>
          </div>
        )}

        {tab==="barba" && (
          <div className="av-pop" style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
            <AvSectionTitle>Barba & Baffi</AvSectionTitle>
            <AvStyleGrid options={AV_BEARD_LABELS} emojis={["🚫","✏️","🪒","🧔","👨"]} active={cfg.beardStyle} onSelect={function(i){up("beardStyle",i);}}/>
          </div>
        )}

        {tab==="access" && (
          <div className="av-pop" style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Occhiali</AvSectionTitle>
              <AvStyleGrid options={AV_GLASSES_LABELS} emojis={["🚫","🕶️","👓","😻"]} active={cfg.glasses} onSelect={function(i){up("glasses",i);}}/>
            </div>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Orecchini</AvSectionTitle>
              <AvStyleGrid options={AV_EARRING_LABELS} emojis={["🚫","💎","⭕","✨"]} active={cfg.earrings} onSelect={function(i){up("earrings",i);}}/>
            </div>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Cappello</AvSectionTitle>
              <AvStyleGrid options={AV_HAT_LABELS} emojis={["🚫","🧢","🎓"]} active={cfg.hat} onSelect={function(i){up("hat",i);}}/>
            </div>
          </div>
        )}

        {tab==="vestiti" && (
          <div className="av-pop" style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Stile vestito</AvSectionTitle>
              <AvStyleGrid options={AV_OUTFIT_LABELS} emojis={["👕","🥼","🧥","👗"]} active={cfg.outfit} onSelect={function(i){up("outfit",i);}}/>
            </div>
            <div style={{background:"#FFF",borderRadius:24,padding:20,boxShadow:"0 4px 20px rgba(0,0,0,.05)"}}>
              <AvSectionTitle>Colore</AvSectionTitle>
              <AvColorGrid colors={AV_OUTFIT_COLORS} active={cfg.outfitColor} onSelect={function(c){up("outfitColor",c);}} size={52}/>
            </div>
          </div>
        )}

        {/* Pulsante salva bottom */}
        <button onClick={save} style={{width:"100%",marginTop:24,padding:"16px 0",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:16,fontWeight:800,background:`linear-gradient(135deg,${T.brand},${T.brand}CC)`,color:"#fff",boxShadow:`0 8px 24px ${T.brand}44`,letterSpacing:.3}}>
          Salva il mio Avatar ✨
        </button>
      </div>
    </div>
  );
}

function ClAppts({nav,allAppts,setAllAppts}) {
  const [tab,setTab] = useState("futuri");
  const [spostaId,setSpostaId] = useState(null);
  const [newDate,setNewDate] = useState("");
  const [newTime,setNewTime] = useState("");
  const [view,setView] = useState("lista");
  const [cancelId,setCancelId] = useState(null);
  const cancelAppt = allAppts.find(a=>a.id===cancelId);
  const doCancel = () => { setAllAppts(p=>p.map(x=>x.id===cancelId?{...x,status:"cancellato"}:x)); setCancelId(null); };

  const DATE_OPTS = ["Domani","Lun 22 giu","Mar 23 giu","Mer 24 giu","Gio 25 giu","Ven 26 giu","Sab 27 giu"];
  const TIME_OPTS = ["08:00","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00"];
  const movingAppt = allAppts.find(a=>a.id===spostaId);
  const canModify = a => a.date!=="Oggi";
  const confirmSposta = () => {
    if(!newDate||!newTime) return;
    setAllAppts(p=>p.map(a=>a.id===spostaId?{...a,date:newDate,time:newTime}:a));
    setSpostaId(null);setNewDate("");setNewTime("");
  };

  const futuri = allAppts.filter(a=>a.status==="confermato"||a.status==="in attesa");
  const passati = allAppts.filter(a=>a.status==="completato");
  const annullati = allAppts.filter(a=>a.status==="cancellato");
  const shown = tab==="futuri"?futuri:tab==="passati"?passati:annullati;

  const today = new Date(2026,5,14);
  const CAL_DAYS = Array.from({length:7},(_,i)=>{
    const d = new Date(today); d.setDate(today.getDate()+i);
    const DN = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
    const label = i===0?"Oggi":i===1?"Domani":`${DN[d.getDay()]} ${d.getDate()}`;
    return {day:d.getDate(),name:DN[d.getDay()],label,appts:futuri.filter(a=>a.date===label)};
  });
  const [selCalDay,setSelCalDay] = useState(CAL_DAYS[0]);

  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"52px 18px 14px"}}>
        <h1 style={{fontSize:30,fontWeight:900,color:T.ink,margin:"0 0 14px",letterSpacing:"-.02em"}}>Appuntamenti</h1>
        <div className="clay-inset" style={{display:"flex",background:T.surface,borderRadius:16,padding:4,gap:2,marginBottom:10}}>
          {[["lista","Lista"],["calendario","Calendario"]].map(([v,l]) => (
            <button key={v} onClick={()=>setView(v)} className={view===v?"clay-soft":""} style={{flex:1,padding:"9px 0",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:view===v?800:600,background:view===v?T.white:"transparent",color:view===v?T.brand:T.inkSoft,fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        {view==="lista" && (
          <div style={{display:"flex",borderTop:`1px solid ${T.line}`}}>
            {[["futuri","Futuri",futuri.length],["passati","Passati",passati.length],["annullati","Annullati",annullati.length]].map(([id,l,n]) => (
              <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"10px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:tab===id?700:400,color:tab===id?T.ink:T.inkSoft,borderBottom:tab===id?`2.5px solid ${T.ink}`:"2.5px solid transparent",fontFamily:"inherit"}}>
                {l}{n>0&&<span style={{fontSize:10,background:tab===id?T.ink:T.line,color:tab===id?T.white:T.inkSoft,borderRadius:99,padding:"1px 5px",marginLeft:3}}>{n}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {view==="lista" && (
        <div style={{padding:"12px 14px"}}>
          {shown.length===0 && (
            <div style={{textAlign:"center",padding:"60px 0"}}>
              <p style={{fontSize:40,marginBottom:10}}>📅</p>
              <p style={{fontSize:15,fontWeight:700,color:T.ink,marginBottom:6}}>
                {tab==="futuri"?"Nessun appuntamento futuro":tab==="passati"?"Nessun appuntamento passato":"Nessun appuntamento annullato"}
              </p>
              {tab==="futuri" && <button onClick={()=>nav("cl_home")} className="btn-apple" style={{padding:"13px 26px",borderRadius:12,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Prenota ora</button>}
            </div>
          )}
          {shown.map(a => {
            const locked = !canModify(a);
            const isPast = a.status==="completato";
            const isCancelled = a.status==="cancellato";
            return (
              <div key={a.id} className="clay ba-zoom" style={{background:T.white,borderRadius:20,marginBottom:11,overflow:"hidden"}}>
                <div style={{padding:"14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                    <div style={{minWidth:0}}><p style={{fontSize:15,fontWeight:700,color:T.ink,margin:"0 0 3px"}}>{a.service}</p>
                      <button onClick={()=>a.proObj&&nav("cl_pro",a.proObj)} disabled={!a.proObj} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",padding:0,cursor:a.proObj?"pointer":"default",fontFamily:"inherit"}}>
                        {a.proObj ? <Av pro={a.proObj} size={20} fs={10}/> : null}
                        <span style={{fontSize:12,fontWeight:600,color:a.proObj?T.brand:T.inkSoft}}>{a.pro}</span>
                        {a.proObj && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>}
                      </button>
                    </div>
                    <Pill label={ST[a.status]?.label} style={{background:ST[a.status]?.bg,color:ST[a.status]?.text,flexShrink:0}}/>
                  </div>
                  <div style={{display:"flex",gap:7,marginBottom:10}}>
                    {[["Giorno",a.date],["Orario",a.time],["Totale",`${a.price}€`]].map(([k,v]) => (
                      <div key={k} style={{flex:1,background:T.surface,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                        <p style={{fontSize:9,color:T.inkSoft,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.4}}>{k}</p>
                        <p style={{fontSize:12,fontWeight:700,color:T.ink,margin:0}}>{v}</p>
                      </div>
                    ))}
                  </div>
                  {!isPast&&!isCancelled && (
                    <>
                      {a.status==="in attesa" && <div style={{padding:"7px 10px",background:T.amberBg,borderRadius:7,marginBottom:8,display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:13}}>⏳</span><p style={{fontSize:11,color:T.amber,margin:0}}>In attesa di conferma dal professionista</p></div>}
                      {locked && <div style={{padding:"7px 10px",background:T.amberBg,borderRadius:7,marginBottom:8,display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:13}}>⏰</span><p style={{fontSize:11,color:T.amber,margin:0}}>Non modificabile - meno di 24 ore</p></div>}
                      <div style={{display:"flex",gap:7}}>
                        <button onClick={()=>{if(!locked){setSpostaId(a.id);setNewDate(a.date);setNewTime(a.time);}}} disabled={locked} style={{flex:1,padding:"10px 0",borderRadius:9,border:`1.5px solid ${T.line}`,background:locked?T.surface:T.white,cursor:locked?"default":"pointer",fontSize:12,fontWeight:600,color:locked?T.inkSoft:T.inkMid,fontFamily:"inherit",opacity:locked?.5:1}}>Sposta</button>
                        <button onClick={()=>{if(!locked)setCancelId(a.id);}} disabled={locked} style={{flex:1,padding:"10px 0",borderRadius:9,border:`1.5px solid ${locked?T.line:T.redBg}`,background:locked?T.surface:T.redBg,cursor:locked?"default":"pointer",fontSize:12,fontWeight:600,color:locked?T.inkSoft:T.red,fontFamily:"inherit",opacity:locked?.5:1}}>Disdici</button>
                      </div>
                    </>
                  )}
                  {(isPast||isCancelled) && (
                    <button onClick={()=>a.proObj&&nav("cl_prenota",{pro:a.proObj})} className="btn-apple" style={{width:"100%",padding:"12px 0",borderRadius:12,border:"1.5px solid #E5E5EA",background:"#FFFFFF",cursor:"pointer",fontSize:13,fontWeight:700,color:"#111111",fontFamily:"inherit"}}>Riprenota</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view==="calendario" && (
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"flex",gap:5,marginBottom:12}}>
            {CAL_DAYS.map(d => (
              <button key={d.label} onClick={()=>setSelCalDay(d)} className={selCalDay.label===d.label?"clay-btn":"clay-soft"} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"9px 2px",borderRadius:15,border:"none",background:selCalDay.label===d.label?T.brand:T.white,cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:8,color:selCalDay.label===d.label?"rgba(255,255,255,.85)":T.inkSoft,fontWeight:700,marginBottom:2}}>{d.name}</span>
                <span style={{fontSize:15,fontWeight:800,color:selCalDay.label===d.label?T.white:T.ink}}>{d.day}</span>
                {d.appts.length>0 && <div style={{width:4,height:4,borderRadius:2,background:selCalDay.label===d.label?T.white:T.brand,marginTop:2}}/>}
              </button>
            ))}
          </div>
          <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.line}`}}>
              <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>{selCalDay.label}</p>
              <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{selCalDay.appts.length>0?`${selCalDay.appts.length} appuntamento`:"Nessun appuntamento"}</p>
            </div>
            {selCalDay.appts.length > 0 ? selCalDay.appts.map((a,i) => (
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:11,padding:"12px 14px",borderBottom:i<selCalDay.appts.length-1?`1px solid ${T.line}`:"none"}}>
                <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:0,minWidth:40}}>{a.time}</p>
                <div style={{width:3,height:38,borderRadius:2,background:ST[a.status]?.bar||T.line,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:600,color:T.ink,margin:"0 0 1px"}}>{a.service}</p>
                  <button onClick={()=>a.proObj&&nav("cl_pro",a.proObj)} disabled={!a.proObj} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",padding:0,cursor:a.proObj?"pointer":"default",fontFamily:"inherit"}}>
                    <span style={{fontSize:11,color:a.proObj?T.brand:T.inkSoft,fontWeight:600}}>{a.pro}</span>
                    {a.proObj && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>}
                  </button>
                </div>
                <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>{a.price}€</p>
              </div>
            )) : (
              <div style={{padding:"24px",textAlign:"center"}}>
                <p style={{fontSize:12,color:T.inkSoft,margin:"0 0 10px"}}>Nessun appuntamento</p>
                <button onClick={()=>nav("cl_home")} className="btn-apple" style={{padding:"9px 20px",borderRadius:10,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Prenota</button>
              </div>
            )}
          </div>
        </div>
      )}

      {spostaId && (
        <Modal title="Sposta appuntamento" onClose={()=>setSpostaId(null)}>
          <div style={{padding:"9px 11px",background:T.surface,borderRadius:8,marginBottom:12}}>
            <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 1px",fontWeight:600}}>Appuntamento</p>
            <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:0}}>{movingAppt?.service} - {movingAppt?.pro}</p>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.7}}>Nuovo giorno</label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {DATE_OPTS.map(d=><button key={d} onClick={()=>setNewDate(d)} style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${newDate===d?T.ink:T.line}`,background:newDate===d?T.ink:T.white,color:newDate===d?T.white:T.inkMid,cursor:"pointer",fontSize:11,fontWeight:newDate===d?700:400,fontFamily:"inherit"}}>{d}</button>)}
            </div>
            <p style={{fontSize:10,color:T.inkSoft,margin:"5px 0 0"}}>Regola 24h - non puoi spostare a oggi</p>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.7}}>Nuovo orario</label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {TIME_OPTS.map(t=><button key={t} onClick={()=>setNewTime(t)} style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${newTime===t?T.ink:T.line}`,background:newTime===t?T.ink:T.white,color:newTime===t?T.white:T.inkMid,cursor:"pointer",fontSize:12,fontWeight:newTime===t?700:400,fontFamily:"inherit"}}>{t}</button>)}
            </div>
          </div>
          {newDate&&newTime && <div style={{padding:"9px 11px",background:T.greenBg,borderRadius:8,marginBottom:11}}><p style={{fontSize:12,color:T.green,margin:0,fontWeight:600}}>✓ {newDate} alle {newTime}</p></div>}
          <div style={{display:"flex",gap:7}}>
            <Btn label="Annulla" onClick={()=>setSpostaId(null)} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
            <button onClick={confirmSposta} disabled={!newDate||!newTime} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,color:T.white,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(!newDate||!newTime)?.4:1}}>Conferma</button>
          </div>
        </Modal>
      )}

      {/* Conferma disdetta appuntamento */}
      {cancelId && cancelAppt && (
        <ConfirmDialog
          title="Disdire l'appuntamento?"
          message={`${cancelAppt.service} con ${cancelAppt.pro}, ${cancelAppt.date} alle ${cancelAppt.time}. L'operazione non è reversibile.`}
          confirmLabel="Disdici" danger
          onConfirm={doCancel} onCancel={()=>setCancelId(null)}
        />
      )}
    </div>
  );
}

/* PROFILO CLIENTE — stile Instagram */
/* Visualizzatore post stile Instagram: sfondo bianco, like, commenti, menu (modifica/elimina) */
/* Singola card post dentro il feed a scorrimento (stile Instagram) */
function PostCard({post,isOwner,liked,onToggleLike,onAddComment,onDelete,onEditCaption}) {
  const [txt,setTxt] = useState("");
  const [menu,setMenu] = useState(false);
  const [editing,setEditing] = useState(false);
  const [cap,setCap] = useState(post.caption||"");
  const comments = post.comments||[];
  const likeCount = (post.likes||0)+(liked?1:0);
  const handle = (post.author&&post.author.handle)||"tu";
  const name = (post.author&&(post.author.name||post.author.handle))||"Post";
  const emoji = (post.author&&post.author.emoji)||"🧑";
  const accent = (post.author&&post.author.accent)||"#888";
  const send = () => { if(txt.trim()){ onAddComment&&onAddComment(post,txt.trim()); setTxt(""); } };
  return (
    <div id={"pv-"+post.id} style={{borderBottom:"8px solid #F5F5F7"}}>
      {/* Autore */}
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"12px 14px 10px",position:"relative"}}>
        <div style={{width:34,height:34,borderRadius:"50%",background:`${accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{emoji}</div>
        <p style={{flex:1,minWidth:0,fontSize:14,fontWeight:700,color:"#111",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p>
        {isOwner && <button onClick={()=>setMenu(m=>!m)} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex"}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#111"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </button>}
        {menu && (
          <div style={{position:"absolute",top:44,right:12,background:"#fff",borderRadius:14,boxShadow:"0 8px 30px rgba(0,0,0,.18)",border:"1px solid #EEE",overflow:"hidden",zIndex:5,minWidth:150}}>
            <button onClick={()=>{setMenu(false);setEditing(true);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"13px 16px",border:"none",borderBottom:"1px solid #F2F2F2",background:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,color:"#111",textAlign:"left"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>Modifica
            </button>
            <button onClick={()=>{setMenu(false);onDelete&&onDelete(post);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"13px 16px",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,color:"#E8506E",textAlign:"left"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8506E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>Elimina
            </button>
          </div>
        )}
      </div>

      {/* Immagine */}
      <div onClick={()=>menu&&setMenu(false)} onDoubleClick={()=>{ if(!liked) onToggleLike&&onToggleLike(post); }} style={{width:"100%",background:"#FAFAFA"}}>
        <img src={post.img} alt="" loading="lazy" decoding="async" style={{width:"100%",display:"block",maxHeight:"72vh",objectFit:"contain"}}/>
      </div>

      {/* Azioni */}
      <div style={{padding:"12px 16px 4px",display:"flex",alignItems:"center",gap:20}}>
        <button onClick={()=>onToggleLike&&onToggleLike(post)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:6}}>
          <svg width="27" height="27" viewBox="0 0 24 24" fill={liked?"#FF3B5C":"none"} stroke={liked?"#FF3B5C":"#111"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1a5.5 5.5 0 00-7.8 7.8l1.1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
        </button>
        <div style={{display:"flex",alignItems:"center",gap:6,color:"#111"}}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
          {comments.length>0 && <span style={{fontSize:13,fontWeight:600,color:"#111"}}>{comments.length}</span>}
        </div>
      </div>
      <p style={{fontSize:13.5,fontWeight:700,color:"#111",margin:"0 16px 6px"}}>{likeCount} mi piace</p>

      {/* Didascalia / modifica */}
      {editing ? (
        <div style={{margin:"0 16px 10px"}}>
          <textarea value={cap} onChange={e=>setCap(e.target.value)} rows={3} style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #E5E5EA",borderRadius:12,padding:"10px 12px",fontSize:14,fontFamily:"inherit",color:"#111",outline:"none",resize:"none",lineHeight:1.4}}/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>{setEditing(false);setCap(post.caption||"");}} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1.5px solid #E5E5EA",background:"#fff",color:"#111",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Annulla</button>
            <button onClick={()=>{onEditCaption&&onEditCaption(post.id,cap.trim());setEditing(false);}} style={{flex:2,padding:"10px 0",borderRadius:10,border:"none",background:"#111",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Salva</button>
          </div>
        </div>
      ) : (
        post.caption && <p style={{fontSize:14,color:"#111",margin:"0 16px 6px",lineHeight:1.45}}><span style={{fontWeight:700,marginRight:6}}>{handle}</span>{post.caption}</p>
      )}
      {post.tags&&post.tags.length>0 && <p style={{fontSize:12.5,color:"#5B7CFF",margin:"0 16px 10px"}}>{post.tags.map(t=><span key={t} style={{marginRight:5}}>{t}</span>)}</p>}

      {/* Commenti */}
      <div style={{margin:"6px 16px 0",paddingTop:4}}>
        {comments.length>0 && comments.map((c,i)=>(
          <div key={c.id||i} style={{display:"flex",gap:9,marginBottom:10}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"#F0F0F2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{(c.by&&c.by[0])||"🙂"}</div>
            <div><p style={{fontSize:13.5,color:"#111",margin:0,lineHeight:1.4}}><span style={{fontWeight:700,marginRight:6}}>{c.by||"Tu"}</span>{c.text}</p></div>
          </div>
        ))}
      </div>

      {/* Aggiungi commento */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 16px 16px"}}>
        <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} placeholder="Aggiungi un commento…" style={{flex:1,border:"none",outline:"none",background:"#F2F2F4",borderRadius:99,padding:"11px 15px",fontSize:14,color:"#111",fontFamily:"inherit"}}/>
        <button onClick={send} disabled={!txt.trim()} style={{background:"none",border:"none",cursor:txt.trim()?"pointer":"default",fontSize:14,fontWeight:800,color:txt.trim()?"#5B7CFF":"#C8C8CE",fontFamily:"inherit"}}>Invia</button>
      </div>
    </div>
  );
}

/* Visualizzatore post a scorrimento: apre il post scelto e scorri per vedere gli altri */
function PostViewer({posts,startId,isOwner,likedPosts,onToggleLike,onAddComment,onDelete,onEditCaption,onClose}) {
  const list = (posts&&posts.length) ? posts : [];
  const likedSet = likedPosts||new Set();
  const scrollRef = useRef(null);
  useEffect(()=>{
    if(startId==null) return;
    // porta in cima il post selezionato (ma resta possibile scorrere agli altri)
    const t = setTimeout(()=>{ const el=document.getElementById("pv-"+startId); if(el) el.scrollIntoView({block:"start"}); },30);
    return ()=>clearTimeout(t);
  },[startId]);
  return createPortal(
    <div style={{position:"fixed",inset:0,background:"#FFFFFF",zIndex:1200,display:"flex",flexDirection:"column"}}>
      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"calc(12px + env(safe-area-inset-top,0px)) 14px 10px",flexShrink:0,borderBottom:"1px solid #F0F0F2"}}>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex"}}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <p style={{flex:1,textAlign:"center",fontSize:16,fontWeight:800,color:"#111",margin:0,letterSpacing:"-.01em"}}>Post</p>
        <div style={{width:26}}/>
      </div>
      {/* Feed scrollabile */}
      <div ref={scrollRef} style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {list.map(p=>(
          <PostCard key={p.id} post={p}
            isOwner={typeof isOwner==="function"?isOwner(p):!!isOwner}
            liked={likedSet.has(p.id)}
            onToggleLike={onToggleLike} onAddComment={onAddComment}
            onDelete={onDelete} onEditCaption={onEditCaption}/>
        ))}
        <div style={{height:40}}/>
      </div>
    </div>,
    document.body
  );
}

function ClProfilo({user,onSwitch,nav,feed=FEED,setFeed,onDeletePost,onLikePost,onCommentPost,onSaveAccount,favorites,setFavorites,following,setFollowing,likedPosts,setLikedPosts,onLogout,accent,setAccent,avatarConfig,photo:photoProp,onSavePhoto}) {
  const [tab,setTab] = useState("griglia"); // griglia | recensioni | impostazioni
  const [info,setInfo] = useState({name:user.name,handle:user.username||user.handle||(user.name||"utente").toLowerCase().replace(/\s+/g,"_"),email:user.email||"",city:"",phone:""});
  const [editInfo,setEditInfo] = useState(false);
  const [tmp,setTmp] = useState(info);
  const [notif,setNotif] = useState(true);
  const [privato,setPrivato] = useState(false);
  const [reviews,setReviews] = useState([
    {id:1,pro:"Salon Elite",stars:5,text:"Professionale e puntuale!",date:"10 giu 2026"},
    {id:2,pro:"Nails by Sofia",stars:5,text:"Sofia e fantastica.",date:"28 mag 2026"},
  ]);
  const [showAddRev,setShowAddRev] = useState(false);
  const [newRevPro,setNewRevPro] = useState("");
  const [newRevStars,setNewRevStars] = useState(5);
  const [newRevText,setNewRevText] = useState("");
  const [confirm,setConfirm] = useState(null); // {title,message,confirmLabel,danger,onYes}
  const PROS_LIST = ["Salon Elite","BarberKing","Nails by Sofia","Armonia Spa"];
  // Foto profilo (stile Instagram) — salvata su Supabase Storage, con fallback locale
  const [photo,setPhoto] = useState(photoProp||(()=>{ try{return localStorage.getItem("ba-cl-photo")||"";}catch(e){return "";} })());
  const [photoBusy,setPhotoBusy] = useState(false);
  useEffect(()=>{ if(photoProp) setPhoto(photoProp); },[photoProp]);
  const photoRef = useRef(null);
  const onPickPhoto = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value="";
    if(!f) return;
    // 1) mostra e salva subito la foto (funziona sempre, anche senza Supabase)
    const rd = new FileReader();
    rd.onload = () => { setPhoto(rd.result); try{localStorage.setItem("ba-cl-photo",rd.result);}catch(e){} };
    rd.readAsDataURL(f);
    // 2) prova a caricarla su Supabase Storage in background (per il cross-dispositivo).
    //    NON sostituisco l'anteprima locale: la foto mostrata resta sempre quella (funziona sempre).
    if(onSavePhoto){ try{ await onSavePhoto(f); }catch(err){ /* bucket non pronto: resta la foto locale */ } }
  };

  const fav = favorites||new Set(), foll = following||new Set(), liked = likedPosts||new Set();
  const savedPros = ALL_PROS.filter(p=>fav.has(p.id));
  const likedFeed = FEED.filter(p=>liked.has(p.id));
  // Solo i post pubblicati dall'utente stesso (creati dal compositore Esplora)
  const _ts = p => p.created || (typeof p.id==="number"?p.id:0);
  const myPosts = (feed||[]).filter(p=>p.author && (p.author.name===user.name || (user.username && p.author.handle===user.username) || (user.uid && p.authorUid===user.uid))).sort((a,b)=>_ts(b)-_ts(a));
  const [viewPost,setViewPost] = useState(null); // post aperto in visualizzazione (stile Instagram)
  // Suggerimenti "IA": professionisti non ancora seguiti, ordinati per popolarità
  const suggested = ALL_PROS.filter(p=>!foll.has(p.id)).sort((a,b)=>b.followers-a.followers).slice(0,6);

  const unlikePost = (id) => setConfirm({title:"Togliere il like?",message:"Il post verrà rimosso dai tuoi “Mi piace”.",confirmLabel:"Togli",danger:true,onYes:()=>{setLikedPosts(s=>{const n=new Set(s);n.delete(id);return n;});}});
  const doFollow = (id) => setFollowing(s=>{const n=new Set(s);n.add(id);return n;});
  const askLogout = () => setConfirm({title:"Uscire dall'account?",message:"Dovrai effettuare di nuovo l'accesso.",confirmLabel:"Esci",danger:true,onYes:onLogout});
  const askSwitch = () => setConfirm({title:"Passare a modalità Pro?",message:"Gestirai agenda, clienti e servizi.",confirmLabel:"Passa a Pro",onYes:onSwitch});

  const TABS = [
    {id:"griglia", icon:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>},
    {id:"recensioni", icon:<path d="M12 2l2.9 6.3 6.6.6-5 4.4 1.5 6.5L12 17l-5.9 3.3 1.5-6.5-5-4.4 6.6-.6z"/>},
    {id:"impostazioni", icon:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>},
  ];

  const Toggle = ({on,onClick}) => (
    <button onClick={onClick} style={{width:46,height:27,borderRadius:99,border:"none",cursor:"pointer",padding:3,background:on?T.grad:"#D8D8DC",transition:"background .2s ease",display:"flex",justifyContent:on?"flex-end":"flex-start"}}>
      <span style={{width:21,height:21,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)",transition:"all .2s ease"}}/>
    </button>
  );

  return (
    <div style={{paddingBottom:170,background:"transparent",minHeight:"100dvh"}}>
      {/* Header profilo */}
      <div style={{background:T.white,padding:"50px 18px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
          {/* Avatar — foto profilo modificabile (stile Instagram) */}
          <input ref={photoRef} type="file" accept="image/*" onChange={onPickPhoto} style={{display:"none"}}/>
          <div onClick={()=>photoRef.current&&photoRef.current.click()} style={{position:"relative",width:80,height:80,borderRadius:"50%",background:`linear-gradient(145deg,${T.brandBg},#fff)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 6px 20px ${T.brand}30`,overflow:"hidden",cursor:"pointer"}}>
            {photo
              ? <img src={photo} alt="profilo" onError={e=>{try{const loc=localStorage.getItem("ba-cl-photo");if(loc&&e.currentTarget.src!==loc)e.currentTarget.src=loc;}catch(x){}}} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <span style={{fontSize:30,fontWeight:700,color:T.brand,fontFamily:"'Fraunces',serif"}}>{info.name[0]}</span>}
            {/* Pulsante fotocamera */}
            <div style={{position:"absolute",bottom:-1,right:-1,width:26,height:26,borderRadius:"50%",background:"#111",border:"2.5px solid #fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <div style={{flex:1,display:"flex",justifyContent:"space-around",textAlign:"center"}}>
            {[[savedPros.length,"Salvati"],[likedFeed.length,"Mi piace"],[foll.size,"Seguiti"]].map(([v,l])=>(
              <div key={l}><p style={{fontSize:18,fontWeight:700,color:T.ink,margin:0}}>{v}</p><p style={{fontSize:11,color:T.inkMid,margin:0}}>{l}</p></div>
            ))}
          </div>
        </div>
        <h1 style={{fontSize:19,fontWeight:700,color:T.ink,margin:"0 0 1px"}}>{info.name}</h1>
        <p style={{fontSize:13,color:T.inkMid,margin:"0 0 12px"}}>@{info.handle} · {info.city}</p>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>{setTab("impostazioni");setEditInfo(true);setTmp(info);}} className="clay-soft" style={{flex:1,padding:"11px 0",borderRadius:14,border:"none",background:T.white,cursor:"pointer",fontSize:13,fontWeight:700,color:T.ink,fontFamily:"inherit"}}>Modifica profilo</button>
          <button onClick={()=>setTab("impostazioni")} className="clay-soft" style={{width:44,borderRadius:14,border:"none",background:T.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{TABS[2].icon}</svg>
          </button>
        </div>

      </div>

      {/* Persone che potresti conoscere — IA */}
      {suggested.length>0 && (
        <div style={{padding:"16px 0 8px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"0 18px 10px"}}>
            <span style={{fontSize:15}}>✨</span>
            <div>
              <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:0}}>Persone che potresti conoscere</p>
              <p style={{fontSize:11,color:T.inkSoft,margin:0}}>Suggeriti dall'IA · in base alla tua zona e ai tuoi gusti</p>
            </div>
          </div>
          <div style={{display:"flex",gap:11,overflowX:"auto",padding:"2px 18px 6px",scrollbarWidth:"none"}} className="ba-noscroll">
            {suggested.map(pro=>(
              <div key={pro.id} className="clay" style={{flexShrink:0,width:138,background:T.white,borderRadius:18,padding:"16px 12px",textAlign:"center"}}>
                <div onClick={()=>nav("cl_pro",pro)} style={{cursor:"pointer"}}>
                  <div className="clay-soft" style={{margin:"0 auto 8px",width:54,height:54,borderRadius:"50%",background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{pro.emoji}</div>
                  <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:"0 0 1px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 10px"}}>{pro.followers} follower</p>
                </div>
                {foll.has(pro.id)
                  ? <button disabled style={{width:"100%",padding:"8px 0",borderRadius:10,border:`1.5px solid ${T.line}`,background:T.surface,color:T.inkMid,fontSize:12,fontWeight:700,fontFamily:"inherit"}}>✓ Seguito</button>
                  : <button onClick={()=>doFollow(pro.id)} className="btn-apple" style={{width:"100%",padding:"9px 0",borderRadius:10,border:"1.5px solid #E5E5EA",background:"#FFFFFF",color:"#111111",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Segui</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra tab a icone */}
      <div style={{display:"flex",borderTop:`1px solid ${T.line}`,borderBottom:`1px solid ${T.line}`,background:T.paper,position:"sticky",top:0,zIndex:10}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"12px 0",border:"none",background:"none",cursor:"pointer",display:"flex",justifyContent:"center",borderBottom:tab===t.id?`2px solid ${T.brandDeep}`:"2px solid transparent"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tab===t.id?T.ink:T.inkSoft} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
          </button>
        ))}
      </div>

      {/* TAB griglia: solo i post pubblicati dall'utente */}
      {tab==="griglia" && (
        <div>
          {myPosts.length===0 ? (
            <div style={{textAlign:"center",padding:"60px 30px"}}>
              <div style={{fontSize:40,marginBottom:10}}>📷</div>
              <p style={{fontSize:15,fontWeight:700,color:T.ink,marginBottom:6}}>Nessun post</p>
              <p style={{fontSize:13,color:T.inkSoft,marginBottom:18}}>I contenuti che pubblichi in Esplora appariranno qui.</p>
              <button onClick={()=>nav("cl_explore")} style={{padding:"11px 22px",borderRadius:99,border:"none",background:T.grad,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Crea un post</button>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:3,padding:3}}>
              {myPosts.map(post=>(
                <div key={post.id} onClick={()=>setViewPost(post)} style={{position:"relative",aspectRatio:"1",overflow:"hidden",borderRadius:4,cursor:"pointer"}}>
                  <Photo src={post.img} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB recensioni */}
      {tab==="recensioni" && (
        <div style={{padding:"14px 16px"}}>
          <button onClick={()=>setShowAddRev(true)} className="clay-soft" style={{width:"100%",padding:"13px 0",borderRadius:16,border:"none",background:T.white,color:T.brandDeep,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>+ Scrivi una recensione</button>
          {reviews.map(r => (
            <div key={r.id} className="clay" style={{background:T.white,borderRadius:18,padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:0}}>{r.pro}</p>
                <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{r.date}</p>
              </div>
              <div style={{color:T.brandDeep,fontSize:13,marginBottom:4}}>{"★".repeat(r.stars)}</div>
              <p style={{fontSize:13,color:T.inkMid,margin:0,lineHeight:1.5}}>{r.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB impostazioni */}
      {tab==="impostazioni" && (
        <div style={{padding:"14px 16px"}}>
          {/* Account */}
          <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:`1px solid ${T.line}`}}>
              <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>Account</p>
              {editInfo
                ? <div style={{display:"flex",gap:6}}><Btn label="Annulla" onClick={()=>{setEditInfo(false);setTmp(info);}} style={{fontSize:11,padding:"4px 10px"}}/><button onClick={()=>{const clean={...tmp,handle:(tmp.handle||"").toLowerCase().replace(/[^a-z0-9._]/g,"")};setInfo(clean);setEditInfo(false);onSaveAccount&&onSaveAccount({name:clean.name,username:clean.handle,phone:clean.phone,city:clean.city});}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:T.grad,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Salva</button></div>
                : <Btn label="Modifica" onClick={()=>{setEditInfo(true);setTmp(info);}} style={{fontSize:11,padding:"4px 10px"}}/>
              }
            </div>
            {editInfo ? (
              <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                {[{k:"name",l:"Nome",ph:"Il tuo nome"},{k:"handle",l:"Username",ph:"username"},{k:"email",l:"Email",t:"email",ph:"email@esempio.it"},{k:"city",l:"Città",ph:"Es. Milano"},{k:"phone",l:"Telefono",t:"tel",ph:"333 1234567"}].map(f => (
                  <div key={f.k}><label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>{f.l}</label>
                    {f.k==="city"
                      ? <CityPicker value={tmp.city} onChange={v=>setTmp(p=>({...p,city:v}))}/>
                      : <input type={f.t||"text"} placeholder={f.ph} value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"9px 11px",borderRadius:8,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {[["Email",info.email||"Non indicata"],["Città",info.city||"Non indicata"],["Telefono",info.phone||"Non indicato"]].map(([k,v]) => (
                  <div key={k} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 16px",borderBottom:`1px solid ${T.line}`}}>
                    <span style={{fontSize:13,color:T.inkSoft,minWidth:70}}>{k}</span>
                    <span style={{fontSize:13,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Preferenze */}
          <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.line}`}}>
              <div><p style={{fontSize:14,fontWeight:600,color:T.ink,margin:0}}>Notifiche</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>Promemoria e novità</p></div>
              <Toggle on={notif} onClick={()=>setNotif(v=>!v)}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px"}}>
              <div><p style={{fontSize:14,fontWeight:600,color:T.ink,margin:0}}>Account privato</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>Solo chi approvi vede i salvati</p></div>
              <Toggle on={privato} onClick={()=>setPrivato(v=>!v)}/>
            </div>
          </div>
          {/* Azioni */}
          <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
            <button onClick={askSwitch} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"15px 16px",border:"none",borderBottom:`1px solid ${T.line}`,background:"none",cursor:"pointer",fontFamily:"inherit"}}>
              <span style={{fontSize:14,fontWeight:600,color:T.ink}}>Passa a modalità Pro</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button onClick={askLogout} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"15px 16px",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B5503A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
              <span style={{fontSize:14,fontWeight:700,color:"#B5503A"}}>Esci dall'account</span>
            </button>
          </div>
        </div>
      )}

      {/* Visualizzatore post stile Instagram */}
      {viewPost && (
        <PostViewer posts={myPosts} startId={viewPost.id} isOwner={()=>true}
          likedPosts={likedPosts}
          onToggleLike={(p)=> onLikePost ? onLikePost(p) : (setLikedPosts&&setLikedPosts(s=>{const n=new Set(s);n.has(p.id)?n.delete(p.id):n.add(p.id);return n;}))}
          onAddComment={(p,text)=> onCommentPost ? onCommentPost(p,text) : (setFeed&&setFeed(f=>f.map(x=>String(x.id)===String(p.id)?{...x,comments:[...(x.comments||[]),{id:Date.now(),by:user.name,text}]}:x)))}
          onEditCaption={(id,text)=>setFeed&&setFeed(f=>f.map(p=>String(p.id)===String(id)?{...p,caption:text}:p))}
          onDelete={(p)=>{onDeletePost&&onDeletePost(p);setViewPost(null);}}
          onClose={()=>setViewPost(null)}/>
      )}

      {/* Dialog di conferma generico */}
      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} danger={confirm.danger}
          onConfirm={()=>{confirm.onYes&&confirm.onYes();setConfirm(null);}} onCancel={()=>setConfirm(null)}/>
      )}

      {showAddRev && (
        <Modal title="Scrivi una recensione" onClose={()=>setShowAddRev(false)}>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.7}}>Professionista</label>
            <select value={newRevPro} onChange={e=>setNewRevPro(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",background:T.white}}>
              <option value="">Seleziona...</option>
              {PROS_LIST.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12,textAlign:"center"}}>
            <label style={{fontSize:11,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:.7}}>Valutazione</label>
            <div style={{display:"flex",justifyContent:"center",gap:8}}>
              {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setNewRevStars(n)} style={{fontSize:28,background:"none",border:"none",cursor:"pointer",color:n<=newRevStars?T.gold:"#D1D5DB",padding:0}}>{n<=newRevStars?"★":"☆"}</button>)}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.7}}>Recensione</label>
            <textarea value={newRevText} onChange={e=>setNewRevText(e.target.value)} placeholder="Racconta la tua esperienza..." style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",resize:"none",minHeight:80,boxSizing:"border-box",lineHeight:1.5}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Annulla" onClick={()=>setShowAddRev(false)} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
            <button onClick={()=>{if(!newRevPro||!newRevText)return;const now=new Date();setReviews(p=>[{id:Date.now(),pro:newRevPro,stars:newRevStars,text:newRevText,date:`${now.getDate()} giu 2026`},...p]);setNewRevPro("");setNewRevText("");setNewRevStars(5);setShowAddRev(false);}} disabled={!newRevPro||!newRevText} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,color:T.white,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:(!newRevPro||!newRevText)?.4:1}}>Pubblica</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* PRO - AGENDA */
function ProAgenda({appts,setAppts,clients,setClients,services,staff,hours,nav,openAdd,onConsumeAdd,onModalOpenChange}) {
  const [selStaff,setSelS] = useState(0);
  const [selAppt,setSelAppt] = useState(null);
  const [showAdd,setShowAdd] = useState(false);
  const [dateView,setDateView] = useState("oggi");
  const [view,setView] = useState("giorno");
  const [calMonth,setCalMonth] = useState({y:new Date().getFullYear(),m:new Date().getMonth()});
  const [newA,setNewA] = useState({date:"oggi",time:"",clientSearch:"",clientId:null,serviceId:1,staffId:1,note:"",source:"app"});
  const [suggest,setSuggest] = useState([]);
  const [showLM,setShowLM] = useState(false);
  const [showCal,setShowCal] = useState(false); // calendario per scegliere il giorno dell'appuntamento
  // Apertura automatica dal pulsante "+" (nuovo appuntamento / blocca orario)
  useEffect(()=>{ if(openAdd==="appt"||openAdd==="block"){ setNewA(p=>({...p,date:(dateView==="ieri"?"oggi":dateView)})); setShowAdd(true); onConsumeAdd&&onConsumeAdd(); } },[openAdd]);
  // Informa l'App quando il modale di creazione è aperto (per nascondere il FAB)
  useEffect(()=>{ onModalOpenChange&&onModalOpenChange(showAdd); return ()=>onModalOpenChange&&onModalOpenChange(false); },[showAdd]);

  const getSvc = id => services.find(s=>s.id===id)||{name:"?",price:0,min:0};
  const getCl = id => clients.find(c=>c.id===id)||null;
  const getSt = id => staff.find(s=>s.id===id)||{name:"?",emoji:"👤"};
  const dayAppts = appts.filter(a=>a.date===dateView&&(selStaff===0||a.staffId===selStaff)).sort((a,b)=>a.time.localeCompare(b.time));
  const slotMap = {}; dayAppts.forEach(a=>{slotMap[a.time]=a;});
  const todayConf = appts.filter(a=>a.date==="oggi"&&a.status!=="cancellato");
  const todayRev = todayConf.reduce((s,a)=>s+getSvc(a.serviceId).price,0);

  const searchCl = q => {
    if(!q||q.length<2){setSuggest([]);return;}
    setSuggest(clients.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.phone?.includes(q)).slice(0,4));
  };

  const checkConflict = (time,serviceId,staffId,excludeId,date=dateView) => {
    const start = toMin(time); const dur = getSvc(parseInt(serviceId)).min; const end = start+dur;
    return appts.find(a=>a.id!==excludeId&&a.staffId===parseInt(staffId)&&a.date===date&&a.status!=="cancellato"&&toMin(a.time)<end&&toMin(a.time)+getSvc(a.serviceId).min>start)||null;
  };

  const addAppt = () => {
    if(!newA.time||(!newA.clientId&&!newA.clientSearch)) return;
    if(checkConflict(newA.time,newA.serviceId,newA.staffId,null,newA.date)) return;
    let cid = newA.clientId;
    if(!cid){const nc={id:Date.now(),name:newA.clientSearch,phone:"",visits:0,lastVisit:"Oggi",totalSpent:0,note:"",rating:0};setClients(p=>[...p,nc]);cid=nc.id;}
    setAppts(p=>[...p,{id:Date.now(),staffId:parseInt(newA.staffId),date:newA.date,time:newA.time,clientId:cid,serviceId:parseInt(newA.serviceId),status:"confermato",source:newA.source,note:newA.note}]);
    setDateView(newA.date); // porta l'agenda sul giorno scelto così il nuovo appuntamento è visibile
    setNewA({date:newA.date,time:"",clientSearch:"",clientId:null,serviceId:1,staffId:1,note:"",source:"app"});
    setSuggest([]);setShowAdd(false);
  };

  const changeStatus = (id,status) => {setAppts(p=>p.map(a=>a.id===id?{...a,status}:a));setSelAppt(null);};

  const openSlots = SLOTS.filter(t=>{const m=toMin(t);return m>=toMin(hours.open)&&m<toMin(hours.close);});

  const exportCSV = () => {
    const rows = [["Data","Orario","Cliente","Servizio","Prezzo","Stato"]];
    appts.filter(a=>a.status!=="cancellato").forEach(a=>{const cl=getCl(a.clientId);const svc=getSvc(a.serviceId);rows.push([a.date,a.time,cl?.name||"?",svc.name,svc.price+"€",a.status]);});
    const csv = rows.map(r=>r.join(";")).join("\n");
    const b = new Blob([csv],{type:"text/csv"}); const u = URL.createObjectURL(b);
    const el = document.createElement("a"); el.href=u; el.download="agenda.csv"; el.click(); URL.revokeObjectURL(u);
  };

  const MonthView = () => {
    const {y,m} = calMonth;
    const first = new Date(y,m,1).getDay(); const days = new Date(y,m+1,0).getDate();
    const cells = []; for(let i=0;i<first;i++) cells.push(null); for(let d=1;d<=days;d++) cells.push(d);
    const apptsByDay = {}; appts.filter(a=>a.status!=="cancellato").forEach(a=>{const dt=dateFromKey(a.date);if(dt.getFullYear()===y&&dt.getMonth()===m) apptsByDay[dt.getDate()]=(apptsByDay[dt.getDate()]||0)+1;});
    const tdy = startOfToday();
    return (
      <div style={{padding:"10px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <button onClick={()=>setCalMonth(p=>({...p,m:p.m===0?11:p.m-1,y:p.m===0?p.y-1:p.y}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:T.inkMid}}>{"<"}</button>
          <p style={{fontSize:15,fontWeight:700,color:T.ink,margin:0}}>{MONTHS[m]} {y}</p>
          <button onClick={()=>setCalMonth(p=>({...p,m:p.m===11?0:p.m+1,y:p.m===11?p.y+1:p.y}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:T.inkMid}}>{">"}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:5}}>
          {["D","L","M","M","G","V","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,fontWeight:700,color:T.inkSoft,padding:"3px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={i}/>;
            const isToday = d===tdy.getDate()&&m===tdy.getMonth()&&y===tdy.getFullYear(); const count = apptsByDay[d]||0;
            return (
              <div key={i} onClick={()=>{setDateView(dayKeyOf(new Date(y,m,d)));setView("giorno");}} style={{aspectRatio:"1",borderRadius:9,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",background:isToday?T.ink:T.white,border:`1px solid ${T.line}`}}>
                <span style={{fontSize:12,fontWeight:isToday?700:400,color:isToday?T.white:T.ink}}>{d}</span>
                {count>0 && <div style={{width:4,height:4,borderRadius:2,background:isToday?T.gold:T.green,marginTop:1}}/>}
              </div>
            );
          })}
        </div>
        <p style={{fontSize:11,color:T.inkSoft,textAlign:"center",marginTop:10}}>Tocca un giorno per l'agenda</p>
      </div>
    );
  };

  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 0",borderBottom:`1px solid ${T.line}`,position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
          <div><p style={{fontSize:11,color:T.inkSoft,margin:"0 0 1px"}}>Salon Elite</p><h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:0}}>Agenda</h1></div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <div style={{textAlign:"right"}}><p style={{fontSize:12,fontWeight:700,color:T.green,margin:0}}>{todayRev}€</p><p style={{fontSize:10,color:T.inkSoft,margin:0}}>{todayConf.length} appt.</p></div>
            <button onClick={()=>nav&&nav("pro_chats")} style={{width:32,height:32,borderRadius:8,background:T.brandBg,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.brandDeep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            </button>
            <button onClick={()=>setShowLM(true)} style={{width:32,height:32,borderRadius:8,background:T.amberBg,border:"none",cursor:"pointer",fontSize:16}}>⚡</button>
            <button onClick={()=>{setNewA(p=>({...p,date:(dateView==="ieri"?"oggi":dateView)}));setShowAdd(true);}} style={{width:32,height:32,borderRadius:8,background:T.ink,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}><IPlus/></button>
          </div>
        </div>
        <div className="clay-inset" style={{display:"flex",background:T.surface,borderRadius:13,padding:4,gap:2,marginBottom:9}}>
          {[["giorno","Giorno"],["mese","Mese"]].map(([v,l])=><button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:view===v?700:400,background:view===v?T.white:T.surface,color:view===v?T.ink:T.inkSoft,fontFamily:"inherit"}}>{l}</button>)}
        </div>
        {view==="giorno" && (
          <>
            <div style={{display:"flex",gap:5,marginBottom:8,overflowX:"auto",scrollbarWidth:"none",paddingBottom:2}} className="ba-noscroll">
              <button onClick={()=>setDateView("ieri")} style={{flexShrink:0,padding:"5px 12px",borderRadius:99,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:dateView==="ieri"?T.ink:T.surface,color:dateView==="ieri"?T.white:T.inkSoft,fontFamily:"inherit"}}>Ieri</button>
              {upcomingDays(21).map(d=>{
                const sel = dateView===d.key;
                return <button key={d.key} onClick={()=>setDateView(d.key)} style={{flexShrink:0,padding:"5px 12px",borderRadius:99,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:sel?T.ink:T.surface,color:sel?T.white:T.inkSoft,fontFamily:"inherit"}}>{d.label==="Oggi"||d.label==="Domani"?d.label:`${d.label} ${d.num}`}</button>;
              })}
            </div>
            <div style={{display:"flex",gap:5,overflowX:"auto",scrollbarWidth:"none",paddingBottom:10}}>
              <button onClick={()=>setSelS(0)} style={{flexShrink:0,padding:"5px 11px",borderRadius:99,border:`1.5px solid ${selStaff===0?T.ink:T.line}`,background:selStaff===0?T.ink:T.white,color:selStaff===0?T.white:T.inkMid,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>Tutti</button>
              {staff.map(s=><button key={s.id} onClick={()=>setSelS(selStaff===s.id?0:s.id)} style={{flexShrink:0,padding:"5px 11px",borderRadius:99,border:`1.5px solid ${selStaff===s.id?T.ink:T.line}`,background:selStaff===s.id?T.ink:T.white,color:selStaff===s.id?T.white:T.inkMid,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>{s.emoji} {s.name.split(" ")[0]}</button>)}
              <button onClick={exportCSV} style={{flexShrink:0,marginLeft:"auto",padding:"5px 10px",borderRadius:99,border:`1.5px solid ${T.line}`,background:T.white,color:T.inkSoft,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>CSV</button>
            </div>
          </>
        )}
      </div>

      {view==="mese" && <MonthView/>}

      {view==="giorno" && (
        <div style={{padding:"10px 14px"}}>
          {openSlots.map(slot=>{
            const appt = slotMap[slot];
            const s = appt?ST[appt.status]:null;
            const cl = appt?getCl(appt.clientId):null;
            const svc = appt?getSvc(appt.serviceId):null;
            const mem = appt?getSt(appt.staffId):null;
            const clName = appt?._clientName||cl?.name||"?";
            return (
              <div key={slot} style={{display:"flex",gap:8,marginBottom:3,alignItems:"flex-start"}}>
                <div style={{width:38,textAlign:"right",paddingTop:11,flexShrink:0}}>
                  <span style={{fontSize:11,color:appt?T.inkMid:"#D1D5DB",fontWeight:appt?600:400}}>{slot}</span>
                </div>
                {appt ? (
                  <div onClick={()=>setSelAppt(selAppt===appt.id?null:appt.id)} className="clay" style={{flex:1,background:T.white,borderRadius:20,overflow:"hidden",cursor:"pointer",marginBottom:3}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 11px"}}>
                      <div style={{width:4,height:34,borderRadius:2,background:s?.bar,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:14,fontWeight:700,color:appt.status==="cancellato"?T.inkSoft:T.ink,margin:"0 0 1px",textDecoration:appt.status==="cancellato"?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clName}</p>
                        <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{svc?.name} - {svc?.min} min</p>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:"0 0 2px"}}>{svc?.price}€</p>
                        <Pill label={s?.label} style={{background:s?.bg,color:s?.text,fontSize:10}}/>
                      </div>
                    </div>
                    {selAppt===appt.id && (
                      <div style={{borderTop:`1px solid ${T.line}`,padding:"10px 12px",background:"#FAFAFA"}}>
                        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:7}}>
                          {cl?.phone && <span style={{fontSize:11,color:T.inkMid}}>{cl.phone}</span>}
                          <span style={{fontSize:11,color:T.inkMid}}>{mem?.emoji} {mem?.name}</span>
                          <Pill label={srcLabel(appt.source)} style={{background:T.surface,color:T.inkSoft,border:`1px solid ${T.line}`}}/>
                        </div>
                        {appt.note && <div style={{padding:"6px 9px",background:T.amberBg,borderRadius:7,marginBottom:7}}><p style={{fontSize:11,color:T.amber,margin:0}}>{appt.note}</p></div>}
                        {cl?.note && <div style={{padding:"6px 9px",background:T.purpleBg,borderRadius:7,marginBottom:7}}><p style={{fontSize:11,color:T.purple,margin:0}}>{cl.note}</p></div>}
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {appt.status==="in attesa" && <button onClick={()=>changeStatus(appt.id,"confermato")} style={{padding:"6px 11px",borderRadius:8,border:"none",background:T.green,color:T.white,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Conferma</button>}
                          {appt.status==="confermato" && <button onClick={()=>changeStatus(appt.id,"completato")} style={{padding:"6px 11px",borderRadius:8,border:"none",background:T.blue,color:T.white,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Completato</button>}
                          {appt.status!=="cancellato" && <button onClick={()=>changeStatus(appt.id,"cancellato")} style={{padding:"6px 11px",borderRadius:8,border:`1.5px solid ${T.redBg}`,background:T.redBg,color:T.red,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>Cancella</button>}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  slot.endsWith(":00") && (
                    <div onClick={()=>{setNewA(p=>({...p,time:slot,date:(dateView==="ieri"?"oggi":dateView)}));setShowAdd(true);}} style={{flex:1,borderRadius:9,border:`1.5px dashed ${T.line}`,padding:"8px 11px",cursor:"pointer",marginBottom:3}}>
                      <p style={{fontSize:10,color:T.line,margin:0}}>+ aggiungi</p>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Nuovo appuntamento" onClose={()=>{setShowAdd(false);setSuggest([]);}}>
          <div style={{display:"flex",flexDirection:"column",gap:11}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Giorno</label>
              <button onClick={()=>setShowCal(true)} style={{width:"100%",boxSizing:"border-box",display:"flex",alignItems:"center",gap:10,padding:"11px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <span style={{flex:1,fontSize:14,fontWeight:600,color:T.ink}}>{fmtDayKey(newA.date)}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Orario</label>
              <select value={newA.time} onChange={e=>setNewA(p=>({...p,time:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",background:T.white}}>
                <option value="">Scegli orario</option>
                {openSlots.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Cliente</label>
              <input value={newA.clientId?clients.find(c=>c.id===newA.clientId)?.name||"":newA.clientSearch} onChange={e=>{if(newA.clientId)setNewA(p=>({...p,clientId:null,clientSearch:e.target.value}));else setNewA(p=>({...p,clientSearch:e.target.value}));searchCl(e.target.value);}} placeholder="Cerca o scrivi nome..." style={{width:"100%",padding:"10px 12px",borderRadius:9,boxSizing:"border-box",border:`1.5px solid ${newA.clientId?T.green:T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none"}}/>
              {suggest.length>0&&!newA.clientId && (
                <div style={{background:T.white,border:`1px solid ${T.line}`,borderRadius:9,marginTop:3,overflow:"hidden"}}>
                  {suggest.map((c,i)=><div key={c.id} onClick={()=>{setNewA(p=>({...p,clientId:c.id,clientSearch:""}));setSuggest([]);}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:i<suggest.length-1?`1px solid ${T.line}`:"none"}}><p style={{fontSize:13,fontWeight:600,color:T.ink,margin:"0 0 1px"}}>{c.name}</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>{c.phone||"No tel"} - {clientStats(c.id,appts,services).visits} visite</p></div>)}
                </div>
              )}
              {newA.clientId && <p style={{fontSize:10,color:T.green,margin:"3px 0 0",fontWeight:600}}>Cliente esistente</p>}
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Servizio</label>
              <select value={newA.serviceId} onChange={e=>setNewA(p=>({...p,serviceId:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",background:T.white}}>
                {services.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name} - {s.min} min - {s.price}€</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Professionista</label>
              <div style={{display:"flex",gap:6}}>
                {staff.map(s=><button key={s.id} onClick={()=>setNewA(p=>({...p,staffId:s.id}))} style={{flex:1,padding:"8px 0",borderRadius:8,border:`1.5px solid ${newA.staffId===s.id?T.ink:T.line}`,background:newA.staffId===s.id?T.ink:T.white,color:newA.staffId===s.id?T.white:T.inkMid,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",textAlign:"center"}}>{s.emoji}<br/><span style={{fontSize:10}}>{s.name.split(" ")[0]}</span></button>)}
              </div>
            </div>
            {newA.time&&newA.serviceId&&(()=>{
              const svc = getSvc(parseInt(newA.serviceId));
              const cf = checkConflict(newA.time,newA.serviceId,newA.staffId,null,newA.date);
              return <div style={{padding:"8px 10px",background:cf?T.redBg:T.blueBg,borderRadius:8}}><p style={{fontSize:11,color:cf?T.red:T.blue,margin:0,fontWeight:600}}>{cf?`Conflitto con ${getCl(cf.clientId)?.name||"?"} alle ${cf.time}`:`${newA.time} - ${toTime(toMin(newA.time)+svc.min)} - ${svc.min} min - ${svc.price}€`}</p></div>;
            })()}
            <div style={{display:"flex",gap:7}}>
              <Btn label="Annulla" onClick={()=>{setShowAdd(false);setSuggest([]);}} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
              <button onClick={addAppt} disabled={!newA.time||(!newA.clientId&&!newA.clientSearch)||!!checkConflict(newA.time,newA.serviceId,newA.staffId,null,newA.date)} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,cursor:"pointer",fontSize:14,fontWeight:600,color:T.white,fontFamily:"inherit",opacity:(!newA.time||(!newA.clientId&&!newA.clientSearch)||!!checkConflict(newA.time,newA.serviceId,newA.staffId,null,newA.date))?.4:1}}>Aggiungi</button>
            </div>
          </div>
        </Modal>
      )}

      {showCal && (
        <DayPickerSheet value={newA.date} onPick={(k)=>setNewA(p=>({...p,date:k}))} onClose={()=>setShowCal(false)}/>
      )}

      {showLM && (
        <Modal title="Notifica last-minute" onClose={()=>setShowLM(false)}>
          <p style={{fontSize:13,color:T.inkMid,marginBottom:12}}>Invia una push ai tuoi 340 follower.</p>
          <div style={{background:T.ink,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
            <p style={{color:T.gold,fontSize:10,fontWeight:700,margin:"0 0 3px",textTransform:"uppercase"}}>Salon Elite</p>
            <p style={{color:T.white,fontSize:14,fontWeight:600,margin:"0 0 2px"}}>Slot libero oggi!</p>
            <p style={{color:"rgba(255,255,255,.6)",fontSize:12,margin:0}}>Prenota ora</p>
          </div>
          <BigBtn label="Invia notifica" onClick={()=>{alert("Inviata a 340 follower!");setShowLM(false);}}/>
        </Modal>
      )}
    </div>
  );
}

/* PRO - CLIENTI */
// Statistiche cliente derivate SEMPRE dagli appuntamenti reali (così visite, speso,
// ultima visita e storico sono coerenti tra loro e si aggiornano da soli).
function clientStats(clientId, appts, services){
  const priceOf = id => (services.find(s=>s.id===id)||{price:0}).price;
  const mine = appts.filter(a=>a.clientId===clientId);
  const done = mine.filter(a=>a.status==="completato");
  const upcoming = mine.filter(a=>a.status==="confermato"||a.status==="in attesa");
  const spent = done.reduce((s,a)=>s+priceOf(a.serviceId),0);
  let lastKey=null,lastD=null;
  done.forEach(a=>{ const d=dateFromKey(a.date); if(!lastD||d>lastD){lastD=d;lastKey=a.date;} });
  // storico ordinato dal più recente
  const history = [...mine].sort((a,b)=>dateFromKey(b.date)-dateFromKey(a.date));
  return {visits:done.length, spent, upcoming:upcoming.length, lastKey, history};
}

function ProClienti({clients,setClients,appts,services,nav,openAdd,onConsumeAdd,onModalOpenChange}) {
  const [q,setQ] = useState("");
  const [showAdd,setShowAdd] = useState(false);
  const [newC,setNewC] = useState({name:"",phone:"",email:"",birth:"",note:""});
  useEffect(()=>{ if(openAdd==="client"){ setShowAdd(true); onConsumeAdd&&onConsumeAdd(); } },[openAdd]);
  useEffect(()=>{ onModalOpenChange&&onModalOpenChange(showAdd); return ()=>onModalOpenChange&&onModalOpenChange(false); },[showAdd]);
  const saveClient = () => {
    if(!newC.name.trim()) return;
    setClients(p=>[{id:Date.now(),name:newC.name.trim(),phone:newC.phone.trim(),email:newC.email.trim(),birth:newC.birth,note:newC.note.trim(),visits:0,lastVisit:"Mai",totalSpent:0,rating:0},...p]);
    setNewC({name:"",phone:"",email:"",birth:"",note:""}); setShowAdd(false);
  };
  const list = clients.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.phone?.includes(q));
  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 12px",borderBottom:`1px solid ${T.line}`,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:0}}>Clienti</h1>
          <button onClick={()=>setShowAdd(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 13px",borderRadius:99,border:"none",background:T.brand,color:"#fff",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}><IPlus/>Nuovo</button>
        </div>
        <div className="clay-inset" style={{display:"flex",alignItems:"center",gap:8,background:T.white,borderRadius:15,padding:"10px 13px"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca..." style={{flex:1,border:"none",outline:"none",background:"none",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
        </div>
      </div>
      <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {list.map(c => {
          const st = clientStats(c.id, appts, services);
          return (
          <div key={c.id} onClick={()=>nav("pro_cliente",c)} className="clay ba-lift" style={{background:T.white,borderRadius:20,padding:"13px 15px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:T.white,flexShrink:0,boxShadow:"inset 2px 2px 4px rgba(255,255,255,.35), inset -2px -3px 5px rgba(180,83,9,.35)"}}>{c.name[0]}</div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:14,fontWeight:600,color:T.ink,margin:"0 0 2px"}}>{c.name}</p>
              <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 4px"}}>{c.phone||"No telefono"} · {st.lastKey?`ultima ${fmtDayKey(st.lastKey)}`:"mai venuto"}</p>
              <div style={{display:"flex",gap:5}}><Pill label={`${st.visits} visite`} style={{background:T.surface,color:T.inkMid}}/><Pill label={`${st.spent}€`} style={{background:T.greenBg,color:T.green,fontWeight:700}}/>{st.upcoming>0&&<Pill label={`${st.upcoming} in arrivo`} style={{background:T.blueBg,color:T.blue,fontWeight:700}}/>}</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.line} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
          );
        })}
      </div>

      {showAdd && (
        <Modal title="Nuovo cliente" onClose={()=>setShowAdd(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            {[{k:"name",l:"Nome e cognome",ph:"Mario Rossi"},{k:"phone",l:"Telefono",t:"tel",ph:"333 1234567"},{k:"email",l:"Email",t:"email",ph:"mario@email.it"},{k:"birth",l:"Data di nascita",t:"date"}].map(f=>(
              <div key={f.k}><label style={{fontSize:11,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>{f.l}</label><input type={f.t||"text"} placeholder={f.ph||""} value={newC[f.k]} onChange={e=>setNewC(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"11px 13px",borderRadius:10,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
            ))}
            <div><label style={{fontSize:11,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Note private</label><textarea value={newC.note} onChange={e=>setNewC(p=>({...p,note:e.target.value}))} placeholder="Preferenze, allergie, dettagli..." style={{width:"100%",padding:"11px 13px",borderRadius:10,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",resize:"none",minHeight:64,boxSizing:"border-box",lineHeight:1.4}}/></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Annulla" onClick={()=>setShowAdd(false)} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
            <button onClick={saveClient} disabled={!newC.name.trim()} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:!newC.name.trim()?.4:1}}>Salva cliente</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* PRO - SCHEDA CLIENTE */
function ProCliente({client,setClients,appts,services,nav}) {
  const [note,setNote] = useState(client.note||"");
  const [editing,setEditing] = useState(false);
  const getSvc = id => services.find(s=>s.id===id)||{name:"?",price:0};
  const st = clientStats(client.id, appts, services);
  const cAppts = st.history;
  const saveNote = () => {setClients(p=>p.map(c=>c.id===client.id?{...c,note}:c));setEditing(false);};
  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"48px 16px 14px",borderBottom:`1px solid ${T.line}`}}>
        <BackBtn onClick={()=>nav("pro_clienti")}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10}}>
          <div style={{width:54,height:54,borderRadius:"50%",background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:T.white,boxShadow:"inset 2px 2px 4px rgba(255,255,255,.35), inset -2px -3px 5px rgba(180,83,9,.35)"}}>{client.name[0]}</div>
          <div><h1 style={{fontSize:19,fontWeight:900,color:T.ink,margin:"0 0 2px"}}>{client.name}</h1><p style={{fontSize:12,color:T.inkSoft,margin:0}}>{client.phone||"Nessun telefono"}</p></div>
        </div>
      </div>
      <div style={{padding:"12px 14px",display:"flex",gap:10}}>
        {[[st.visits,"Visite"],[`${st.spent}€`,"Speso"],[st.lastKey?fmtDayKey(st.lastKey):"Mai","Ultima"]].map(([v,l]) => (
          <div key={l} className="clay" style={{flex:1,background:T.white,borderRadius:18,padding:"12px 8px",textAlign:"center"}}>
            <p style={{fontSize:l==="Ultima"?11:16,fontWeight:700,color:T.ink,margin:"0 0 1px",lineHeight:1.2}}>{v}</p>
            <p style={{fontSize:9,color:T.inkSoft,margin:0}}>{l}</p>
          </div>
        ))}
      </div>
      <div className="clay" style={{margin:"0 14px 12px",background:T.white,borderRadius:20,padding:"14px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <p style={{fontSize:13,fontWeight:800,color:T.ink,margin:0}}>Note cliente</p>
          {editing
            ? <div style={{display:"flex",gap:5}}><Btn label="Annulla" onClick={()=>setEditing(false)} style={{fontSize:10,padding:"3px 8px"}}/><button onClick={saveNote} style={{padding:"3px 8px",borderRadius:7,border:"none",background:T.brand,color:T.white,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Salva</button></div>
            : <Btn label="Modifica" onClick={()=>setEditing(true)} style={{fontSize:10,padding:"3px 8px"}}/>
          }
        </div>
        {editing
          ? <textarea value={note} onChange={e=>setNote(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1.5px solid ${T.line}`,fontSize:13,color:T.ink,background:T.surface,resize:"none",outline:"none",fontFamily:"inherit",minHeight:64,boxSizing:"border-box",lineHeight:1.5}}/>
          : note ? <p style={{fontSize:13,color:T.ink,margin:0,lineHeight:1.6,padding:"7px 9px",background:T.amberBg,borderRadius:7}}>{note}</p> : <p style={{fontSize:12,color:T.inkSoft,margin:0,fontStyle:"italic"}}>Tocca Modifica per aggiungere.</p>
        }
      </div>
      <div className="clay" style={{margin:"0 14px 12px",background:T.white,borderRadius:20,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <p style={{fontSize:13,fontWeight:800,color:T.ink,margin:0}}>Storico</p>
          <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{st.visits} {st.visits===1?"visita":"visite"}{st.upcoming>0?` · ${st.upcoming} in arrivo`:""}</p>
        </div>
        {cAppts.length>0 ? cAppts.map((a,i)=>{const svc=getSvc(a.serviceId);const stt=ST[a.status]||{};return(
          <div key={a.id} style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",borderBottom:i<cAppts.length-1?`1px solid ${T.line}`:"none"}}>
            <div style={{width:8,height:8,borderRadius:4,background:stt.bar||"#ccc",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:13,color:T.ink,margin:"0 0 1px",fontWeight:500}}>{svc.name}</p>
              <p style={{fontSize:10,color:T.inkSoft,margin:0}}>{fmtDayKey(a.date)} · {a.time}</p>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <p style={{fontSize:13,fontWeight:700,color:a.status==="cancellato"?T.inkSoft:T.ink,margin:"0 0 2px",textDecoration:a.status==="cancellato"?"line-through":"none"}}>{svc.price}€</p>
              <Pill label={stt.label||a.status} style={{background:stt.bg,color:stt.text,fontSize:9}}/>
            </div>
          </div>);})
          : <p style={{fontSize:13,color:T.inkSoft,padding:"13px 14px",margin:0}}>Nessun appuntamento.</p>}
      </div>
      <div style={{padding:"0 14px",display:"flex",gap:7}}>
        <button onClick={()=>nav("pro_agenda")} className="clay-btn" style={{flex:1,padding:"14px 0",borderRadius:18,border:"none",background:T.brand,color:T.white,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>+ Prenota</button>
      </div>
    </div>
  );
}

/* PRO - SERVIZI + STAFF + ORARI */
function ProServizi({services,setServices,staff,setStaff,hours,setHours,openAdd,onConsumeAdd,onModalOpenChange}) {
  const [tab,setTab] = useState("servizi");
  const [showAddSvc,setShowAddSvc] = useState(false);
  const [newSvc,setNewSvc] = useState({name:"",price:"",min:""});
  const [editSvc,setEditSvc] = useState(null);
  const [editVals,setEditVals] = useState({name:"",price:"",min:""});
  useEffect(()=>{ if(openAdd==="service"){ setTab("servizi"); setShowAddSvc(true); onConsumeAdd&&onConsumeAdd(); } },[openAdd]);
  useEffect(()=>{ onModalOpenChange&&onModalOpenChange(showAddSvc); return ()=>onModalOpenChange&&onModalOpenChange(false); },[showAddSvc]);
  const startEdit = s => {setEditSvc(s.id);setEditVals({name:s.name,price:String(s.price),min:String(s.min)});};
  const saveEdit = s => {setServices(p=>p.map(x=>x.id===s.id?{...x,name:editVals.name,price:parseInt(editVals.price)||0,min:parseInt(editVals.min)||0}:x));setEditSvc(null);};
  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 12px",borderBottom:`1px solid ${T.line}`,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}>
          <h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:0}}>Gestione</h1>
          <button onClick={()=>tab==="servizi"?setShowAddSvc(true):null} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 11px",borderRadius:8,border:"none",background:T.brand,color:T.white,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}><IPlus/>Aggiungi</button>
        </div>
        <div className="clay-inset" style={{display:"flex",background:T.surface,borderRadius:13,padding:4,gap:2}}>
          {[["servizi","Servizi"],["staff","Staff"],["orari","Orari"]].map(([v,l])=><button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:tab===v?700:400,background:tab===v?T.white:T.surface,color:tab===v?T.ink:T.inkSoft,fontFamily:"inherit"}}>{l}</button>)}
        </div>
      </div>

      {tab==="servizi" && (
        <div style={{padding:"10px 14px"}}>
          {services.map(s => (
            <div key={s.id} className="clay" style={{background:T.white,borderRadius:20,marginBottom:14,overflow:"hidden",opacity:s.active?1:.55}}>
              {editSvc===s.id ? (
                <div style={{padding:"11px 13px",background:T.surface}}>
                  <div style={{marginBottom:7}}>
                    <label style={{fontSize:9,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.6}}>Nome</label>
                    <input value={editVals.name} onChange={e=>setEditVals(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"7px 9px",borderRadius:7,border:`1.5px solid ${T.line}`,fontSize:13,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div style={{display:"flex",gap:7,marginBottom:9}}>
                    <div style={{flex:1}}><label style={{fontSize:9,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.6}}>Prezzo</label><input value={editVals.price} onChange={e=>setEditVals(p=>({...p,price:e.target.value}))} type="number" style={{width:"100%",padding:"7px 9px",borderRadius:7,border:`1.5px solid ${T.line}`,fontSize:13,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                    <div style={{flex:1}}><label style={{fontSize:9,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.6}}>Durata (min)</label><input value={editVals.min} onChange={e=>setEditVals(p=>({...p,min:e.target.value}))} type="number" style={{width:"100%",padding:"7px 9px",borderRadius:7,border:`1.5px solid ${T.line}`,fontSize:13,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                  </div>
                  <div style={{display:"flex",gap:6}}><button onClick={()=>setEditSvc(null)} style={{flex:1,padding:"7px 0",borderRadius:7,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontSize:11,color:T.inkMid,fontFamily:"inherit"}}>Annulla</button><button onClick={()=>saveEdit(s)} style={{flex:2,padding:"7px 0",borderRadius:7,border:"none",background:T.brand,cursor:"pointer",fontSize:11,fontWeight:600,color:T.white,fontFamily:"inherit"}}>Salva</button></div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 13px"}}>
                  <div style={{flex:1}}><p style={{fontSize:14,fontWeight:600,color:T.ink,margin:"0 0 4px"}}>{s.name}</p><div style={{display:"flex",gap:5}}><Pill label={`${s.min} min`} style={{background:T.surface,color:T.inkMid}}/><Pill label={`${s.price}€`} style={{background:T.greenBg,color:T.green,fontWeight:700}}/></div></div>
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>startEdit(s)} style={{padding:"5px 10px",borderRadius:7,border:`1.5px solid ${T.line}`,background:T.surface,cursor:"pointer",fontSize:11,color:T.inkMid,fontFamily:"inherit"}}>Modifica</button>
                    <button onClick={()=>setServices(p=>p.map(x=>x.id===s.id?{...x,active:!x.active}:x))} style={{padding:"5px 10px",borderRadius:7,border:"none",background:s.active?T.surface:T.greenBg,cursor:"pointer",fontSize:11,fontWeight:600,color:s.active?T.inkSoft:T.green,fontFamily:"inherit"}}>{s.active?"On":"Off"}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="staff" && (
        <div style={{padding:"10px 14px"}}>
          {staff.map(s => (
            <div key={s.id} className="clay" style={{background:T.white,borderRadius:20,marginBottom:14,padding:"12px 13px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:T.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19}}>{s.emoji}</div>
                <div style={{flex:1}}><p style={{fontSize:14,fontWeight:600,color:T.ink,margin:"0 0 1px"}}>{s.name}</p><p style={{fontSize:11,color:T.inkSoft,margin:"0 0 2px"}}>{s.role}</p><p style={{fontSize:10,color:T.inkSoft,margin:0}}>{s.schedule}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==="orari" && (
        <div style={{padding:"10px 14px"}}>
          {DAYS.map((dayName,i) => {
            const isOpen = hours.days.includes(i);
            const dh = hours.perDay?.[i]||{open:hours.open,close:hours.close};
            return (
              <div key={i} className="clay" style={{background:T.white,borderRadius:20,marginBottom:14,overflow:"hidden",opacity:isOpen?1:.6}}>
                <div style={{display:"flex",alignItems:"center",gap:11,padding:"12px 14px"}}>
                  <button onClick={()=>setHours(p=>({...p,days:p.days.includes(i)?p.days.filter(x=>x!==i):[...p.days,i].sort()}))} style={{width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",background:isOpen?T.green:T.line,position:"relative",flexShrink:0}}>
                    <div style={{width:16,height:16,borderRadius:8,background:T.white,position:"absolute",top:3,left:isOpen?20:3,boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                  </button>
                  <span style={{fontSize:14,fontWeight:700,color:T.ink,flex:1}}>{dayName}</span>
                  {isOpen ? <span style={{fontSize:11,color:T.inkSoft}}>{dh.open} - {dh.close}</span> : <span style={{fontSize:11,color:T.inkSoft}}>Chiuso</span>}
                </div>
                {isOpen && (
                  <div style={{borderTop:`1px solid ${T.line}`,padding:"10px 14px",display:"flex",gap:9,background:T.surface}}>
                    <div style={{flex:1}}>
                      <label style={{fontSize:9,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.6}}>Apertura</label>
                      <input type="time" value={dh.open} onChange={e=>setHours(p=>({...p,perDay:{...(p.perDay||{}),[i]:{...dh,open:e.target.value}}}))} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1.5px solid ${T.line}`,fontSize:13,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.white}}/>
                    </div>
                    <div style={{flex:1}}>
                      <label style={{fontSize:9,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:.6}}>Chiusura</label>
                      <input type="time" value={dh.close} onChange={e=>setHours(p=>({...p,perDay:{...(p.perDay||{}),[i]:{...dh,close:e.target.value}}}))} style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1.5px solid ${T.line}`,fontSize:13,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.white}}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddSvc && (
        <Modal title="Nuovo servizio" onClose={()=>setShowAddSvc(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div><label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Nome</label><input value={newSvc.name} onChange={e=>setNewSvc(p=>({...p,name:e.target.value}))} placeholder="Es. Taglio uomo" style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
            <div style={{display:"flex",gap:9}}>
              <div style={{flex:1}}><label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Prezzo</label><input value={newSvc.price} onChange={e=>setNewSvc(p=>({...p,price:e.target.value}))} type="number" placeholder="25" style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
              <div style={{flex:1}}><label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>Min</label><input value={newSvc.min} onChange={e=>setNewSvc(p=>({...p,min:e.target.value}))} type="number" placeholder="30" style={{width:"100%",padding:"10px 12px",borderRadius:9,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
            </div>
          </div>
          <div style={{display:"flex",gap:7,marginTop:12}}>
            <Btn label="Annulla" onClick={()=>setShowAddSvc(false)} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
            <button onClick={()=>{if(!newSvc.name||!newSvc.price||!newSvc.min)return;setServices(p=>[...p,{id:Date.now(),name:newSvc.name,price:parseInt(newSvc.price),min:parseInt(newSvc.min),active:true}]);setNewSvc({name:"",price:"",min:""});setShowAddSvc(false);}} disabled={!newSvc.name||!newSvc.price||!newSvc.min} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,color:T.white,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:(!newSvc.name||!newSvc.price||!newSvc.min)?.4:1}}>Salva</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* PRO - STATISTICHE */
function ProStats({appts,clients,services,staff,onSwitch,nav}) {
  const getSvc = id => services.find(s=>s.id===id)||{name:"?",price:0};
  const todayA = appts.filter(a=>a.date==="oggi"&&a.status!=="cancellato");
  const todayRev = todayA.reduce((s,a)=>s+getSvc(a.serviceId).price,0);
  const allA = appts.filter(a=>a.status!=="cancellato");
  const monthRev = allA.reduce((s,a)=>s+getSvc(a.serviceId).price,0)+340;
  const svcCount = {}; allA.forEach(a=>{svcCount[a.serviceId]=(svcCount[a.serviceId]||0)+1;});
  const svcRanked = Object.entries(svcCount).map(([id,n])=>({svc:getSvc(parseInt(id)),n})).sort((a,b)=>b.n-a.n).slice(0,5);
  const maxN = svcRanked[0]?.n||1;
  return (
    <div style={{paddingBottom:90,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 14px",borderBottom:`1px solid ${T.line}`}}>
        <h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:"0 0 2px"}}>Statistiche</h1>
        <p style={{fontSize:11,color:T.inkSoft,margin:0}}>Salon Elite - giugno 2026</p>
      </div>
      <div style={{padding:"11px 14px",display:"flex",flexDirection:"column",gap:9}}>
        <div style={{background:T.amberBg,borderRadius:10,padding:"9px 12px"}}>
          <p style={{fontSize:11,color:T.amber,margin:0}}>Dati indicativi - non sostituiscono la contabilita</p>
        </div>
        {[["Oggi",[todayA.length,"Appuntamenti"],[`${todayRev}€`,"Incasso"]],["Questo mese",[allA.length+12,"Appuntamenti"],[`${monthRev}€`,"Incasso"]]].map(([title,...items]) => (
          <div key={title} className="clay" style={{background:T.white,borderRadius:22,overflow:"hidden"}}>
            <div style={{padding:"11px 16px"}}><p style={{fontSize:10,fontWeight:800,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.8,margin:0}}>{title}</p></div>
            <div style={{display:"flex"}}>
              {items.map(([v,l],i) => (
                <div key={l} style={{flex:1,textAlign:"center",padding:"13px 6px",borderRight:i===0?`1px solid ${T.line}`:"none"}}>
                  <p style={{fontSize:21,fontWeight:700,color:i===1?T.green:T.ink,margin:"0 0 1px"}}>{v}</p>
                  <p style={{fontSize:10,color:T.inkSoft,margin:0}}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="clay" style={{background:T.white,borderRadius:22,padding:"14px 16px"}}>
          <p style={{fontSize:10,fontWeight:800,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.8,margin:"0 0 10px"}}>Servizi piu richiesti</p>
          {svcRanked.map(({svc,n}) => (
            <div key={svc.name} style={{display:"flex",alignItems:"center",gap:9,marginBottom:8}}>
              <p style={{fontSize:12,color:T.ink,margin:0,flex:1,fontWeight:500}}>{svc.name}</p>
              <div style={{width:70,height:5,background:T.line,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:T.gold,width:`${(n/maxN)*100}%`,borderRadius:3}}/></div>
              <p style={{fontSize:11,fontWeight:700,color:T.inkMid,margin:0,minWidth:14,textAlign:"right"}}>{n}</p>
            </div>
          ))}
        </div>
        <div onClick={()=>nav("pro_piani")} style={{padding:"15px",borderRadius:20,background:T.brand,cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:"10px 12px 26px rgba(120,98,68,.40), inset 2px 2px 6px rgba(255,255,255,.22), inset -4px -5px 11px rgba(80,62,40,.32)"}}>
          <div style={{flex:1}}>
            <p style={{color:"rgba(255,255,255,.85)",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:.8,margin:"0 0 2px"}}>Beta gratuita</p>
            <p style={{color:T.white,fontSize:14,fontWeight:800,margin:0}}>{BETA_DAYS} giorni rimasti - Vedi i piani</p>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div className="clay" style={{padding:"15px",borderRadius:20,background:T.white}}>
          <p style={{fontSize:13,fontWeight:800,color:T.ink,margin:"0 0 3px"}}>Vuoi prenotare come cliente?</p>
          <p style={{fontSize:11,color:T.inkMid,margin:"0 0 10px"}}>Passa alla modalita cliente.</p>
          <BigBtn label="Passa a modalita Cliente" onClick={onSwitch} variant="ghost" style={{fontSize:12,padding:"10px 0"}}/>
        </div>
      </div>
    </div>
  );
}

/* PRO — ACCOUNT / PROFILO ATTIVITÀ */
function ProProfilo({user,onSwitch,onLogout,accent,setAccent,nav,photo:photoProp,onSavePhoto,onSaveAccount}) {
  const [photo,setPhoto] = useState(photoProp||(()=>{ try{return localStorage.getItem("ba-pro-photo")||"";}catch(e){return "";} })());
  useEffect(()=>{ if(photoProp) setPhoto(photoProp); },[photoProp]);
  const photoRef = useRef(null);
  const onPickPhoto = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value="";
    if(!f) return;
    const rd = new FileReader(); rd.onload = () => { setPhoto(rd.result); try{localStorage.setItem("ba-pro-photo",rd.result);}catch(e){} }; rd.readAsDataURL(f);
    if(onSavePhoto){ try{ await onSavePhoto(f); }catch(err){ /* bucket non pronto: resta la foto locale */ } }
  };
  const savedInfo = (()=>{ try{return JSON.parse(localStorage.getItem("ba-pro-info"))||null;}catch(e){return null;} })();
  const biz = user?.bizName || (savedInfo&&savedInfo.biz) || "La tua attività";
  const bizUser = user?.bizUsername || (savedInfo&&savedInfo.username) || "";
  const [edit,setEdit] = useState(false);
  const [tmp,setTmp] = useState({biz:biz,username:bizUser,cat:(savedInfo&&savedInfo.cat)||"Bellezza",city:(savedInfo&&savedInfo.city)||"",email:(savedInfo&&savedInfo.email)||"",phone:(savedInfo&&savedInfo.phone)||""});
  const saveInfo = () => {
    const clean = {...tmp, username:(tmp.username||"").toLowerCase().replace(/[^a-z0-9._]/g,"")};
    setTmp(clean);
    try{localStorage.setItem("ba-pro-info",JSON.stringify(clean));}catch(e){}
    onSaveAccount&&onSaveAccount({name:clean.biz,username:clean.username,phone:clean.phone,city:clean.city,scope:"business"});
    setEdit(false);
  };
  const [notif,setNotif] = useState(true);
  const [visible,setVisible] = useState(true);
  const [confirm,setConfirm] = useState(null);
  const plan = (()=>{ try{return localStorage.getItem("ba-pro-plan")||"Prova gratuita";}catch(e){return "Prova gratuita";} })();

  return (
    <div style={{paddingBottom:170,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 18px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <input ref={photoRef} type="file" accept="image/*" onChange={onPickPhoto} style={{display:"none"}}/>
          <div onClick={()=>photoRef.current&&photoRef.current.click()} style={{position:"relative",width:82,height:82,borderRadius:22,background:`linear-gradient(145deg,${T.brandBg},#fff)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 6px 20px ${T.brand}30`,overflow:"hidden",cursor:"pointer"}}>
            {photo
              ? <img src={photo} alt="attivita" onError={e=>{try{const loc=localStorage.getItem("ba-pro-photo");if(loc&&e.currentTarget.src!==loc)e.currentTarget.src=loc;}catch(x){}}} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0M9 20v-5h6v5"/></svg>}
            <div style={{position:"absolute",bottom:-1,right:-1,width:26,height:26,borderRadius:"50%",background:"#111",border:"2.5px solid #fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <h1 style={{fontSize:20,fontWeight:800,color:T.ink,margin:"0 0 2px",letterSpacing:"-.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tmp.biz||biz}</h1>
            {(tmp.username||bizUser) && <p style={{fontSize:12.5,color:T.inkSoft,margin:"0 0 2px",fontWeight:600}}>@{tmp.username||bizUser}</p>}
            <p style={{fontSize:12.5,color:T.inkMid,margin:0}}>{tmp.cat||"Bellezza"}{(tmp.city)?` · ${tmp.city}`:""}</p>
          </div>
        </div>
      </div>

      <div style={{padding:"14px 16px"}}>
        <p style={{fontSize:12,fontWeight:800,color:T.inkSoft,textTransform:"uppercase",letterSpacing:1,margin:"6px 0 10px 4px"}}>Gestione attivita</p>
        <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
          {[
            {ic:"🛍️",t:"Servizi",s:"Nome, prezzo, durata, categoria",go:()=>nav("pro_servizi")},
            {ic:"🕒",t:"Orari & Ferie",s:"Giorni e fasce di apertura",go:()=>nav("pro_servizi")},
            {ic:"👥",t:"Dipendenti",s:"Staff e agende separate",go:()=>nav("pro_servizi")},
            {ic:"💎",t:"Il tuo piano",s:"Abbonamento e fatturazione",go:()=>nav("pro_piani")},
          ].map((r,i,arr)=>(
            <button key={i} onClick={r.go} style={{width:"100%",display:"flex",alignItems:"center",gap:13,padding:"13px 16px",border:"none",borderBottom:i<arr.length-1?`1px solid ${T.line}`:"none",background:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
              <span style={{fontSize:20,width:26,textAlign:"center"}}>{r.ic}</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14.5,fontWeight:700,color:T.ink,margin:0}}>{r.t}</p>
                <p style={{fontSize:11.5,color:T.inkSoft,margin:0}}>{r.s}</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          ))}
        </div>

        <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:`1px solid ${T.line}`}}>
            <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>Dati attivita</p>
            {edit
              ? <div style={{display:"flex",gap:6}}><Btn label="Annulla" onClick={()=>setEdit(false)} style={{fontSize:11,padding:"4px 10px"}}/><button onClick={saveInfo} style={{padding:"4px 12px",borderRadius:8,border:"none",background:T.brand,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Salva</button></div>
              : <Btn label="Modifica" onClick={()=>setEdit(true)} style={{fontSize:11,padding:"4px 10px"}}/>}
          </div>
          {edit ? (
            <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
              {[{k:"biz",l:"Nome attivita",ph:"Es. Salon Elite"},{k:"username",l:"Username (@ID pubblico)",ph:"es. salonelite"},{k:"cat",l:"Categoria",ph:"Es. Parrucchiere"},{k:"city",l:"Citta",ph:"Es. Milano"},{k:"email",l:"Email",t:"email",ph:"info@tuosalone.com"},{k:"phone",l:"Telefono",t:"tel",ph:"333 1234567"}].map(f=>(
                <div key={f.k}><label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>{f.l}</label>
                  {f.k==="city"
                    ? <CityPicker value={tmp.city} onChange={v=>setTmp(p=>({...p,city:v}))}/>
                    : <input type={f.t||"text"} placeholder={f.ph} value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"9px 11px",borderRadius:8,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>}
                </div>
              ))}
            </div>
          ) : (
            <div>
              {[["Categoria",tmp.cat||"Non indicata"],["Citta",tmp.city||"Non indicata"],["Email",tmp.email||"Non indicata"],["Telefono",tmp.phone||"Non indicato"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 16px",borderBottom:`1px solid ${T.line}`}}>
                  <span style={{fontSize:13,color:T.inkSoft,minWidth:80}}>{k}</span><span style={{fontSize:13,color:T.ink}}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.line}`}}>
            <div><p style={{fontSize:14,fontWeight:600,color:T.ink,margin:0}}>Notifiche</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>Nuove prenotazioni e messaggi</p></div>
            <button onClick={()=>setNotif(v=>!v)} style={{width:46,height:27,borderRadius:99,border:"none",cursor:"pointer",padding:3,background:notif?T.grad:"#D8D8DC",display:"flex",justifyContent:notif?"flex-end":"flex-start",transition:"background .2s ease"}}><span style={{width:21,height:21,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/></button>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px"}}>
            <div><p style={{fontSize:14,fontWeight:600,color:T.ink,margin:0}}>Profilo visibile</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>Compari nelle ricerche e nella mappa</p></div>
            <button onClick={()=>setVisible(v=>!v)} style={{width:46,height:27,borderRadius:99,border:"none",cursor:"pointer",padding:3,background:visible?T.grad:"#D8D8DC",display:"flex",justifyContent:visible?"flex-end":"flex-start",transition:"background .2s ease"}}><span style={{width:21,height:21,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/></button>
          </div>
        </div>

        <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
          <button onClick={()=>setConfirm({title:"Passare a modalita Cliente?",message:"Potrai cercare e prenotare come cliente.",confirmLabel:"Passa a Cliente",onYes:onSwitch})} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"15px 16px",border:"none",borderBottom:`1px solid ${T.line}`,background:"none",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{fontSize:14,fontWeight:600,color:T.ink}}>Passa a modalita Cliente</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button onClick={()=>setConfirm({title:"Uscire dall'account?",message:"Dovrai effettuare di nuovo l'accesso.",confirmLabel:"Esci",danger:true,onYes:onLogout})} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"15px 16px",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B5503A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            <span style={{fontSize:14,fontWeight:700,color:"#B5503A"}}>Esci dall'account</span>
          </button>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} danger={confirm.danger}
          onConfirm={()=>{confirm.onYes&&confirm.onYes();setConfirm(null);}} onCancel={()=>setConfirm(null)}/>
      )}
    </div>
  );
}

/* BETA */
const BETA_END = new Date(2026,8,14);
const TODAY_DEMO = new Date(2026,5,14);
const BETA_DAYS_LEFT = Math.ceil((BETA_END-TODAY_DEMO)/(1000*60*60*24));

function BetaBanner({nav}) {
  const filled = Math.max(0,Math.min(100,Math.round((1-BETA_DAYS_LEFT/90)*100)));
  return (
    <div onClick={()=>nav("pro_piani")} style={{margin:"12px 14px 100px",background:T.ink,borderRadius:14,padding:"13px 14px",cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div><p style={{color:T.gold,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,margin:"0 0 2px"}}>Beta gratuita</p><p style={{color:T.white,fontSize:13,fontWeight:600,margin:0}}>Accesso completo - Gratis fino al 14 set 2026</p></div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}><p style={{color:T.gold,fontSize:20,fontWeight:700,margin:0}}>{BETA_DAYS_LEFT}</p><p style={{color:"rgba(255,255,255,.5)",fontSize:9,margin:0}}>giorni</p></div>
      </div>
      <div style={{height:4,background:"rgba(255,255,255,.15)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:T.gold,width:`${filled}%`,borderRadius:2}}/></div>
      <p style={{color:"rgba(255,255,255,.4)",fontSize:10,margin:"6px 0 0"}}>Tocca per vedere i piani</p>
    </div>
  );
}

function PianiScreen({nav}) {
  const PIANI = [
    {id:"base",name:"Base",price:"12,90",color:T.ink,textColor:T.white,tag:"Dal 14 settembre 2026",desc:"Per chi inizia",features:["Profilo attivita","Prenotazioni illimitate","Agenda e clienti","Statistiche base","Link prenotazione"],locked:[]},
    {id:"pro",name:"Pro",price:"29",color:"#1a1a2e",textColor:T.white,tag:"Prossimamente",desc:"Per saloni con staff",features:["Tutto di Base","Staff illimitato","Statistiche avanzate","Notifiche push","Promemoria SMS"],locked:["Notifiche push","Promemoria SMS"]},
    {id:"premium",name:"Premium",price:"59",color:T.purple,textColor:T.white,tag:"Prossimamente",desc:"Massima visibilita",features:["Tutto di Pro","Posizione prioritaria","Pagamenti online","Supporto prioritario"],locked:["Pagamenti online","Posizione prioritaria"]},
  ];
  return (
    <div style={{paddingBottom:40,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.ink,padding:"50px 18px 24px"}}>
        <button onClick={()=>nav("pro_stats")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.6)",fontSize:13,padding:"0 0 14px 0",fontFamily:"inherit"}}>Indietro</button>
        <div style={{textAlign:"center"}}>
          <p style={{color:T.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,margin:"0 0 6px"}}>Beta gratuita attiva</p>
          <h1 style={{color:T.white,fontSize:22,fontWeight:700,margin:"0 0 8px"}}>Accesso completo gratuito</h1>
          <p style={{color:"rgba(255,255,255,.55)",fontSize:13,margin:"0 0 18px"}}>{BETA_DAYS_LEFT} giorni rimasti - Scadenza 14 settembre 2026</p>
        </div>
      </div>
      <div style={{padding:"14px 14px"}}>
        <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.8,marginBottom:12,textAlign:"center"}}>Piani disponibili dal 14 settembre</p>
        {PIANI.map((p,idx) => (
          <div key={p.id} className="clay" style={{background:T.white,borderRadius:20,marginBottom:14,overflow:"hidden"}}>
            <div style={{background:p.color,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div><Pill label={p.tag} style={{background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.8)",fontSize:10,marginBottom:6}}/><p style={{color:p.textColor,fontSize:18,fontWeight:700,margin:"0 0 2px"}}>{p.name}</p><p style={{color:"rgba(255,255,255,.6)",fontSize:12,margin:0}}>{p.desc}</p></div>
                <div style={{textAlign:"right"}}><p style={{color:p.textColor,fontSize:26,fontWeight:700,margin:0}}>€{p.price}</p><p style={{color:"rgba(255,255,255,.5)",fontSize:10,margin:0}}>al mese</p></div>
              </div>
            </div>
            <div style={{padding:"12px 14px"}}>
              {p.features.map(f => {
                const isLocked = p.locked.includes(f);
                return (
                  <div key={f} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,opacity:isLocked?.5:1}}>
                    <div style={{width:15,height:15,borderRadius:8,background:isLocked?T.line:T.greenBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {isLocked
                        ? <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        : <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>}
                    </div>
                    <span style={{fontSize:12,color:isLocked?T.inkSoft:T.ink}}>{f}{isLocked?" (Prossimamente)":""}</span>
                  </div>
                );
              })}
              {idx===0
                ? <div style={{marginTop:10,padding:"10px 0",borderRadius:9,background:T.greenBg,textAlign:"center"}}><p style={{fontSize:12,fontWeight:700,color:T.green,margin:0}}>Attivo durante la beta</p></div>
                : <div style={{marginTop:10,padding:"10px 0",borderRadius:9,background:T.surface,textAlign:"center",border:`1px dashed ${T.line}`}}><p style={{fontSize:11,color:T.inkSoft,margin:0}}>Disponibile dal 14 settembre 2026</p></div>}
            </div>
          </div>
        ))}
        <div style={{padding:"13px",borderRadius:12,background:T.goldBg,border:`1px solid ${T.gold}44`}}>
          <p style={{fontSize:13,fontWeight:700,color:T.amber,margin:"0 0 4px"}}>Una parola da Alessio</p>
          <p style={{fontSize:12,color:T.ink,margin:0,lineHeight:1.7}}>Sono di Imperia e questa app e pensata per i professionisti della mia zona. I primi 3 mesi sono completamente gratis. Aiutami a migliorarla con il tuo feedback.</p>
        </div>
      </div>
    </div>
  );
}

/* ============ CHAT / DM stile Vinted ============ */

/* Lista conversazioni */
function ChatList({conversations,role,nav,unreadFor}) {
  const sorted = [...conversations];
  return (
    <div style={{paddingBottom:110,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"54px 20px 16px",borderBottom:`1px solid ${T.line}`}}>
        <h1 style={{fontSize:26,fontWeight:800,color:T.ink,margin:0,letterSpacing:"-.02em"}}>Messaggi</h1>
        <p style={{fontSize:13,color:T.inkMid,margin:"2px 0 0"}}>Accordi su misura e prenotazioni</p>
      </div>
      {sorted.length===0 ? (
        <div style={{textAlign:"center",padding:"80px 30px"}}>
          <div style={{fontSize:46,marginBottom:14}}>💬</div>
          <p style={{fontSize:16,fontWeight:700,color:T.ink,marginBottom:6}}>Nessun messaggio</p>
          <p style={{fontSize:13,color:T.inkSoft,lineHeight:1.6}}>{role==="client"?"Apri il profilo di un professionista e tocca \"Messaggio\" per accordarti su un lavoro su misura.":"Qui vedrai le richieste dei clienti per lavori personalizzati."}</p>
        </div>
      ) : (
        <div style={{padding:"10px 14px"}}>
          {sorted.map(c => {
            const pro = ALL_PROS.find(p=>p.id===c.proId)||ALL_PROS[0];
            const last = c.messages[c.messages.length-1];
            const preview = last.type==="request"?`📅 Richiesta: ${last.request.service} · ${last.request.dateLabel} ${last.request.time}`:last.type==="offer"?`💼 Offerta: ${last.offer.service} · ${last.offer.price}€`:last.type==="photo"?(last.text||"📷 Foto"):last.type==="video"?"🎬 Video":last.type==="location"?"📍 Posizione":last.text;
            const name = role==="client"?pro.name:c.clientName;
            const unread = unreadFor ? unreadFor(c) : 0;
            return (
              <div key={c.id} onClick={()=>nav("chat",{convId:c.id,role})} className="ba-lift clay" style={{display:"flex",alignItems:"center",gap:12,padding:"13px 15px",cursor:"pointer",background:unread>0?T.brandBg:T.white,borderRadius:20,marginBottom:12}}>
                <div className="clay-soft" style={{width:50,height:50,borderRadius:"50%",background:`${pro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{role==="client"?pro.emoji:"🧑"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:14,fontWeight:unread>0?800:700,color:T.ink,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p>
                  <p style={{fontSize:12,color:unread>0?T.ink:T.inkSoft,fontWeight:unread>0?700:400,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview}</p>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                  <span style={{fontSize:11,color:T.inkSoft}}>{last.time}</span>
                  {unread>0 && <span style={{minWidth:19,height:19,padding:"0 5px",borderRadius:99,background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",boxSizing:"border-box"}}>{unread>9?"9+":unread}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Costruisce l'elenco notifiche: attività dei professionisti verso il cliente */
function buildNotifs(conversations){
  const out=[];
  (conversations||[]).forEach(c=>{
    const pro=ALL_PROS.find(p=>p.id===c.proId)||ALL_PROS[0];
    c.messages.forEach(m=>{
      if(m.from!=="pro") return;
      let type="message",text=m.text||"Nuovo messaggio",icon="💬";
      if(m.type==="offer"){ type="offer"; icon="💼"; text=`Ti ha inviato un'offerta · ${m.offer.service} ${m.offer.price}€`; }
      else if(m.type==="photo"){ type="photo"; icon="📷"; text="Ti ha inviato una foto"; }
      out.push({id:m.id,convId:c.id,proId:c.proId,proName:pro.name,proEmoji:pro.emoji,accent:pro.accent,type,text,icon,time:m.time});
    });
  });
  out.sort((a,b)=>b.id-a.id);
  return out;
}

/* Schermata Notifiche — activity feed stile Instagram */
function NotificheScreen({conversations,nav,notifSeenId,onOpen,likeNotifs=[],likeSeenTs=0}){
  const timeAgo=(ms)=>{ if(!ms)return""; const s=Math.floor((Date.now()-ms)/1000); if(s<60)return "ora"; const m=Math.floor(s/60); if(m<60)return m+"m"; const h=Math.floor(m/60); if(h<24)return h+"h"; const d=Math.floor(h/24); return d+"g"; };
  // Unisci notifiche chat (dai professionisti) + like/commenti sui tuoi post, ordinate nel tempo
  const items=[
    ...buildNotifs(conversations).map(n=>({key:"c"+n.id,sort:n.id,kind:"conv",data:n,isNew:n.id>notifSeenId})),
    ...(likeNotifs||[]).map(n=>({key:"l"+n.id,sort:n.time||0,kind:"like",data:n,isNew:(n.time||0)>likeSeenTs})),
  ].sort((a,b)=>b.sort-a.sort);
  useEffect(()=>{ if(onOpen) onOpen(); },[]); // segna tutto come letto all'apertura
  const notifs=items;
  return (
    <div style={{paddingBottom:110,background:"transparent",minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"54px 20px 16px",borderBottom:`1px solid ${T.line}`,display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>nav("cl_home")} style={{width:34,height:34,borderRadius:"50%",background:T.surface,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <h1 style={{fontSize:22,fontWeight:800,color:T.ink,margin:0,letterSpacing:"-.02em"}}>Notifiche</h1>
      </div>
      {notifs.length===0 ? (
        <div style={{textAlign:"center",padding:"80px 30px"}}>
          <div style={{fontSize:46,marginBottom:14}}>🔔</div>
          <p style={{fontSize:16,fontWeight:700,color:T.ink,marginBottom:6}}>Nessuna notifica</p>
          <p style={{fontSize:13,color:T.inkSoft,lineHeight:1.6}}>Qui vedrai i messaggi e le offerte dei professionisti.</p>
        </div>
      ):(
        <div style={{padding:"8px 12px"}}>
          {notifs.map(item=>{
            const isNew = item.isNew;
            if(item.kind==="like"){
              const n=item.data;
              const isLike = n.type==="like";
              return (
                <div key={item.key} onClick={()=>nav("cl_profilo")} className="ba-lift" style={{display:"flex",alignItems:"center",gap:12,padding:"12px",cursor:"pointer",borderRadius:16,marginBottom:2,background:isNew?T.brandBg:"transparent"}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:48,height:48,borderRadius:"50%",background:"#F0F0F2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:T.ink}}>{(n.actor&&n.actor[0]&&n.actor[0].toUpperCase())||"🙂"}</div>
                    <div style={{position:"absolute",bottom:-2,right:-2,width:20,height:20,borderRadius:"50%",background:T.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,boxShadow:"0 1px 4px rgba(0,0,0,.15)"}}>{isLike?"❤️":"💬"}</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13.5,color:T.ink,margin:0,lineHeight:1.4}}><strong>{n.actor}</strong> {n.text} <span style={{color:T.inkSoft}}>· {timeAgo(n.time)}</span></p>
                  </div>
                  {n.postImg
                    ? <div style={{width:44,height:44,borderRadius:8,overflow:"hidden",flexShrink:0,background:"#F0F0F2"}}><img src={n.postImg} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
                    : (isNew && <span style={{width:9,height:9,borderRadius:"50%",background:T.brand,flexShrink:0}}/>)}
                </div>
              );
            }
            const n=item.data;
            return (
              <div key={item.key} onClick={()=>nav("chat",{convId:n.convId,role:"client"})} className="ba-lift" style={{display:"flex",alignItems:"center",gap:12,padding:"12px",cursor:"pointer",borderRadius:16,marginBottom:2,background:isNew?T.brandBg:"transparent"}}>
                <div style={{position:"relative",flexShrink:0}}>
                  <div style={{width:48,height:48,borderRadius:"50%",background:`${n.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:23}}>{n.proEmoji}</div>
                  <div style={{position:"absolute",bottom:-2,right:-2,width:20,height:20,borderRadius:"50%",background:T.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,boxShadow:"0 1px 4px rgba(0,0,0,.15)"}}>{n.icon}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:13.5,color:T.ink,margin:0,lineHeight:1.4}}><strong>{n.proName}</strong> {n.text}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:"2px 0 0"}}>{n.time}</p>
                </div>
                {isNew && <span style={{width:9,height:9,borderRadius:"50%",background:T.brand,flexShrink:0}}/>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Card offerta dentro la chat — stile Vinted */
function OfferCard({offer,msgFrom,role,proName,onAccept,onDecline,onEdit}) {
  const isMine = msgFrom===role;
  const st = offer.status || "pending";
  // Stato: pending 🟡 · accepted 🟢 · declined 🔴 · expired ⚪
  const STY = {
    pending:  {c:T.amber, bg:T.amberBg, dot:"🟡", label:"In attesa"},
    accepted: {c:T.green, bg:T.greenBg, dot:"🟢", label:"Accettata"},
    declined: {c:T.red,   bg:T.redBg,   dot:"🔴", label:"Rifiutata"},
    expired:  {c:T.inkSoft,bg:T.surface,dot:"⚪", label:"Scaduta"},
  };
  const S = STY[st] || STY.pending;
  const hasWhen = offer.date;

  return (
    <div style={{maxWidth:"88%",alignSelf:isMine?"flex-end":"flex-start",background:T.white,borderRadius:22,overflow:"hidden",margin:"4px 0",boxShadow:"0 6px 24px rgba(0,0,0,.09)",border:`1px solid ${T.line}`}}>
      {/* Barra colorata superiore */}
      <div style={{height:4,background:`linear-gradient(90deg,${T.brand},${T.blue||"#4A7BF7"})`}}/>
      {/* Header: etichetta + stato */}
      <div style={{padding:"11px 15px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:26,height:26,borderRadius:9,background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
          </div>
          <span style={{fontSize:10.5,fontWeight:800,color:T.inkMid,textTransform:"uppercase",letterSpacing:.6}}>Offerta</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,background:S.bg,padding:"4px 10px",borderRadius:99}}>
          <span style={{fontSize:9}}>{S.dot}</span>
          <span style={{fontSize:10.5,fontWeight:800,color:S.c}}>{S.label}</span>
        </div>
      </div>

      <div style={{padding:"10px 15px 14px"}}>
        {/* Nome servizio + prezzo grande */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:offer.description?4:10}}>
          <p style={{fontSize:16,fontWeight:800,color:T.ink,margin:0,letterSpacing:"-.02em",flex:1}}>{offer.service}</p>
          <p style={{fontSize:20,fontWeight:900,color:T.brand,margin:0,letterSpacing:"-.03em",whiteSpace:"nowrap"}}>{offer.price}€</p>
        </div>
        {offer.description && <p style={{fontSize:12.5,color:T.inkMid,margin:"0 0 10px",lineHeight:1.45}}>{offer.description}</p>}

        {/* Meta: durata · professionista · quando */}
        <div style={{display:"flex",gap:7,marginBottom:offer.note?10:12}}>
          <div style={{flex:1,background:T.surface,borderRadius:10,padding:"8px 6px",textAlign:"center"}}>
            <p style={{fontSize:8,color:T.inkSoft,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>Durata</p>
            <p style={{fontSize:12,fontWeight:800,color:T.ink,margin:0}}>{offer.min} min</p>
          </div>
          <div style={{flex:1.3,background:T.surface,borderRadius:10,padding:"8px 6px",textAlign:"center",minWidth:0}}>
            <p style={{fontSize:8,color:T.inkSoft,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>Professionista</p>
            <p style={{fontSize:12,fontWeight:800,color:T.ink,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{proName||"—"}</p>
          </div>
          {hasWhen && (
            <div style={{flex:1.1,background:T.brandBg,borderRadius:10,padding:"8px 6px",textAlign:"center"}}>
              <p style={{fontSize:8,color:T.brand,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>Quando</p>
              <p style={{fontSize:11,fontWeight:800,color:T.brandDeep,margin:0}}>{offer.date}{offer.slot?` · ${offer.slot}`:""}</p>
            </div>
          )}
        </div>

        {offer.note && (
          <div style={{background:T.amberBg,borderRadius:10,padding:"8px 11px",marginBottom:12,display:"flex",gap:7}}>
            <span style={{fontSize:12}}>📝</span>
            <p style={{fontSize:11.5,color:"#8A6D1E",margin:0,lineHeight:1.4}}>{offer.note}</p>
          </div>
        )}

        {/* Azioni cliente */}
        {st==="pending" && !isMine && (
          <div style={{display:"flex",gap:8}}>
            <button onClick={onDecline} style={{flex:1,padding:"12px 0",borderRadius:13,border:`1.5px solid ${T.line}`,background:T.white,color:T.inkMid,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",touchAction:"manipulation"}}>Rifiuta</button>
            <button onClick={onAccept} style={{flex:2,padding:"12px 0",borderRadius:13,border:"none",background:`linear-gradient(135deg,${T.brand},${T.brandDeep})`,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",touchAction:"manipulation",boxShadow:`0 4px 14px ${T.brand}55`}}>{hasWhen?"Accetta":"Accetta e scegli orario"}</button>
          </div>
        )}
        {/* Azioni pro sulla propria offerta in attesa */}
        {st==="pending" && isMine && role==="pro" && (
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={onEdit} style={{flex:1,padding:"11px 0",borderRadius:13,border:`1.5px solid ${T.line}`,background:T.white,color:T.ink,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>✏️ Modifica</button>
            <span style={{flex:1,fontSize:11.5,color:T.inkSoft,textAlign:"center",fontStyle:"italic"}}>In attesa di risposta…</span>
          </div>
        )}
        {st==="pending" && isMine && role!=="pro" && (
          <p style={{fontSize:12,color:T.inkSoft,margin:0,textAlign:"center",fontStyle:"italic"}}>In attesa di risposta…</p>
        )}
        {st==="accepted" && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"10px 0",background:T.greenBg,borderRadius:13}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            <span style={{fontSize:13.5,fontWeight:800,color:T.green}}>Prenotazione confermata</span>
          </div>
        )}
        {st==="declined" && <p style={{fontSize:13,fontWeight:800,color:T.red,margin:0,textAlign:"center"}}>Offerta rifiutata</p>}
        {st==="expired" && <p style={{fontSize:13,fontWeight:800,color:T.inkSoft,margin:0,textAlign:"center"}}>Offerta scaduta</p>}
      </div>
    </div>
  );
}

/* Card RICHIESTA DI PRENOTAZIONE — il cliente chiede, il pro Accetta/Rifiuta.
   Solo dopo Accetta l'appuntamento entra nell'agenda. */
function RequestCard({request,msgFrom,role,clientName,proName,onAccept,onDecline}) {
  const isMine = msgFrom===role; // true = l'ho mandata io (lato cliente)
  const st = request.status || "pending";
  const STY = {
    pending:  {c:T.amber, bg:T.amberBg, dot:"🟡", label:"Da confermare"},
    accepted: {c:T.green, bg:T.greenBg, dot:"🟢", label:"Confermata"},
    declined: {c:T.red,   bg:T.redBg,   dot:"🔴", label:"Rifiutata"},
  };
  const S = STY[st] || STY.pending;
  return (
    <div style={{maxWidth:"88%",alignSelf:isMine?"flex-end":"flex-start",background:T.white,borderRadius:22,overflow:"hidden",margin:"4px 0",boxShadow:"0 6px 24px rgba(0,0,0,.09)",border:`1px solid ${T.line}`}}>
      <div style={{height:4,background:`linear-gradient(90deg,${T.brand},${T.brandDeep})`}}/>
      <div style={{padding:"11px 15px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:26,height:26,borderRadius:9,background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <span style={{fontSize:10.5,fontWeight:800,color:T.inkMid,textTransform:"uppercase",letterSpacing:.6}}>Richiesta prenotazione</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,background:S.bg,padding:"4px 10px",borderRadius:99}}>
          <span style={{fontSize:9}}>{S.dot}</span>
          <span style={{fontSize:10.5,fontWeight:800,color:S.c}}>{S.label}</span>
        </div>
      </div>
      <div style={{padding:"10px 15px 14px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:10}}>
          <p style={{fontSize:16,fontWeight:800,color:T.ink,margin:0,letterSpacing:"-.02em",flex:1}}>{request.service}</p>
          <p style={{fontSize:20,fontWeight:900,color:T.brand,margin:0,letterSpacing:"-.03em",whiteSpace:"nowrap"}}>{request.price}€</p>
        </div>
        <div style={{display:"flex",gap:7,marginBottom:12}}>
          <div style={{flex:1.2,background:T.brandBg,borderRadius:10,padding:"8px 6px",textAlign:"center"}}>
            <p style={{fontSize:8,color:T.brand,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>Quando</p>
            <p style={{fontSize:11,fontWeight:800,color:T.brandDeep,margin:0}}>{request.dateLabel} · {request.time}</p>
          </div>
          <div style={{flex:1,background:T.surface,borderRadius:10,padding:"8px 6px",textAlign:"center"}}>
            <p style={{fontSize:8,color:T.inkSoft,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>Durata</p>
            <p style={{fontSize:12,fontWeight:800,color:T.ink,margin:0}}>{request.min} min</p>
          </div>
          <div style={{flex:1.3,background:T.surface,borderRadius:10,padding:"8px 6px",textAlign:"center",minWidth:0}}>
            <p style={{fontSize:8,color:T.inkSoft,margin:"0 0 2px",fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>Cliente</p>
            <p style={{fontSize:12,fontWeight:800,color:T.ink,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clientName||"—"}</p>
          </div>
        </div>
        {/* Azioni PRO: accetta/rifiuta la richiesta in attesa */}
        {st==="pending" && role==="pro" && (
          <div style={{display:"flex",gap:8}}>
            <button onClick={onDecline} style={{flex:1,padding:"12px 0",borderRadius:13,border:`1.5px solid ${T.line}`,background:T.white,color:T.inkMid,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",touchAction:"manipulation"}}>Rifiuta</button>
            <button onClick={onAccept} style={{flex:2,padding:"12px 0",borderRadius:13,border:"none",background:`linear-gradient(135deg,${T.brand},${T.brandDeep})`,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",touchAction:"manipulation",boxShadow:`0 4px 14px ${T.brand}55`}}>Accetta</button>
          </div>
        )}
        {st==="pending" && role!=="pro" && (
          <p style={{fontSize:12,color:T.inkSoft,margin:0,textAlign:"center",fontStyle:"italic"}}>In attesa di conferma dal professionista…</p>
        )}
        {st==="accepted" && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"10px 0",background:T.greenBg,borderRadius:13}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            <span style={{fontSize:13.5,fontWeight:800,color:T.green}}>{role==="pro"?"Aggiunta all'agenda":"Prenotazione confermata"}</span>
          </div>
        )}
        {st==="declined" && <p style={{fontSize:13,fontWeight:800,color:T.red,margin:0,textAlign:"center"}}>Richiesta rifiutata</p>}
      </div>
    </div>
  );
}

/* Bottom-sheet per il cliente: scelta giorno + orario disponibile */
function SlotPickerModal({offer,proId,isBooked,onClose,onConfirm}) {
  const [selDate,setSelDate] = useState("");
  const [selSlot,setSelSlot] = useState("");
  const DATE_OPTS = genDates(10);
  const TIME_OPTS = BOOKING_TIMES;
  const busy = (t)=> isBooked && selDate && isBooked(proId, selDate, t);
  const valid = selDate && selSlot;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(43,34,24,.45)",zIndex:400,display:"flex",alignItems:"flex-end",backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} className="ba-pop" style={{background:T.paper,borderRadius:"26px 26px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"18px 18px 32px",maxHeight:"90dvh",overflowY:"auto"}}>
        <div style={{width:40,height:4,borderRadius:99,background:T.line,margin:"0 auto 16px"}}/>
        <h2 style={{fontSize:19,fontWeight:800,color:T.ink,margin:"0 0 4px"}}>Scegli giorno e orario</h2>
        <p style={{fontSize:13,color:T.inkMid,margin:"0 0 18px"}}>{offer.service} · {offer.price}€ · {offer.min} min. Gli orari occupati sono barrati.</p>

        <label style={{fontSize:12,fontWeight:700,color:T.inkMid,display:"block",marginBottom:8}}>Giorno</label>
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",marginBottom:18,paddingBottom:2}}>
          {DATE_OPTS.map(d=>(
            <button key={d.label} onClick={()=>{setSelDate(d.label);setSelSlot("");}} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",padding:"9px 14px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",touchAction:"manipulation",background:selDate===d.label?T.brand:T.white,boxShadow:selDate===d.label?"none":`0 0 0 1.5px ${T.line} inset`}}>
              <span style={{fontSize:9,fontWeight:700,color:selDate===d.label?"rgba(255,255,255,.75)":T.inkSoft,marginBottom:2}}>{d.dayName}</span>
              <span style={{fontSize:16,fontWeight:800,color:selDate===d.label?"#fff":T.ink}}>{d.day}</span>
            </button>
          ))}
        </div>

        {selDate && <>
        <label style={{fontSize:12,fontWeight:700,color:T.inkMid,display:"block",marginBottom:8}}>Orario</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {TIME_OPTS.map(t=>{
            const isBusy = busy(t); const isSel = selSlot===t;
            return (
              <button key={t} disabled={isBusy} onClick={()=>!isBusy&&setSelSlot(t)} title={isBusy?"Occupato":""}
                style={{padding:"11px 16px",borderRadius:12,border:"none",cursor:isBusy?"not-allowed":"pointer",fontSize:16,fontWeight:700,fontFamily:"inherit",touchAction:"manipulation",
                  background:isBusy?T.surface:isSel?T.brand:T.white,color:isBusy?T.inkSoft:isSel?"#fff":T.inkMid,
                  textDecoration:isBusy?"line-through":"none",opacity:isBusy?.6:1,
                  boxShadow:isSel?"none":`0 0 0 1.5px ${T.line} inset`}}>{t}</button>
            );
          })}
        </div>
        </>}

        <button onClick={()=>valid&&onConfirm(selDate,selSlot)} disabled={!valid}
          style={{width:"100%",padding:"15px 0",borderRadius:14,border:"none",cursor:valid?"pointer":"default",fontSize:16,fontWeight:800,fontFamily:"inherit",touchAction:"manipulation",
            background:valid?`linear-gradient(135deg,${T.brand},${T.brandDeep})`:T.line,color:valid?"#fff":T.inkSoft}}>
          Conferma prenotazione
        </button>
      </div>
    </div>
  );
}

/* Schermata singola chat */
function ChatScreen({conv,role,nav,onSeen,isBooked,onSendMessage,onSendOffer,onEditOffer,onAccept,onDecline,onAcceptRequest,onDeclineRequest}) {
  const pro = ALL_PROS.find(p=>p.id===conv.proId)||ALL_PROS[0];
  const [text,setText] = useState("");
  const [showOffer,setShowOffer] = useState(false);
  const [editMsg,setEditMsg] = useState(null);    // offerta che il pro sta modificando
  const [pickMsg,setPickMsg] = useState(null);   // offerta che il cliente sta prenotando
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },[conv.messages.length]);
  // Segna la conversazione come letta (lato cliente) SOLO all'apertura della chat.
  // Così i messaggi che arrivano dopo restano "non letti" finché non riapri la conversazione.
  const seenRef = useRef(false);
  useEffect(()=>{
    if(role==="client" && !seenRef.current && onSeen){ seenRef.current = true; onSeen(conv.messages.length); }
  },[role]);

  const otherName = role==="client"?pro.name:conv.clientName;
  const send = () => { if(!text.trim()) return; const t=text.trim(); setText(""); onSendMessage(conv.id,{from:role,type:"text",text:t,_dedup:Date.now()+""+Math.random()}); };
  const onPickPhoto = (e) => {
    const files = Array.from(e.target.files||[]);
    files.forEach(f=>{
      const url = URL.createObjectURL(f);
      const isVideo = (f.type||"").startsWith("video");
      onSendMessage(conv.id,{from:role,type:isVideo?"video":"photo",[isVideo?"video":"img"]:url,_dedup:Date.now()+""+Math.random()+f.name});
    });
    e.target.value = "";
  };
  const sendLocation = () => {
    const done = (lat,lng,label)=> onSendMessage(conv.id,{from:role,type:"location",lat,lng,label:label||"Posizione condivisa",_dedup:Date.now()+""+Math.random()});
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(
        p=>done(p.coords.latitude,p.coords.longitude,"La mia posizione"),
        ()=>done(pro.lat,pro.lng,pro.city||"Posizione")
      );
    } else done(pro.lat,pro.lng,pro.city||"Posizione");
  };
  // Risposte rapide (pro)
  const QUICK = ["Ciao! Come posso aiutarti? 😊","Certo, quando vorresti passare?","Purtroppo quell'orario è occupato, ti propongo un'alternativa.","Ti preparo un'offerta su misura 💼","Grazie a te, a presto! ✨"];
  const [showQuick,setShowQuick] = useState(false);
  // Accettazione: se il pro ha già proposto data+ora → accetta diretto, altrimenti apri lo slot picker
  const acceptOffer = (m) => {
    if(m.offer.date && m.offer.slot) onAccept(conv.id,m.id,m.offer.date,m.offer.slot);
    else setPickMsg(m);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",background:T.paper}}>
      {/* Header */}
      <div style={{background:T.white,padding:"50px 14px 12px",borderBottom:`1px solid ${T.line}`,display:"flex",alignItems:"center",gap:11,flexShrink:0}}>
        <button onClick={()=>nav(role==="client"?"cl_chats":"pro_chats")} style={{width:34,height:34,borderRadius:"50%",background:T.surface,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div onClick={()=>role==="client"&&nav("cl_pro",pro)} style={{width:40,height:40,borderRadius:"50%",background:`${pro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,cursor:role==="client"?"pointer":"default"}}>{role==="client"?pro.emoji:"🧑"}</div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:15,fontWeight:800,color:T.ink,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{otherName}</p>
          <p style={{fontSize:11,color:T.green,margin:0,fontWeight:600}}>● Online</p>
        </div>
        {/* Toggle vista (test su un solo dispositivo): passa da Pro a Cliente sulla stessa chat */}
        <button onClick={()=>nav("chat",{convId:conv.id,role:role==="client"?"pro":"client"})}
          style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:99,border:`1.5px solid ${T.line}`,background:T.surface,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:800,color:T.brand}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          {role==="client"?"Vedi da Pro":"Vedi da Cliente"}
        </button>
      </div>

      {/* Messaggi */}
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"16px 14px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{textAlign:"center",marginBottom:4}}>
          <span style={{fontSize:11,color:T.inkSoft,background:T.surface,padding:"4px 12px",borderRadius:99}}>Accordatevi su prezzo e durata, poi prenota con un tap</span>
        </div>
        {conv.messages.map(m => {
          if(m.type==="request") return (
            <RequestCard key={m.id} request={m.request} msgFrom={m.from} role={role} clientName={conv.clientName} proName={pro.name}
              onAccept={()=>onAcceptRequest&&onAcceptRequest(conv.id,m.id)} onDecline={()=>onDeclineRequest&&onDeclineRequest(conv.id,m.id)}/>
          );
          if(m.type==="offer") return (
            <OfferCard key={m.id} offer={m.offer} msgFrom={m.from} role={role} proName={pro.name}
              onAccept={()=>acceptOffer(m)} onDecline={()=>onDecline(conv.id,m.id)} onEdit={()=>setEditMsg(m)}/>
          );
          if(m.type==="photo") {
            const mineP = m.from===role;
            return (
              <div key={m.id} className={mineP?"clay-btn":"clay-soft"} style={{maxWidth:"72%",alignSelf:mineP?"flex-end":"flex-start",background:mineP?T.brand:T.white,borderRadius:mineP?"18px 18px 5px 18px":"18px 18px 18px 5px",overflow:"hidden",padding:4}}>
                <div style={{borderRadius:14,overflow:"hidden"}}>
                  <img src={m.img} alt="ispirazione" style={{display:"block",width:"100%",maxWidth:200,objectFit:"cover"}}/>
                </div>
                {m.text && <p style={{fontSize:13,lineHeight:1.4,color:mineP?"#fff":T.ink,margin:"7px 8px 2px"}}>{m.text}</p>}
                <span style={{display:"block",fontSize:9,margin:"2px 8px 4px",opacity:.6,textAlign:"right",color:mineP?"#fff":T.inkSoft}}>{m.time}</span>
              </div>
            );
          }
          if(m.type==="video") {
            const mineV = m.from===role;
            return (
              <div key={m.id} className={mineV?"clay-btn":"clay-soft"} style={{maxWidth:"72%",alignSelf:mineV?"flex-end":"flex-start",background:mineV?T.brand:T.white,borderRadius:mineV?"18px 18px 5px 18px":"18px 18px 18px 5px",overflow:"hidden",padding:4}}>
                <div style={{borderRadius:14,overflow:"hidden",background:"#000"}}>
                  <video src={m.video} controls playsInline style={{display:"block",width:"100%",maxWidth:220,maxHeight:300}}/>
                </div>
                <span style={{display:"block",fontSize:9,margin:"2px 8px 4px",opacity:.6,textAlign:"right",color:mineV?"#fff":T.inkSoft}}>{m.time}</span>
              </div>
            );
          }
          if(m.type==="location") {
            const mineL = m.from===role;
            const maps = `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=16/${m.lat}/${m.lng}`;
            return (
              <a key={m.id} href={maps} target="_blank" rel="noopener" className={mineL?"clay-btn":"clay-soft"} style={{maxWidth:"72%",alignSelf:mineL?"flex-end":"flex-start",background:mineL?T.brand:T.white,borderRadius:mineL?"18px 18px 5px 18px":"18px 18px 18px 5px",overflow:"hidden",textDecoration:"none",display:"block"}}>
                <div style={{height:110,background:"linear-gradient(135deg,#DDE6F5,#EAF0F8)",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill={T.brand} stroke="#fff" strokeWidth="1.5"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>
                </div>
                <div style={{padding:"9px 12px"}}>
                  <p style={{fontSize:13,fontWeight:700,color:mineL?"#fff":T.ink,margin:0}}>📍 {m.label||"Posizione"}</p>
                  <p style={{fontSize:10,margin:"2px 0 0",opacity:.7,color:mineL?"#fff":T.inkSoft}}>Tocca per aprire la mappa · {m.time}</p>
                </div>
              </a>
            );
          }
          const mine = m.from===role;
          return (
            <div key={m.id} className={mine?"clay-btn":"clay-soft"} style={{maxWidth:"78%",alignSelf:mine?"flex-end":"flex-start",
              background:mine?T.brand:T.white,
              color:mine?"#fff":T.ink,
              borderRadius:mine?"18px 18px 5px 18px":"18px 18px 18px 5px",
              padding:"10px 14px",fontSize:14,lineHeight:1.4}}>
              {m.text}
              <span style={{display:"block",fontSize:9,marginTop:3,opacity:.6,textAlign:"right"}}>{m.time}</span>
            </div>
          );
        })}
      </div>

      {/* Barra invio */}
      <div style={{background:T.white,borderTop:`1px solid ${T.line}`,padding:"10px 12px 26px",flexShrink:0}}>
        {/* Pulsante Crea offerta — solo pro, ben visibile stile Vinted */}
        {role==="pro" && (
          <button onClick={()=>setShowOffer(true)} style={{width:"100%",marginBottom:10,padding:"12px 0",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:800,color:"#fff",background:`linear-gradient(135deg,${T.brand},${T.brandDeep})`,boxShadow:`0 4px 16px ${T.brand}44`,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><path d="M12 12v4M10 14h4"/></svg>
            Crea offerta
          </button>
        )}
        {/* Risposte rapide — solo pro */}
        {role==="pro" && showQuick && (
          <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:10,scrollbarWidth:"none"}}>
            {QUICK.map((q,i)=>(
              <button key={i} onClick={()=>{onSendMessage(conv.id,{from:"pro",type:"text",text:q,_dedup:Date.now()+""+Math.random()});setShowQuick(false);}} style={{flexShrink:0,padding:"9px 14px",borderRadius:99,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:600,color:T.ink,whiteSpace:"nowrap"}}>{q}</button>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onPickPhoto} style={{display:"none"}}/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Allega foto/video */}
          <button onClick={()=>fileRef.current&&fileRef.current.click()} title="Invia foto o video" className="clay-soft" style={{width:42,height:42,borderRadius:"50%",border:"none",background:T.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>
          </button>
          {/* Posizione */}
          <button onClick={sendLocation} title="Invia posizione" className="clay-soft" style={{width:42,height:42,borderRadius:"50%",border:"none",background:T.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>
          {/* Risposte rapide — solo pro */}
          {role==="pro" && (
            <button onClick={()=>setShowQuick(s=>!s)} title="Risposte rapide" className="clay-soft" style={{width:42,height:42,borderRadius:"50%",border:"none",background:showQuick?T.brandBg:T.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
            </button>
          )}
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Scrivi un messaggio…"
            className="clay-inset" style={{flex:1,border:"none",outline:"none",background:T.surface,borderRadius:99,padding:"13px 17px",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
          <button onClick={send} disabled={!text.trim()} className={text.trim()?"clay-btn":""} style={{width:42,height:42,borderRadius:"50%",border:"none",background:text.trim()?T.brand:T.line,cursor:text.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
        {role==="client" && <p style={{fontSize:10,color:T.inkSoft,margin:"7px 0 0",textAlign:"center"}}>📷 Invia una foto e spiega cosa desideri fare</p>}
      </div>

      {/* Modal crea offerta — solo pro */}
      {showOffer && role==="pro" && <OfferModal pro={pro} isBooked={isBooked} proId={conv.proId} onClose={()=>setShowOffer(false)}
        onSend={(offer)=>{const dedup=Date.now()+""+Math.random();onSendOffer(conv.id,{from:"pro",type:"offer",_dedup:dedup,offer:{...offer,status:"pending"}});setShowOffer(false);}}/>}

      {/* Modal modifica offerta — solo pro */}
      {editMsg && role==="pro" && <OfferModal pro={pro} isBooked={isBooked} proId={conv.proId} initial={editMsg.offer} onClose={()=>setEditMsg(null)}
        onSend={(offer)=>{onEditOffer(conv.id,editMsg.id,offer);setEditMsg(null);}}/>}

      {/* Bottom-sheet scelta slot — solo cliente */}
      {pickMsg && <SlotPickerModal offer={pickMsg.offer} proId={conv.proId} isBooked={isBooked} onClose={()=>setPickMsg(null)}
        onConfirm={(date,slot)=>{onAccept(conv.id,pickMsg.id,date,slot);setPickMsg(null);}}/>}
    </div>
  );
}

/* Modal per comporre / modificare un'offerta — solo per il PRO */
function OfferModal({pro,initial,onClose,onSend,isBooked,proId}) {
  const editing = !!initial;
  const [service,setService] = useState(initial?.service||"");
  const [description,setDescription] = useState(initial?.description||"");
  const [price,setPrice] = useState(initial?.price!=null?String(initial.price):"");
  const [min,setMin] = useState(initial?.min!=null?String(initial.min):"60");
  const [date,setDate] = useState(initial?.date||"");
  const [slot,setSlot] = useState(initial?.slot||"");
  const [note,setNote] = useState(initial?.note||"");
  const valid = service.trim() && price && min;

  const lbl = {fontSize:12,fontWeight:700,color:T.inkMid,display:"block",marginBottom:6};
  const inp = {width:"100%",border:`1.5px solid ${T.line}`,outline:"none",background:T.white,borderRadius:12,padding:"12px 14px",fontSize:14,color:T.ink,fontFamily:"inherit",boxSizing:"border-box"};

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(43,34,24,.45)",zIndex:400,display:"flex",alignItems:"flex-end",backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} className="ba-pop" style={{background:T.paper,borderRadius:"26px 26px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"18px 18px 32px",maxHeight:"92dvh",overflowY:"auto"}}>
        <div style={{width:40,height:4,borderRadius:99,background:T.line,margin:"0 auto 16px"}}/>
        <h2 style={{fontSize:19,fontWeight:800,color:T.ink,margin:"0 0 4px"}}>{editing?"Modifica offerta":"Crea offerta"}</h2>
        <p style={{fontSize:13,color:T.inkMid,margin:"0 0 18px"}}>{editing?"Aggiorna i dettagli. Il cliente vedrà l'offerta aggiornata.":"Compila i dettagli del lavoro su misura per il cliente."}</p>

        <label style={lbl}>Nome del servizio</label>
        <input value={service} onChange={e=>setService(e.target.value)} placeholder="Es. Balayage + tonalizzante"
          style={{...inp,marginBottom:14}}/>

        <label style={lbl}>Descrizione</label>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} placeholder="Cosa include il servizio…"
          style={{...inp,marginBottom:14,resize:"none",lineHeight:1.4}}/>

        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1}}>
            <label style={lbl}>Prezzo (€)</label>
            <input value={price} onChange={e=>setPrice(e.target.value.replace(/[^0-9]/g,""))} inputMode="numeric" placeholder="120" style={inp}/>
          </div>
          <div style={{flex:1}}>
            <label style={lbl}>Durata (min)</label>
            <input value={min} onChange={e=>setMin(e.target.value.replace(/[^0-9]/g,""))} inputMode="numeric" placeholder="60" style={inp}/>
          </div>
        </div>

        {/* Giorno e orario — scelta a calendario, niente testo a mano */}
        <label style={lbl}>Proponi giorno e orario <span style={{color:T.inkSoft,fontWeight:600}}>(facolt.)</span></label>
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",marginBottom:12,paddingBottom:2}}>
          {genDates(14).map(d=>{
            const sel = date===d.label;
            return (
              <button key={d.label} type="button" onClick={()=>{ setDate(sel?"":d.label); setSlot(""); }} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",padding:"9px 13px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",touchAction:"manipulation",background:sel?T.brand:T.white,boxShadow:sel?"none":`0 0 0 1.5px ${T.line} inset`}}>
                <span style={{fontSize:9,fontWeight:700,color:sel?"rgba(255,255,255,.75)":T.inkSoft,marginBottom:2}}>{d.dayName}</span>
                <span style={{fontSize:16,fontWeight:800,color:sel?"#fff":T.ink}}>{d.day}</span>
              </button>
            );
          })}
        </div>
        {date && (
          <div style={{marginBottom:14}}>
            <label style={lbl}>Orario <span style={{color:T.inkSoft,fontWeight:600}}>(gli occupati sono barrati)</span></label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {BOOKING_TIMES.map(t=>{
                const isBusy = isBooked && date && isBooked(proId, date, t);
                const isSel = slot===t;
                return (
                  <button key={t} type="button" disabled={isBusy} onClick={()=>!isBusy&&setSlot(isSel?"":t)} title={isBusy?"Occupato":""}
                    style={{padding:"10px 15px",borderRadius:12,border:"none",cursor:isBusy?"not-allowed":"pointer",fontSize:15,fontWeight:700,fontFamily:"inherit",touchAction:"manipulation",
                      background:isBusy?T.surface:isSel?T.brand:T.white,color:isBusy?T.inkSoft:isSel?"#fff":T.inkMid,
                      textDecoration:isBusy?"line-through":"none",opacity:isBusy?.6:1,
                      boxShadow:isSel?"none":`0 0 0 1.5px ${T.line} inset`}}>{t}</button>
                );
              })}
            </div>
          </div>
        )}

        <label style={lbl}>Note <span style={{color:T.inkSoft,fontWeight:600}}>(facolt.)</span></label>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Eventuali note per il cliente…"
          style={{...inp,marginBottom:22,resize:"none",lineHeight:1.4}}/>

        <button onClick={()=>valid&&onSend({service:service.trim(),description:description.trim(),price:parseInt(price),min:parseInt(min)||60,date:date.trim(),slot:slot.trim(),note:note.trim()})} disabled={!valid}
          style={{width:"100%",padding:"15px 0",borderRadius:14,border:"none",cursor:valid?"pointer":"default",fontSize:15,fontWeight:800,fontFamily:"inherit",
            background:valid?`linear-gradient(135deg,${T.brand},${T.brandDeep})`:T.line,color:valid?"#fff":T.inkSoft,boxShadow:valid?`0 4px 16px ${T.brand}55`:"none"}}>
          {editing?"Aggiorna offerta":"Invia offerta al cliente"}
        </button>
      </div>
    </div>
  );
}

/* Bottom-sheet "Inoltra a" — scegli a quale professionista mandare la foto (stile Instagram) */
function SharePostSheet({post,onClose,onPick}) {
  const [q,setQ] = useState("");
  const author = ALL_PROS.find(p=>p.id===post.proId);
  const query = q.trim().toLowerCase();
  const list = ALL_PROS.filter(p=>{
    if(!query) return true;
    return (p.name+" "+p.city+" "+(p.cat||"")).toLowerCase().includes(query);
  });
  // Autore in cima, poi gli altri
  const ordered = [
    ...list.filter(p=>p.id===post.proId),
    ...list.filter(p=>p.id!==post.proId),
  ];

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(43,34,24,.45)",zIndex:600,display:"flex",alignItems:"flex-end",backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} className="ba-pop" style={{background:T.paper,borderRadius:"26px 26px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"18px 0 24px",maxHeight:"88dvh",display:"flex",flexDirection:"column"}}>
        <div style={{width:40,height:4,borderRadius:99,background:T.line,margin:"0 auto 14px"}}/>
        <div style={{padding:"0 18px"}}>
          <h2 style={{fontSize:19,fontWeight:800,color:T.ink,margin:"0 0 4px"}}>Invia la foto a…</h2>
          <p style={{fontSize:13,color:T.inkMid,margin:"0 0 14px"}}>Scegli un professionista e chiedi se può realizzarlo, anche se non è chi ha pubblicato la foto.</p>

          {/* Anteprima foto */}
          <div style={{display:"flex",alignItems:"center",gap:11,background:T.white,borderRadius:16,padding:10,marginBottom:14,boxShadow:"0 2px 10px rgba(0,0,0,.05)"}}>
            <img src={post.img} alt="ispirazione" style={{width:52,height:52,borderRadius:12,objectFit:"cover",flexShrink:0}}/>
            <div style={{minWidth:0}}>
              <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Foto ispirazione</p>
              <p style={{fontSize:11,color:T.inkSoft,margin:0}}>Pubblicata da {author?author.name:"un professionista"}</p>
            </div>
          </div>

          {/* Ricerca */}
          <div style={{display:"flex",alignItems:"center",gap:10,background:T.surface,borderRadius:99,padding:"11px 16px",marginBottom:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca per nome, città o categoria…"
              style={{flex:1,border:"none",outline:"none",background:"none",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
          </div>
        </div>

        {/* Lista professionisti */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 18px 0"}}>
          {ordered.length===0 && <p style={{textAlign:"center",fontSize:13,color:T.inkSoft,padding:"30px 0"}}>Nessun professionista trovato.</p>}
          {ordered.map(p=>{
            const isAuthor = p.id===post.proId;
            return (
              <button key={p.id} onClick={()=>onPick(p.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 8px",background:"none",border:"none",borderBottom:`1px solid ${T.line}`,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                <div style={{width:46,height:46,borderRadius:"50%",background:`${p.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{p.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</p>
                    {isAuthor && <span style={{fontSize:9,fontWeight:800,color:T.brand,background:T.brandBg,padding:"2px 7px",borderRadius:99,flexShrink:0}}>AUTORE</span>}
                  </div>
                  <p style={{fontSize:11.5,color:T.inkSoft,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.cat} · 📍 {p.city}</p>
                </div>
                <div style={{flexShrink:0,padding:"8px 14px",borderRadius:99,background:`linear-gradient(135deg,${T.brand},${T.brandDeep})`,color:"#fff",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  Invia
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BetaWelcome({onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{background:T.white,borderRadius:22,padding:"28px 24px",maxWidth:380,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:50,marginBottom:14}}>🎉</div>
        <h2 style={{fontSize:22,fontWeight:700,color:T.ink,margin:"0 0 8px"}}>Benvenuto nella beta!</h2>
        <p style={{fontSize:14,color:T.inkMid,margin:"0 0 18px",lineHeight:1.7}}>Hai accesso a tutto gratuitamente per i prossimi <strong>{BETA_DAYS} giorni</strong> (fino al 14 settembre 2026).</p>
        <div style={{background:T.surface,borderRadius:13,padding:"13px",marginBottom:18,textAlign:"left"}}>
          {["Agenda e calendario","Gestione clienti","Servizi e staff","Statistiche","Link prenotazione"].map(f=>(
            <div key={f} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{width:15,height:15,borderRadius:8,background:T.greenBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg></div>
              <span style={{fontSize:13,color:T.ink}}>{f}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"15px 0",borderRadius:13,border:"none",background:T.brand,color:T.white,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Inizia a usare l'app</button>
      </div>
    </div>
  );
}

/* ─── ONBOARDING ─────────────────────────────────────────────── */
const OB_CSS = `
@keyframes obFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes obFadeIn{from{opacity:0}to{opacity:1}}
.ob-fadeup{animation:obFadeUp 320ms cubic-bezier(.4,0,.2,1) both}
.ob-fadein{animation:obFadeIn 280ms ease both}
`;

function WomanSVG({scale=1}){
  return (
    <svg width={130*scale} height={180*scale} viewBox="0 0 130 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* bun di capelli */}
      <ellipse cx="68" cy="28" rx="18" ry="16" fill="rgba(255,255,255,0.35)"/>
      <ellipse cx="54" cy="38" rx="26" ry="22" fill="rgba(255,255,255,0.28)"/>
      {/* viso */}
      <ellipse cx="64" cy="66" rx="26" ry="30" fill="rgba(255,255,255,0.92)"/>
      {/* capelli laterali */}
      <path d="M38 56 Q30 80 36 100 Q42 72 40 56Z" fill="rgba(255,255,255,0.3)"/>
      <path d="M90 56 Q96 74 88 96 Q84 72 88 56Z" fill="rgba(255,255,255,0.25)"/>
      {/* collo */}
      <rect x="56" y="94" width="16" height="16" rx="8" fill="rgba(255,255,255,0.92)"/>
      {/* spalle & busto */}
      <path d="M22 180 Q28 130 46 118 Q55 113 64 112 Q73 113 82 118 Q100 130 108 180Z" fill="rgba(255,255,255,0.28)"/>
    </svg>
  );
}

function ManSVG({scale=1}){
  return (
    <svg width={130*scale} height={180*scale} viewBox="0 0 130 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* capelli corti */}
      <ellipse cx="65" cy="42" rx="28" ry="22" fill="rgba(255,255,255,0.3)"/>
      <path d="M37 42 Q36 28 65 24 Q94 28 93 42Z" fill="rgba(255,255,255,0.35)"/>
      {/* viso */}
      <ellipse cx="65" cy="66" rx="26" ry="30" fill="rgba(255,255,255,0.92)"/>
      {/* mascella leggermente squadrata */}
      <path d="M39 72 Q39 96 65 100 Q91 96 91 72Z" fill="rgba(255,255,255,0.88)"/>
      {/* collo */}
      <rect x="57" y="96" width="16" height="16" rx="6" fill="rgba(255,255,255,0.92)"/>
      {/* spalle più larghe */}
      <path d="M12 180 Q16 126 44 114 Q54 110 65 109 Q76 110 86 114 Q114 126 118 180Z" fill="rgba(255,255,255,0.28)"/>
    </svg>
  );
}

/* ─── AVATAR — immagini reali 3D ─────────────────────────────── */
const avatarStyle = {
  position:"absolute",
  top:0, bottom:0, left:0, right:0,
  width:"100%", height:"100%",
  objectFit:"contain",
  objectPosition:"bottom center",
  display:"block", pointerEvents:"none",
};

const CharDonna = () => <img src="/beauty/donna-final.png" alt="Donna" style={avatarStyle}/>;
const CharUomo  = () => <img src="/beauty/uomo-new.png"   alt="Uomo"  style={avatarStyle}/>;

/* ─── ONBOARDING SCREEN ─────────────────────────────────────── */
function OnboardingScreen({onComplete}){
  const [sel,setSel]   = useState(null); // "donna" | "uomo" | "nonspec" | null
  const [exiting,setExiting] = useState(false);
  const EASE = "350ms cubic-bezier(0.22,1,0.36,1)";

  const pick = (g) => {
    if(sel==="donna"||sel==="uomo") return; // già scelta, ignora
    setSel(g);
  };
  const reset = () => setSel(null);
  const proceed = () => { setExiting(true); setTimeout(()=>onComplete(sel),380); };

  // Larghezze card animate
  const donnaW = sel==="uomo" ? "28%" : sel==="donna" ? "72%" : "50%";
  const uomoW  = sel==="donna" ? "28%" : sel==="uomo"  ? "72%" : "50%";

  const PINK = "#F06B9D";
  const BLUE = "#4A7BF7";

  return (
    <div style={{
      position:"fixed",inset:0,background:"#FFFFFF",
      display:"flex",flexDirection:"column",
      fontFamily:"'Plus Jakarta Sans',sans-serif",
      opacity:exiting?0:1,transition:"opacity 350ms ease",
      overflowY:"auto",
    }}>
      {/* ── HEADER ── */}
      <div style={{textAlign:"center",padding:"56px 28px 20px",flexShrink:0}}>
        <img src={`${import.meta.env.BASE_URL}logo-b.png`} alt="beauty" style={{height:44,width:"auto",display:"block",margin:"0 auto 20px",objectFit:"contain"}}/>
        <h1 style={{fontSize:30,fontWeight:800,color:"#111",margin:"0 0 10px",letterSpacing:"-.04em",lineHeight:1.15}}>
          Ciao, benvenuto!
        </h1>
        <p style={{fontSize:15,color:"#888",margin:0,lineHeight:1.6,fontWeight:400}}>
          Per offrirti la migliore esperienza,<br/>scegli chi sei.
        </p>
      </div>

      {/* ── DUE CARD AFFIANCATE ── */}
      <div style={{padding:"0 16px",flexShrink:0}}>
        <div style={{display:"flex",gap:10,height:460,position:"relative"}}>

          {/* ━━━ DONNA ━━━ */}
          <div onClick={()=>pick("donna")}
            style={{
              width:donnaW,
              flexShrink:0,
              background:PINK,
              borderRadius:24,
              overflow:"hidden",
              cursor: sel&&sel!=="donna" ? "default" : "pointer",
              transition:`width ${EASE}`,
              display:"flex",
              flexDirection:"column",
              position:"relative",
            }}>
            {/* label */}
            <div style={{padding:"20px 18px 0",position:"relative",zIndex:2,flexShrink:0}}>
              <p style={{
                fontSize:22,fontWeight:800,color:"#fff",margin:"0 0 4px",
                letterSpacing:"-.03em",lineHeight:1,
                opacity: sel==="uomo" ? 0 : 1,
                transition:`opacity ${EASE}`,
              }}>Donna</p>
              <p style={{
                fontSize:11,color:"rgba(255,255,255,.88)",margin:0,lineHeight:1.4,fontWeight:500,
                opacity: sel==="uomo" ? 0 : 1,
                transition:`opacity ${EASE}`,
              }}>
                Scopri servizi e<br/>professionisti per te
              </p>
            </div>
            {/* avatar */}
            <div style={{
              flex:1,position:"relative",zIndex:1,minHeight:0,overflow:"hidden",
              transform: sel==="donna" ? "scale(1.04) translateY(2px)" : "scale(1)",
              transition:`transform 400ms cubic-bezier(0.22,1,0.36,1)`,
              transformOrigin:"bottom center",
            }}>
              <CharDonna/>
            </div>
            {/* prosegui */}
            {sel==="donna" && (
              <div style={{padding:"10px 16px 20px",zIndex:3,position:"relative",animation:"obFadeUp 260ms ease both"}}>
                <button onClick={e=>{e.stopPropagation();proceed();}}
                  style={{width:"100%",padding:"15px 0",borderRadius:16,border:"none",background:"#fff",color:PINK,fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 0 rgba(0,0,0,.08)"}}>
                  Prosegui →
                </button>
              </div>
            )}
          </div>

          {/* ━━━ PILL CENTRALE ← → ━━━ */}
          {!sel && (
            <div style={{
              position:"absolute",top:"50%",left:"50%",
              transform:"translate(-50%,-50%)",zIndex:20,
              background:"#fff",borderRadius:999,
              padding:"8px 16px",
              display:"flex",gap:10,alignItems:"center",
              boxShadow:"0 4px 20px rgba(0,0,0,.14)",
            }}>
              <span style={{fontSize:15,color:PINK,fontWeight:800,lineHeight:1}}>←</span>
              <div style={{width:1,height:15,background:"#E0E0E0"}}/>
              <span style={{fontSize:15,color:BLUE,fontWeight:800,lineHeight:1}}>→</span>
            </div>
          )}

          {/* ━━━ BACK BUTTON ━━━ */}
          {(sel==="donna"||sel==="uomo") && (
            <button onClick={e=>{e.stopPropagation();reset();}}
              style={{
                position:"absolute",top:14,
                left: sel==="donna" ? 14 : "auto",
                right: sel==="uomo" ? 14 : "auto",
                zIndex:30,width:34,height:34,borderRadius:"50%",
                background:"rgba(255,255,255,.24)",border:"none",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                color:"#fff",fontSize:16,fontWeight:700,
                animation:"obFadeIn 200ms ease both",
              }}>←</button>
          )}

          {/* ━━━ UOMO ━━━ */}
          <div onClick={()=>pick("uomo")}
            style={{
              width:uomoW,
              flexShrink:0,
              background:BLUE,
              borderRadius:24,
              overflow:"hidden",
              cursor: sel&&sel!=="uomo" ? "default" : "pointer",
              transition:`width ${EASE}`,
              display:"flex",
              flexDirection:"column",
              position:"relative",
            }}>
            {/* label */}
            <div style={{padding:"20px 18px 0",position:"relative",zIndex:2,flexShrink:0}}>
              <p style={{
                fontSize:22,fontWeight:800,color:"#fff",margin:"0 0 4px",
                letterSpacing:"-.03em",lineHeight:1,
                opacity: sel==="donna" ? 0 : 1,
                transition:`opacity ${EASE}`,
              }}>Uomo</p>
              <p style={{
                fontSize:11,color:"rgba(255,255,255,.88)",margin:0,lineHeight:1.4,fontWeight:500,
                opacity: sel==="donna" ? 0 : 1,
                transition:`opacity ${EASE}`,
              }}>
                Scopri servizi e<br/>professionisti per te
              </p>
            </div>
            {/* avatar */}
            <div style={{
              flex:1,position:"relative",zIndex:1,minHeight:0,overflow:"hidden",
              transform: sel==="uomo" ? "scale(1.04) translateY(2px)" : "scale(1)",
              transition:`transform 400ms cubic-bezier(0.22,1,0.36,1)`,
              transformOrigin:"bottom center",
            }}>
              <CharUomo/>
            </div>
            {/* prosegui */}
            {sel==="uomo" && (
              <div style={{padding:"10px 16px 20px",zIndex:3,position:"relative",animation:"obFadeUp 260ms ease both"}}>
                <button onClick={e=>{e.stopPropagation();proceed();}}
                  style={{width:"100%",padding:"15px 0",borderRadius:16,border:"none",background:"#fff",color:BLUE,fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 0 rgba(0,0,0,.08)"}}>
                  Prosegui →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── NON SPECIFICARE ── */}
      <div style={{padding:"12px 16px 0",flexShrink:0}}>
        <div onClick={()=>{ setSel("nonspec"); }}
          style={{
            display:"flex",alignItems:"center",gap:14,
            background: sel==="nonspec" ? "#FFF1F4" : "#F7F7F7",
            border: `1.5px solid ${sel==="nonspec" ? PINK : "#ECECEC"}`,
            borderRadius:18,
            padding:"0 20px",
            height:56,
            cursor:"pointer",
            transition:"all 280ms ease",
            position:"relative",
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={sel==="nonspec"?PINK:"#ADADAD"} strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <span style={{fontSize:15,fontWeight:600,color:sel==="nonspec"?"#111":"#555",flex:1}}>Non specificare</span>
          {sel==="nonspec" && (
            <button onClick={e=>{e.stopPropagation();proceed();}}
              style={{padding:"9px 20px",borderRadius:999,border:"none",background:PINK,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",animation:"obFadeIn 220ms ease both",flexShrink:0}}>
              Prosegui →
            </button>
          )}
        </div>
      </div>

      {/* ── INFO LOCK ── */}
      <div style={{padding:"10px 16px 40px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,background:"#F7F7F7",borderRadius:14,padding:"14px 16px"}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ADADAD" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <p style={{fontSize:12,color:"#ADADAD",margin:0,lineHeight:1.5,flex:1,fontWeight:400}}>
            Puoi modificare questa scelta in qualsiasi momento dal tuo profilo.
          </p>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D0D0D0" strokeWidth="2.5" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ROOT */
export default function App() {
  const [user,setUser] = useState(null);
  const [accent,setAccentState] = useState("nero"); // accento fisso: nessuna scelta colore
  applyAccent(accent); // garantisce che T sia coerente ad ogni render
  const setAccent = (name)=>{ applyAccent(name); try{localStorage.setItem("ba-accent",name);}catch(e){} setAccentState(name); };
  const [mode,setMode] = useState("cliente");
  const [screen,setScreen] = useState("cl_home");
  const [sData,setSD] = useState(null);
  // Account nuovi: si parte PULITI, senza dati finti (niente clienti/appuntamenti/preferiti demo)
  const [appts,setAppts] = useState([]);
  const [clients,setClients] = useState([]);
  const [services,setServices] = useState([]);
  const [staff,setStaff] = useState([]);
  const [hours,setHours] = useState(HOURS0); // orari di apertura di default (modificabili)
  const [favorites,setFavorites] = useState(new Set());
  const [following,setFollowing] = useState(new Set());
  const [likedPosts,setLikedPosts] = useState(new Set());
  const [showBetaWelcome,setShowBetaWelcome] = useState(false);
  const [sharePost,setSharePost] = useState(null);   // post da inoltrare a un professionista
  const [pendingAdd,setPendingAdd] = useState(null); // azione FAB da aprire nella schermata pro
  const [toast,setToast] = useState("");
  const showToast = (msg)=>{ setToast(msg); setTimeout(()=>setToast(t=>t===msg?"":t),5000); };
  const [proAddOpen,setProAddOpen] = useState(false); // un modale di creazione pro è aperto → nascondi il FAB
  const [msgReads,setMsgReads] = useState({});       // convId -> n. messaggi già visti dal cliente
  const [notifSeenId,setNotifSeenId] = useState(0);  // id massimo notifica già vista
  const [showOnboarding,setShowOnboarding] = useState(false);
  const [myAppts,setMyAppts] = useState([]);
  const [conversations,setConversations] = useState([]);
  const [savedPosts,setSavedPosts] = useState(new Set());
  // ── Notifiche like/commenti (stile Instagram) ──
  const [notifs,setNotifs] = useState(()=>{ try{return JSON.parse(localStorage.getItem("ba-notifs")||"[]");}catch(e){return [];} });
  const [notifSeenTs,setNotifSeenTs] = useState(()=>{ try{return Number(localStorage.getItem("ba-notifseen"))||0;}catch(e){return 0;} });
  const persistNotifs = (list)=>{ try{localStorage.setItem("ba-notifs",JSON.stringify((list||[]).slice(0,120)));}catch(e){} };
  const lastUidRef = useRef(null); // ultimo utente entrato: evita rientri su update/refresh sessione
  const [feed,setFeedState] = useState(()=>{
    let base = FEED;
    try{ const s=localStorage.getItem("ba-feed"); if(s) base = JSON.parse(s); }catch(e){}
    // Unisci sempre il backup dei post dell'utente (sopravvive anche se il feed pieno viene ridotto)
    try{
      const mine = JSON.parse(localStorage.getItem("ba-myposts")||"[]");
      if(mine && mine.length){
        const ids = new Set(base.map(p=>String(p.id)));
        const missing = mine.filter(p=>!ids.has(String(p.id)));
        if(missing.length) base = [...missing, ...base];
      }
    }catch(e){}
    return base;
  });
  const persistFeed = (list)=>{
    // 1) backup piccolo e SEMPRE salvabile dei soli post dell'utente
    try{ localStorage.setItem("ba-myposts", JSON.stringify(list.filter(p=>p && p.author).slice(0,50))); }catch(e){}
    // 2) feed completo; se supera lo spazio, riduce (mantiene i post dell'utente)
    try{ localStorage.setItem("ba-feed", JSON.stringify(list)); return; }catch(e){}
    try{
      const mine = list.filter(p=>p && p.author);
      const others = list.filter(p=>!(p && p.author));
      let trimmed = [...mine, ...others].slice(0,40);
      for(let n=trimmed.length; n>0; n-=5){
        try{ localStorage.setItem("ba-feed", JSON.stringify(trimmed.slice(0,n))); return; }catch(err){}
      }
    }catch(e){}
  };
  const setFeed = (updater)=> setFeedState(prev=>{
    const next = typeof updater==="function" ? updater(prev) : updater;
    persistFeed(next);
    return next;
  });
  const [avatarConfig,setAvatarConfig] = useState(null);

  // ── Disponibilità condivisa: slot occupati per professionista/giorno/ora ──
  const [bookings,setBookings] = useState(()=>{
    const b={};
    ALL_PROS.forEach(p=>{
      // slot già occupati di partenza (diversi per professionista, in modo deterministico)
      const base = ["Oggi","Domani",genDates(3)[2].label];
      b[p.id] = {
        [base[0]]: ["09:00","11:00", p.id%2? "15:30":"16:00"],
        [base[1]]: ["10:00","14:30"],
        [base[2]]: [ p.id%2? "09:30":"10:30" ],
      };
    });
    return b;
  });
  const isBooked = (proId,date,time)=> !!(bookings[proId] && bookings[proId][date] && bookings[proId][date].includes(time));
  const addBooking = (proId,date,time)=> setBookings(b=>{
    const pd=b[proId]||{}; const day=pd[date]||[];
    if(day.includes(time)) return b;
    return {...b,[proId]:{...pd,[date]:[...day,time]}};
  });
  const removeBooking = (proId,date,time)=> setBookings(b=>{
    const pd=b[proId]||{}; const day=(pd[date]||[]).filter(t=>t!==time);
    return {...b,[proId]:{...pd,[date]:day}};
  });

  // Il cliente NON conferma da solo: invia una RICHIESTA al professionista.
  // L'appuntamento resta "in attesa" e non entra nell'agenda del pro finché non viene accettato.
  const requestBooking = (proId, selDate, time, svc)=>{
    const pro=ALL_PROS.find(p=>p.id===proId);
    const dateLabel = typeof selDate==="string" ? selDate : selDate.label;
    const dateKey   = typeof selDate==="string" ? selDate : (selDate.key||selDate.label);
    const myApptId = Date.now();
    // lato CLIENTE: appuntamento in attesa di conferma
    setMyAppts(prev=>[{id:myApptId,pro:pro?pro.name:"",service:svc?svc.name:"Servizio",date:dateLabel,dateKey,time,price:svc?svc.price:0,status:"in attesa",proObj:pro},...prev]);
    addBooking(proId,dateLabel,time); // riserva lo slot tentativamente
    // invia la richiesta nella chat col professionista
    let conv = conversations.find(c=>c.proId===proId);
    let convId;
    if(!conv){ convId = myApptId+1; setConversations(p=>[{id:convId,proId,clientName:user?.name||"Cliente",messages:[]},...p]); }
    else convId = conv.id;
    sendMessage(convId,{from:"client",type:"request",_dedup:myApptId+""+Math.random(),
      request:{status:"pending",service:svc?.name||"Servizio",serviceId:svc?.id,min:svc?.min||0,price:svc?.price||0,dateLabel,dateKey,time,myApptId}});
  };

  // Il PRO accetta la richiesta → SOLO ora entra in agenda (confermato) e il cliente è confermato
  const acceptRequest = (convId,msgId)=>{
    const conv = conversations.find(c=>c.id===convId); if(!conv) return;
    const msg = conv.messages.find(m=>m.id===msgId); if(!msg||msg.type!=="request") return;
    const r = msg.request;
    setConversations(p=>p.map(c=>c.id===convId ? {...c,messages:[
      ...c.messages.map(m=>m.id===msgId?{...m,request:{...m.request,status:"accepted"}}:m),
      {id:Date.now(),from:"pro",type:"text",text:`Confermato! Ci vediamo ${r.dateLabel} alle ${r.time} ✨`,time:nowTime()},
    ]} : c));
    // lato CLIENTE: da "in attesa" a "confermato"
    setMyAppts(p=>p.map(a=>a.id===r.myApptId?{...a,status:"confermato"}:a));
    // lato PRO: crea (o riusa) cliente e servizio, poi aggiungi l'appuntamento all'agenda
    const existCl = clients.find(c=>c.name===conv.clientName);
    const clientId = existCl ? existCl.id : Date.now()+2;
    if(!existCl) setClients(p=>[...p,{id:clientId,name:conv.clientName,phone:"",visits:0,lastVisit:"Oggi",totalSpent:0,note:"Prenotazione via app",rating:0}]);
    const existSvc = services.find(s=>s.name===r.service);
    const serviceId = existSvc ? existSvc.id : Date.now()+3;
    if(!existSvc) setServices(p=>[...p,{id:serviceId,name:r.service,price:r.price,min:r.min,active:true}]);
    setAppts(p=>[...p,{id:Date.now()+4,staffId:1,date:r.dateKey||"oggi",time:r.time,clientId,serviceId,status:"confermato",source:"app",note:"Prenotazione via app"}]);
    addBooking(conv.proId,r.dateLabel,r.time);
  };

  // Il PRO rifiuta → la richiesta decade, il cliente viene avvisato, lo slot si libera
  const declineRequest = (convId,msgId)=>{
    const conv = conversations.find(c=>c.id===convId); const msg = conv?.messages.find(m=>m.id===msgId);
    const r = msg?.request;
    setConversations(p=>p.map(c=>c.id===convId ? {...c,messages:[
      ...c.messages.map(m=>m.id===msgId?{...m,request:{...m.request,status:"declined"}}:m),
      {id:Date.now(),from:"pro",type:"text",text:`Ciao! Purtroppo non sono disponibile in quel momento 🙏 Prova con un altro orario.`,time:nowTime()},
    ]} : c));
    if(r){ setMyAppts(p=>p.map(a=>a.id===r.myApptId?{...a,status:"cancellato"}:a)); removeBooking(conv.proId,r.dateLabel,r.time); }
  };

  // All'avvio: segna come già letto tutto lo storico (il puntino apparirà solo per il nuovo)
  useEffect(()=>{
    const reads={}; let maxId=0;
    conversations.forEach(c=>{ reads[c.id]=c.messages.length; c.messages.forEach(m=>{ if(m.id>maxId) maxId=m.id; }); });
    setMsgReads(reads); setNotifSeenId(maxId);
  },[]); // solo al mount

  // Messaggi non letti dal cliente in una conversazione (messaggi del pro dopo l'ultima apertura)
  const clientUnread = (c)=>{ const seen=msgReads[c.id]??0; return c.messages.slice(seen).filter(m=>m.from==="pro").length; };
  const unreadChats = conversations.filter(c=>clientUnread(c)>0).length;
  const allNotifs = buildNotifs(conversations);
  const maxNotifId = allNotifs.reduce((m,n)=>Math.max(m,n.id),0);
  const unseenLikes = (notifs||[]).filter(n=>n.time>notifSeenTs).length;
  const unseenNotifs = allNotifs.filter(n=>n.id>notifSeenId).length + unseenLikes;
  const markConvRead = (convId,len)=> setMsgReads(r=>({...r,[convId]:len}));
  useEffect(()=>{injectFont();},[]);

  const nav = (to,data=null) => {setScreen(to);setSD(data);window.scrollTo({top:0});};

  /* ---- CHAT / OFFERTE ---- */
  const nowTime = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

  // Trova o crea una conversazione con un professionista, poi apri la chat
  const openChatWithPro = (proId,role="client") => {
    let conv = conversations.find(c=>c.proId===proId);
    if(!conv){
      conv = {id:Date.now(),proId,clientName:user?.name||"Cliente",messages:[]};
      setConversations(p=>[conv,...p]);
    }
    nav("chat",{convId:conv.id,role});
  };

  const sendMessage = (convId,msg) => {
    const msgId = Date.now() + Math.floor(Math.random()*1000);
    setConversations(p=>p.map(c=>{
      if(c.id!==convId) return c;
      // evita duplicati se la funzione viene chiamata due volte in rapida successione
      if(msg._dedup && c.messages.some(m=>m._dedup===msg._dedup)) return c;
      return {...c,messages:[...c.messages,{id:msgId,time:nowTime(),...msg}]};
    }));
  };
  const sendOffer = (convId,msg) => sendMessage(convId,msg);

  // Invia una foto ispirazione a un professionista scelto (default = autore del post)
  const sendPostToPro = (post, targetProId) => {
    const proId = targetProId || post.proId;
    let conv = conversations.find(c=>c.proId===proId);
    let convId;
    if(!conv){
      convId = Date.now();
      const newConv = {id:convId,proId,clientName:user?.name||"Cliente",messages:[]};
      setConversations(p=>[newConv,...p]);
    } else convId = conv.id;
    sendMessage(convId,{from:"client",type:"photo",img:post.img,text:"Ciao! Vorrei un look simile a questo 😍 Saresti disponibile a farlo?",_dedup:Date.now()+""+Math.random()});
    setSharePost(null);
    nav("chat",{convId,role:"client"});
  };

  const declineOffer = (convId,msgId) => {
    setConversations(p=>p.map(c=>c.id===convId
      ? {...c,messages:c.messages.map(m=>m.id===msgId?{...m,offer:{...m.offer,status:"declined"}}:m)}
      : c));
  };

  // Modifica un'offerta non ancora accettata (resta in attesa)
  const editOffer = (convId,msgId,offer) => {
    setConversations(p=>p.map(c=>c.id===convId
      ? {...c,messages:c.messages.map(m=>m.id===msgId?{...m,offer:{...offer,status:"pending"}}:m)}
      : c));
  };

  // Accetta offerta → il cliente ha scelto data+slot → crea appuntamento in entrambe le agende
  const acceptOffer = (convId,msgId,date,slot) => {
    const conv = conversations.find(c=>c.id===convId);
    if(!conv) return;
    const msg = conv.messages.find(m=>m.id===msgId);
    if(!msg||msg.type!=="offer") return;
    const o = msg.offer;
    const pro = ALL_PROS.find(p=>p.id===conv.proId)||ALL_PROS[0];

    // 1) segna l'offerta accettata (salva anche data+slot scelti dal cliente)
    setConversations(p=>p.map(c=>c.id===convId
      ? {...c,messages:[
          ...c.messages.map(m=>m.id===msgId?{...m,offer:{...m.offer,status:"accepted",date,slot}}:m),
          {id:Date.now(),from:"pro",type:"text",text:`Perfetto, è confermato! Ci vediamo ${date} alle ${slot} ✨`,time:nowTime()},
        ]}
      : c));

    // 2) appuntamento lato CLIENTE
    setMyAppts(p=>[
      {id:Date.now()+1,pro:pro.name,service:o.service,date,time:slot,price:o.price,status:"confermato",proObj:pro},
      ...p,
    ]);

    // 3) appuntamento lato PROFESSIONISTA (crea cliente + servizio al volo per l'agenda)
    const newClientId = Date.now()+2;
    const newServiceId = Date.now()+3;
    setClients(p=>p.some(c=>c.name===conv.clientName)?p:[...p,{id:newClientId,name:conv.clientName,phone:"",visits:1,lastVisit:"Oggi",totalSpent:o.price,note:"Accordo da chat",rating:0}]);
    setServices(p=>[...p,{id:newServiceId,name:o.service,price:o.price,min:o.min,active:true}]);
    setAppts(p=>[...p,{id:Date.now()+4,staffId:1,date,time:slot,clientId:newClientId,serviceId:newServiceId,status:"confermato",source:"app",note:"Accordo su misura via chat"}]);

    // 4) segna lo slot come occupato → non più disponibile per altri
    addBooking(conv.proId,date,slot);
  };

  const handleAuth = ({name,type}) => {
    setUser({name,type});setMode(type==="pro"?"pro":"cliente");
    if(type==="pro"){ setAccent("nero"); setShowBetaWelcome(true); nav("pro_agenda"); }
    else { setAccent("nero"); nav("cl_home"); }
  };

  // ── Autenticazione reale con Supabase ──
  const [authBusy,setAuthBusy] = useState(false);
  const [authErr,setAuthErr] = useState("");
  const [authInfo,setAuthInfo] = useState("");
  const [bootDone,setBootDone] = useState(false);
  const [profilePhoto,setProfilePhoto] = useState(()=>{ try{return localStorage.getItem("ba-cl-photo")||"";}catch(e){return "";} });

  // Carica il profilo (foto/nome) dal database — solo se non c'è già una foto locale
  const loadProfile = async (sb,uid) => {
    try {
      const { data } = await sb.from("profiles").select("avatar_url,nome,username,business_name,business_username").eq("id",uid).maybeSingle();
      if(data){
        if(data.avatar_url){
          setProfilePhoto(prev=>prev|| data.avatar_url);
          try{ if(!localStorage.getItem("ba-cl-photo")) localStorage.setItem("ba-cl-photo",data.avatar_url); }catch(e){}
        }
        // idrata l'identità dal DB (fonte di verità cross-dispositivo); i null non sovrascrivono
        setUser(u=> u ? {
          ...u,
          name: data.nome || u.name,
          username: data.username || u.username,
          handle: data.username || u.handle,
          bizName: data.business_name || u.bizName,
          bizUsername: data.business_username || u.bizUsername,
        } : u);
      }
    } catch(e){}
  };
  // Carica una foto profilo su Supabase Storage e salva l'URL nel profilo (background, per cross-dispositivo)
  const saveProfilePhoto = async (uid,file) => {
    if(!uid) throw new Error("no uid");
    const sb = await getSupabase();
    const ext = (file.type&&file.type.split("/")[1])||"jpg";
    const path = `${uid}/avatar_${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type||"image/jpeg"});
    if(error) throw error;
    const { data:pub } = sb.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    await sb.from("profiles").update({avatar_url:url}).eq("id",uid);
    return url; // NON sovrascrivo l'anteprima locale
  };

  // Carica i post dal database e li UNISCE al feed locale (senza mai cancellare i post locali)
  const loadPosts = async (sb) => {
    try {
      const { data } = await sb.from("posts").select("*").order("created_at",{ascending:false});
      if(data && data.length){
        const mapped = data.map(r=>({
          id:r.id, remote:true, img:r.image_url, caption:r.caption||"", cat:r.cat||"Tutti",
          tags:r.tags||[], likes:r.likes||0, comments:[], authorUid:r.user_id,
          created:r.created_at?new Date(r.created_at).getTime():Date.now(),
          author:{name:(r.handle||"utente"),handle:(r.handle||"utente"),emoji:(r.emoji||"🧑"),accent:"#8A8A8E",uid:r.user_id},
        }));
        setFeedState(prev=>{
          const existing = new Set(prev.map(p=>String(p.id)));
          const fresh = mapped.filter(m=>!existing.has(String(m.id)));   // solo quelli non già presenti
          const merged = [...fresh, ...prev];                           // aggiunge i post del DB, mantiene i locali
          persistFeed(merged);
          return merged;
        });
      }
    } catch(e){ /* tabella posts assente: resta il feed locale */ }
  };

  // Pubblica un post: carica la foto su Storage e salva la riga su Supabase
  const publishPost = async (post) => {
    setFeed(f=>[post,...f]); // ottimistico: appare subito
    try {
      const sb = await getSupabase();
      const { data:sess } = await sb.auth.getSession();
      const uid = sess && sess.session && sess.session.user && sess.session.user.id;
      if(!uid){ return; } // non loggato con Supabase: il post resta salvato in locale, senza messaggi
      let imageUrl = post.img;
      let storageOk = true, storageMsg = "";
      if(post.img && post.img.startsWith("data:")){
        const blob = await (await fetch(post.img)).blob();
        const ext = (blob.type && blob.type.split("/")[1]) || "jpg";
        const path = `posts/${uid}/${Date.now()}.${ext}`;
        const { error:upErr } = await sb.storage.from("avatars").upload(path, blob, {contentType:blob.type||"image/jpeg", upsert:true});
        if(upErr){ storageOk=false; storageMsg=upErr.message||"bucket avatars mancante"; }
        else { imageUrl = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl; }
      }
      const handle = (post.author && post.author.handle) || (user && user.name) || "utente";
      const emoji = (post.author && post.author.emoji) || "🧑";
      const { data:ins, error:insErr } = await sb.from("posts").insert({ user_id:uid, image_url:imageUrl, caption:post.caption||"", cat:post.cat||null, tags:post.tags||[], handle, emoji }).select().maybeSingle();
      if(insErr){ showToast("Non salvato nel DB: "+(insErr.message||insErr.hint||"tabella posts mancante")); return; }
      const newId = (ins && ins.id) || post.id;
      setFeed(f=>f.map(p=>p.id===post.id?{...p,id:newId,img:imageUrl,remote:true}:p));
      showToast(storageOk ? "Post salvato nel cloud ✅" : ("Post salvato (foto solo locale: "+storageMsg+")"));
    } catch(e){ showToast("Post salvato sul dispositivo. Errore cloud: "+(e&&e.message||"connessione")); }
  };

  // Elimina un post (dal feed locale e, se remoto, da Supabase)
  const deletePost = async (post) => {
    setFeed(f=>f.filter(p=>String(p.id)!==String(post.id)));
    if(post && post.remote){
      try{ const sb = await getSupabase(); await sb.from("posts").delete().eq("id",post.id); }catch(e){}
    }
  };

  // ── NOTIFICHE like/commenti ──────────────────────────────────────────
  // Carica le notifiche ricevute dall'utente corrente (destinatario = uid)
  const loadNotifs = async (sb,uid) => {
    if(!uid) return;
    try {
      const { data } = await sb.from("notifications").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(80);
      if(data){
        const mapped = data.map(r=>({
          id:r.id, type:r.type, actor:r.actor_name||"Qualcuno", text:r.text||"",
          postImg:r.post_image||null, postId:r.post_id||null,
          time:r.created_at?new Date(r.created_at).getTime():Date.now(),
        }));
        setNotifs(mapped); persistNotifs(mapped);
      }
    } catch(e){ /* tabella notifications assente: si ignora */ }
  };
  // Crea una notifica per l'AUTORE del post (non per sé stessi)
  const pushNotif = async (post,type,text) => {
    const recipient = post && (post.authorUid || (post.author && post.author.uid));
    const myUid = user && user.uid;
    if(!recipient || recipient===myUid) return;   // niente notifica sui propri post o senza autore noto
    const actor = (user && user.name) || "Qualcuno";
    try {
      const sb = await getSupabase();
      await sb.from("notifications").insert({
        user_id:recipient, actor_name:actor, type, text,
        post_id:String(post.id),
        post_image: (post.img && !String(post.img).startsWith("data:")) ? post.img : null,
      });
    } catch(e){ /* best-effort */ }
  };
  // Like con effetto notifica
  const toggleLikePost = (post) => {
    const id = post.id;
    const wasLiked = likedPosts.has(id);
    setLikedPosts(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
    if(!wasLiked) pushNotif(post,"like","ha messo like al tuo post ❤️");
  };
  // Commento con effetto notifica
  const commentPost = (post,text) => {
    setFeed(f=>f.map(p=>String(p.id)===String(post.id)?{...p,comments:[...(p.comments||[]),{id:Date.now(),by:(user&&user.name)||"Tu",text}]}:p));
    pushNotif(post,"comment","ha commentato: "+text);
  };
  // Segna le notifiche come lette
  const markNotifsSeen = () => { const t=Date.now(); setNotifSeenTs(t); try{localStorage.setItem("ba-notifseen",String(t));}catch(e){} };

  // Salva le modifiche dell'account (scope: "personal" | "business").
  // Aggiorna app + salvataggio LOCALE affidabile (sopravvive al riavvio) + Supabase best-effort.
  const saveAccount = async ({name,username,phone,city,scope="personal"}) => {
    const uid = user && user.uid;
    const uname = (username||"").toLowerCase().replace(/[^a-z0-9._]/g,"");
    const business = scope==="business";
    const oldName = business ? (user&&user.bizName) : (user&&user.name);
    const oldHandle = business ? (user&&user.bizUsername) : (user&&user.username);
    // 1) aggiorna subito l'utente in app
    setUser(u=>{ if(!u) return u;
      return business
        ? {...u, bizName:name||u.bizName, bizUsername:uname||u.bizUsername}
        : {...u, name:name||u.name, username:uname||u.username, handle:uname||u.handle};
    });
    // 2) SALVATAGGIO LOCALE (per uid): garantisce la persistenza anche senza cloud
    try{ localStorage.setItem((business?"ba-bizid-":"ba-identity-")+uid, JSON.stringify({name,username:uname,phone,city})); }catch(e){}
    // 3) aggiorna in locale gli handle/nome dei post di questo utente
    if(uname||name) setFeed(f=>f.map(p=>{
      const mine = p.author && ((uid && p.authorUid===uid) || (oldHandle && p.author.handle===oldHandle) || (oldName && p.author.name===oldName));
      return mine ? {...p, author:{...p.author, name:name||p.author.name, handle:uname||p.author.handle}} : p;
    }));
    // 4) persisti su Supabase (best-effort, con errori reali)
    try{
      const sb = await getSupabase();
      const { error:auErr } = await sb.auth.updateUser({ data: business ? { business_name:name, business_username:uname } : { name, username:uname } });
      let prErr=null;
      if(uid){
        const row = business ? { id:uid, business_name:name, business_username:uname||null } : { id:uid, nome:name, username:uname||null, telefono:phone||null };
        const r = await sb.from("profiles").upsert(row); prErr = r.error;
        if(uname) await sb.from("posts").update({ handle:uname }).eq("user_id",uid);
      }
      if(auErr||prErr) showToast("Salvato sul dispositivo. Cloud: "+((auErr||prErr).message||"errore"));
      else showToast("Profilo aggiornato ✅");
    }catch(e){ showToast("Salvato sul dispositivo (offline)."); }
  };

  // Salva/aggiorna il profilo nel database (best-effort)
  const upsertProfile = async (sb,u,extra) => {
    try {
      const md = (u.user_metadata)||{};
      await sb.from("profiles").upsert({
        id:u.id, role:(extra&&extra.role)||md.role||"cliente",
        nome:(extra&&extra.nome)||md.name||null,
        business_name:(extra&&extra.business_name)||md.business_name||null,
        telefono:(extra&&extra.telefono)||md.telefono||null,
        plan:(extra&&extra.plan)||md.plan||null,
        username:(extra&&extra.username)||md.username||null,
      });
    } catch(e){ /* la tabella potrebbe non esistere: non blocchiamo */ }
  };

  const enterAs = (appUser) => {
    // Unisci le identità salvate in locale (sopravvivono al riavvio anche senza cloud), per uid
    let m = {...appUser};
    try{ const s=JSON.parse(localStorage.getItem("ba-identity-"+appUser.uid)||"null"); if(s){ if(s.name)m.name=s.name; if(s.username){m.username=s.username;m.handle=s.username;} } }catch(e){}
    try{ const b=JSON.parse(localStorage.getItem("ba-bizid-"+appUser.uid)||"null"); if(b){ if(b.name)m.bizName=b.name; if(b.username)m.bizUsername=b.username; } }catch(e){}
    setUser(m); setMode(appUser.type==="pro"?"pro":"cliente");
    if(appUser.type==="pro"){ setAccent("nero"); nav("pro_agenda"); }
    else { setAccent("nero"); nav("cl_home"); }
  };

  // Ripristina la sessione all'avvio
  useEffect(()=>{
    let sub=null;
    getSupabase().then(async sb=>{
      const { data } = await sb.auth.getSession();
      if(data && data.session && data.session.user){ lastUidRef.current=data.session.user.id; enterAs(userFromSb(data.session.user)); loadProfile(sb,data.session.user.id); loadNotifs(sb,data.session.user.id); }
      loadPosts(sb);
      const r = sb.auth.onAuthStateChange((ev,session)=>{
        if(!(session && session.user)) return;
        // Rientra/naviga SOLO quando cambia davvero l'utente loggato (nuovo login).
        // NON su USER_UPDATED / TOKEN_REFRESHED / refocus scheda: altrimenti salvare
        // l'account ti riporterebbe alla home o alla modalità pro.
        if(session.user.id !== lastUidRef.current){
          lastUidRef.current = session.user.id;
          enterAs(userFromSb(session.user)); loadProfile(sb,session.user.id); loadNotifs(sb,session.user.id);
        }
      });
      sub = r && r.data && r.data.subscription;
      setBootDone(true);
    }).catch(()=>setBootDone(true));
    return ()=>{ try{ sub && sub.unsubscribe(); }catch(e){} };
  },[]);

  const onSignup = async ({email,password,role,name,extra}) => {
    setAuthErr(""); setAuthInfo(""); setAuthBusy(true);
    try{
      const sb = await getSupabase();
      const meta = { role, name, ...(extra||{}) };
      const { data, error } = await sb.auth.signUp({ email:email.trim(), password, options:{ data:meta } });
      if(error){ setAuthErr(error.message||"Errore durante la registrazione."); return; }
      if(data.session && data.session.user){
        await upsertProfile(sb, data.session.user, {role, nome:name, ...(extra||{})});
        enterAs(userFromSb(data.session.user)); loadProfile(sb,data.session.user.id);
      } else {
        // Email di conferma attiva: nessuna sessione immediata
        setAuthInfo("Ti abbiamo inviato un'email di conferma. Confermala e poi accedi.");
      }
    } catch(e){ setAuthErr("Connessione al database non riuscita. Riprova."); }
    finally{ setAuthBusy(false); }
  };

  const onLogin = async ({email,password}) => {
    setAuthErr(""); setAuthInfo(""); setAuthBusy(true);
    try{
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email:email.trim(), password });
      if(error){ setAuthErr(error.message==="Invalid login credentials"?"Email o password non corretti.":(error.message||"Accesso non riuscito.")); return; }
      if(data.session && data.session.user){ enterAs(userFromSb(data.session.user)); loadProfile(sb,data.session.user.id); }
    } catch(e){ setAuthErr("Connessione al database non riuscita. Riprova."); }
    finally{ setAuthBusy(false); }
  };

  const doLogout = async () => {
    try{ const sb = await getSupabase(); await sb.auth.signOut(); }catch(e){}
    lastUidRef.current=null; setUser(null); nav("cl_home");
  };

  const switchMode = () => {
    const next = mode==="cliente"?"pro":"cliente";
    setMode(next);nav(next==="pro"?"pro_agenda":"cl_home");
  };

  if(!user) return <W><LoginScreen onAuth={handleAuth} onSignup={onSignup} onLogin={onLogin} authBusy={authBusy} authErr={authErr} authInfo={authInfo} clearAuthMsg={()=>{setAuthErr("");setAuthInfo("");}}/></W>;

  const render = () => {
    if(screen==="cl_home")       return <ClHome nav={nav} favorites={favorites} setFavorites={setFavorites} myAppts={myAppts} conversations={conversations} user={user} avatarConfig={avatarConfig} unreadChats={unreadChats} unseenNotifs={unseenNotifs}/>;
    if(screen==="cl_explore")    return <ClExplore nav={nav} user={user} feed={feed} setFeed={setFeed} onPublishPost={publishPost} onDeletePost={deletePost} onLikePost={toggleLikePost} onCommentPost={commentPost} likedPosts={likedPosts} setLikedPosts={setLikedPosts} savedPosts={savedPosts} setSavedPosts={setSavedPosts} onSendPost={(post)=>setSharePost(post)}/>;
    if(screen==="cl_preferiti")  return <ClPreferiti nav={nav} favorites={favorites} setFavorites={setFavorites}/>;
    if(screen==="cl_pro")        return <ClPro pro={sData} nav={nav} favorites={favorites} setFavorites={setFavorites} following={following} setFollowing={setFollowing} onMessage={()=>openChatWithPro(sData.id,"client")}/>;
    if(screen==="cl_prenota")    return <ClPrenota data={sData} nav={nav} isBooked={isBooked} onBook={requestBooking}/>;
    if(screen==="cl_appts")      return <ClAppts nav={nav} allAppts={myAppts} setAllAppts={setMyAppts}/>;
    if(screen==="cl_notifiche")  return <NotificheScreen conversations={conversations} nav={nav} notifSeenId={notifSeenId} likeNotifs={notifs} likeSeenTs={notifSeenTs} onOpen={()=>{setNotifSeenId(maxNotifId);markNotifsSeen();}}/>;
    if(screen==="cl_chats")      return <ChatList conversations={conversations} role="client" nav={nav} unreadFor={clientUnread}/>;
    if(screen==="pro_chats")     return <ChatList conversations={conversations} role="pro" nav={nav}/>;
    if(screen==="chat"){
      const conv = conversations.find(c=>c.id===sData?.convId);
      if(!conv) return <ChatList conversations={conversations} role={sData?.role||"client"} nav={nav}/>;
      return <ChatScreen conv={conv} role={sData?.role||"client"} nav={nav}
        onSeen={(len)=>markConvRead(conv.id,len)} isBooked={isBooked}
        onSendMessage={sendMessage} onSendOffer={sendOffer} onEditOffer={editOffer} onAccept={acceptOffer} onDecline={declineOffer}
        onAcceptRequest={acceptRequest} onDeclineRequest={declineRequest}/>;
    }
    if(screen==="cl_profilo")    return <ClProfilo user={user} onSwitch={switchMode} nav={nav} feed={feed} setFeed={setFeed} onDeletePost={deletePost} onLikePost={toggleLikePost} onCommentPost={commentPost} onSaveAccount={saveAccount} favorites={favorites} setFavorites={setFavorites} following={following} setFollowing={setFollowing} likedPosts={likedPosts} setLikedPosts={setLikedPosts} onLogout={doLogout} accent={accent} setAccent={setAccent} avatarConfig={avatarConfig} photo={profilePhoto} onSavePhoto={(file)=>saveProfilePhoto(user?.uid,file)}/>;
    if(screen==="pro_agenda")    return <ProAgenda appts={appts} setAppts={setAppts} clients={clients} setClients={setClients} services={services} staff={staff} hours={hours} nav={nav} openAdd={pendingAdd} onConsumeAdd={()=>setPendingAdd(null)} onModalOpenChange={setProAddOpen}/>;
    if(screen==="pro_clienti")   return <ProClienti clients={clients} setClients={setClients} appts={appts} services={services} nav={nav} openAdd={pendingAdd} onConsumeAdd={()=>setPendingAdd(null)} onModalOpenChange={setProAddOpen}/>;
    if(screen==="pro_cliente")   return <ProCliente client={sData} setClients={setClients} appts={appts} services={services} nav={nav}/>;
    if(screen==="pro_servizi")   return <ProServizi services={services} setServices={setServices} staff={staff} setStaff={setStaff} hours={hours} setHours={setHours} openAdd={pendingAdd} onConsumeAdd={()=>setPendingAdd(null)} onModalOpenChange={setProAddOpen}/>;
    if(screen==="pro_stats")     return <ProStats appts={appts} clients={clients} services={services} staff={staff} onSwitch={switchMode} nav={nav}/>;
    if(screen==="pro_profilo")   return <ProProfilo user={user} onSwitch={switchMode} onLogout={doLogout} accent={accent} setAccent={setAccent} nav={nav} photo={profilePhoto} onSavePhoto={(file)=>saveProfilePhoto(user?.uid,file)} onSaveAccount={saveAccount}/>;
    if(screen==="pro_piani")     return <PianiScreen nav={nav}/>;
    return null;
  };

  const fullscreen = screen==="chat";  // la chat occupa tutto lo schermo, niente bottom-nav

  return (
    <W>
      {!fullscreen && <TopBar/>}
      <div style={{paddingTop: fullscreen ? 0 : 52}}>
        {render()}
      </div>
      {!fullscreen && mode==="pro" && !proAddOpen && screen!=="pro_piani" && screen!=="pro_stats" && screen!=="pro_profilo" && <BetaBanner nav={nav}/>}
      {!fullscreen && mode==="pro" && !proAddOpen && screen!=="pro_profilo" && <ProFab nav={nav} onAction={(scr,act)=>{ setPendingAdd(act); nav(scr); }}/>}
      {!fullscreen && (screen==="cl_profilo"||screen==="pro_profilo") && <ModeSwitchPill mode={mode} onSwitch={switchMode}/>}
      {!fullscreen && (mode==="pro" ? <NavPro s={screen} nav={nav} dmDot={conversations.some(c=>c.messages.some(m=>m.from==="client"))}/> : <NavCl s={screen} nav={nav}/>)}
      {showBetaWelcome && <BetaWelcome onClose={()=>setShowBetaWelcome(false)}/>}
      {sharePost && <SharePostSheet post={sharePost} onClose={()=>setSharePost(null)} onPick={(proId)=>sendPostToPro(sharePost,proId)}/>}
      {toast && (
        <div onClick={()=>setToast("")} style={{position:"fixed",left:"50%",bottom:"calc(96px + env(safe-area-inset-bottom,0px))",transform:"translateX(-50%)",zIndex:900,maxWidth:340,width:"88%",background:"#111",color:"#fff",borderRadius:14,padding:"12px 16px",fontSize:13.5,fontWeight:600,boxShadow:"0 8px 28px rgba(0,0,0,.3)",textAlign:"center",lineHeight:1.4}}>
          {toast}
        </div>
      )}
    </W>
  );
}

/* Switch modalità flottante (stile Airbnb viaggio↔host) — sempre visibile sul profilo */
function ModeSwitchPill({mode,onSwitch}) {
  const toPro = mode==="cliente";
  return createPortal(
    <button onClick={onSwitch} style={{position:"fixed",left:"50%",bottom:"calc(94px + env(safe-area-inset-bottom,0px))",transform:"translateX(-50%)",zIndex:1200,display:"flex",alignItems:"center",gap:9,padding:"13px 22px",borderRadius:999,border:"none",cursor:"pointer",background:"#111111",color:"#fff",fontFamily:"inherit",fontSize:14.5,fontWeight:800,boxShadow:"0 10px 30px rgba(0,0,0,.38)",whiteSpace:"nowrap"}}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
      {toPro ? "Passa a modalità Pro" : "Passa a modalità Cliente"}
    </button>,
    document.body
  );
}

/* Pulsante flottante "+" area professionista con azioni rapide */
function ProFab({onAction,nav}) {
  const [open,setOpen] = useState(false);
  const actions = [
    {icon:"📅",label:"Nuovo appuntamento",go:()=>onAction("pro_agenda","appt")},
    {icon:"👤",label:"Nuovo cliente",go:()=>onAction("pro_clienti","client")},
    {icon:"⏸️",label:"Blocca orario",go:()=>onAction("pro_agenda","block")},
    {icon:"🏖️",label:"Inserisci ferie",go:()=>onAction("pro_agenda","block")},
    {icon:"🛍️",label:"Nuovo servizio",go:()=>onAction("pro_servizi","service")},
    {icon:"💼",label:"Crea offerta in chat",go:()=>nav("pro_chats")},
  ];
  return (
    <>
      <button onClick={()=>setOpen(true)} aria-label="Aggiungi" style={{position:"fixed",right:18,bottom:"calc(84px + env(safe-area-inset-bottom,0px))",zIndex:250,width:58,height:58,borderRadius:"50%",border:"none",cursor:"pointer",background:"#111111",color:"#fff",boxShadow:"0 8px 24px rgba(0,0,0,.28)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      {open && (
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:400,display:"flex",alignItems:"flex-end",backdropFilter:"blur(3px)"}}>
          <div onClick={e=>e.stopPropagation()} className="ba-pop" style={{background:"#fff",borderRadius:"26px 26px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"16px 16px 34px"}}>
            <div style={{width:40,height:4,borderRadius:99,background:"#E5E5EA",margin:"0 auto 14px"}}/>
            <p style={{fontSize:17,fontWeight:900,color:"#111",margin:"0 0 12px 4px",letterSpacing:"-.02em"}}>Cosa vuoi creare?</p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {actions.map((a,i)=>(
                <button key={i} onClick={()=>{setOpen(false);a.go();}} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 14px",borderRadius:16,border:"1px solid #F0F0F2",background:"rgba(255,255,255,.9)",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                  <span style={{fontSize:22,width:30,textAlign:"center"}}>{a.icon}</span>
                  <span style={{fontSize:15,fontWeight:700,color:"#111"}}>{a.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8C8CE" strokeWidth="2.4" strokeLinecap="round" style={{marginLeft:"auto"}}><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function W({children}) {
  return <div className="bg-alive" style={{maxWidth:430,margin:"0 auto",minHeight:"100dvh",fontFamily:"'Plus Jakarta Sans',-apple-system,system-ui,sans-serif",fontWeight:500,WebkitFontSmoothing:"antialiased"}}>{children}</div>;
}
