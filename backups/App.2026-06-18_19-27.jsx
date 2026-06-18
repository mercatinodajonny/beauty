import { useState, useEffect, useMemo, useRef } from "react";

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

const TILE_LAYERS = {
  light: {url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'},
  dark: {url:"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'},
};

const proPinIcon = (L,pro) => L.divIcon({
  className:"",
  html:`<div style="position:relative;width:36px;height:44px;filter:drop-shadow(0 2px 5px rgba(0,0,0,.35))">
    <svg viewBox="0 0 36 44" width="36" height="44" style="position:absolute;inset:0">
      <path d="M18 0C8 0 0 8 0 18c0 12 18 26 18 26s18-14 18-26C36 8 28 0 18 0z" fill="${T.brand}"/>
    </svg>
    <div style="position:absolute;top:5px;left:5px;width:26px;height:26px;border-radius:50%;background:${pro.accent};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;">${pro.emoji}</div>
  </div>`,
  iconSize:[36,44], iconAnchor:[18,44], popupAnchor:[0,-40],
});

const userDotIcon = (L) => L.divIcon({
  className:"",
  html:`<div style="width:18px;height:18px;border-radius:50%;background:${T.blue};border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25)"></div>`,
  iconSize:[18,18], iconAnchor:[9,9],
});

const searchPlaces = async (query) => {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=6&accept-language=it`);
  if (!res.ok) return [];
  return res.json();
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
  // Claymorphism: Nunito (chunky rounded) per headings + body
  l.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap";
  document.head.appendChild(l);
  const s = document.createElement("style");
  s.id = "app-style-rules";
  s.textContent = `
    h1,h2{font-family:'Nunito',sans-serif !important;font-weight:900;letter-spacing:-.01em}
    .ba-serif{font-family:'Nunito',sans-serif;font-weight:800}
    /* CLAYMORPHISM — superfici "gonfie": ombra esterna morbida + highlight e ombra interne (tinta neutra warm) */
    .clay{box-shadow:7px 7px 18px rgba(120,108,86,.16), -6px -6px 14px rgba(255,255,255,.9), inset 2px 2px 4px rgba(255,255,255,.7), inset -3px -3px 7px rgba(120,108,86,.09);}
    .clay-inset{box-shadow:inset 4px 4px 9px rgba(120,108,86,.15), inset -4px -4px 9px rgba(255,255,255,.9);}
    .clay-btn{box-shadow:0 9px 20px rgba(249,115,22,.34), inset 2px 2px 5px rgba(255,255,255,.45), inset -3px -4px 8px rgba(180,83,9,.42);}
    .clay-soft{box-shadow:5px 5px 13px rgba(120,108,86,.13), -4px -4px 11px rgba(255,255,255,.88);}
    @keyframes baRise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes baFade{from{opacity:0}to{opacity:1}}
    .ba-rise{opacity:0;animation:baRise .55s cubic-bezier(.34,1.56,.64,1) forwards}
    .ba-fade{opacity:0;animation:baFade .6s ease forwards}
    .ba-lift{transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease}
    .ba-lift:active{transform:scale(.94)}
    button{transition:transform .15s cubic-bezier(.34,1.56,.64,1)}
    button:active{transform:scale(.95)}
    @media (prefers-reduced-motion: reduce){
      .ba-rise,.ba-fade{animation:none;opacity:1}
      .ba-lift,button{transition:none}
      button:active,.ba-lift:active{transform:none}
    }
  `;
  document.head.appendChild(s);
};

/* PALETTE "Violet & Gold" — viola profondo + oro caldo, claymorphismo */
const T = {
  ink:"#1E1040",inkMid:"#6B5FA8",inkSoft:"#B0A8D0",
  line:"#EAE8F5",surface:"#F2F0FA",white:"#FFFFFF",
  paper:"#FAF9FE",
  brand:"#5B21B6",brandDeep:"#4C1D95",brandBg:"#EDE9FF",
  gold:"#F59E0B",goldBg:"#FEF3C7",
  green:"#059669",greenBg:"#D1FAE5",
  blue:"#3B82F6",blueBg:"#DBEAFE",
  red:"#EF4444",redBg:"#FEE2E2",
  amber:"#F59E0B",amberBg:"#FEF3C7",
  purple:"#5B21B6",purpleBg:"#EDE9FF",
};

const ST = {
  confermato:{label:"Confermato",bg:"#E6F0E8",text:"#3E7C5A",bar:"#3E7C5A"},
  "in attesa":{label:"In attesa",bg:"#F6EEDD",text:"#9A6B2F",bar:"#B68A4E"},
  cancellato:{label:"Cancellato",bg:"#F8E8E4",text:"#B23A2E",bar:"#B23A2E"},
  completato:{label:"Completato",bg:"#E9F0F4",text:"#3E6F8E",bar:"#3E6F8E"},
};

const U = (kw,w=800,h=1000) => `https://source.unsplash.com/${w}x${h}/?${encodeURIComponent(kw)}`;
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
  {id:2,name:"Luca Bianchi",phone:"347 9876543",visits:8,lastVisit:"1 sett. fa",totalSpent:200,note:"Taglio classico.",rating:5},
  {id:3,name:"Sofia Verdi",phone:"",visits:3,lastVisit:"Oggi",totalSpent:270,note:"Evitare ossidanti.",rating:4},
  {id:4,name:"Giulia Ferrari",phone:"389 5554433",visits:5,lastVisit:"2 sett. fa",totalSpent:150,note:"",rating:5},
  {id:5,name:"Sara Conti",phone:"347 1122334",visits:15,lastVisit:"Ieri",totalSpent:890,note:"Allergia glutine.",rating:4},
];
const APPTS0 = [
  {id:1,staffId:1,date:"oggi",time:"09:00",clientId:1,serviceId:3,status:"completato",source:"app",note:""},
  {id:2,staffId:2,date:"oggi",time:"10:00",clientId:2,serviceId:5,status:"confermato",source:"telefono",note:"Taglio corto"},
  {id:3,staffId:1,date:"oggi",time:"11:00",clientId:3,serviceId:2,status:"confermato",source:"app",note:""},
  {id:4,staffId:3,date:"oggi",time:"12:00",clientId:4,serviceId:7,status:"in attesa",source:"whatsapp",note:"Prima visita"},
  {id:5,staffId:2,date:"oggi",time:"14:00",clientId:5,serviceId:4,status:"confermato",source:"app",note:"Allergia glutine"},
  {id:6,staffId:1,date:"oggi",time:"16:00",clientId:1,serviceId:3,status:"in attesa",source:"passaparola",note:""},
  {id:8,staffId:1,date:"ieri",time:"09:30",clientId:2,serviceId:2,status:"completato",source:"app",note:""},
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

const ALL_CITIES = ["Imperia","Milano","Roma","Torino","Bologna","Genova","Sanremo","Savona"];

const CAT_LIST = [
  {id:"barbiere",    emoji:"💈",label:"Barbiere",    color:"#5B21B6"},
  {id:"parrucchiere",emoji:"💇",label:"Parrucchiere",color:"#7C3AED"},
  {id:"nail_artist", emoji:"💅",label:"Unghie",      color:"#F59E0B"},
  {id:"estetista",   emoji:"🧖",label:"Estetica",    color:"#059669"},
  {id:"laser",       emoji:"✨",label:"Laser",       color:"#3B82F6"},
  {id:"tatuatore",   emoji:"🖋",label:"Tattoo",      color:"#1E1040"},
  {id:"ciglia",      emoji:"👁",label:"Ciglia",      color:"#DB2777"},
  {id:"makeup",      emoji:"💄",label:"Make-up",     color:"#F59E0B"},
  {id:"massaggio",   emoji:"💆",label:"Massaggi",    color:"#059669"},
];

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
  <button onClick={onClick} disabled={disabled} className={disabled?"":(variant==="dark"?"clay-btn":"clay-soft")} style={{width:"100%",padding:"17px 0",borderRadius:20,border:"none",cursor:disabled?"default":"pointer",fontSize:16,fontWeight:800,background:variant==="dark"?T.brand:T.white,color:variant==="dark"?T.white:T.ink,opacity:disabled?.4:1,fontFamily:"inherit",...style}}>{label}</button>
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
const Modal = ({title,onClose,children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:300,display:"flex",alignItems:"flex-end"}}>
    <div style={{background:T.paper,borderRadius:"32px 32px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"20px 20px 44px",maxHeight:"90dvh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontSize:18,fontWeight:900,color:T.ink,margin:0}}>{title}</h2>
        <button onClick={onClose} className="clay-soft" style={{background:T.white,border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:15,color:T.inkMid}}>x</button>
      </div>
      {children}
    </div>
  </div>
);
const Photo = ({src,style}) => {
  const [e,sE] = useState(false);
  return e||!src
    ? <div style={{background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",...style}}><LogoMark size={32} color="rgba(255,255,255,.95)"/></div>
    : <img src={src} onError={()=>sE(true)} style={{objectFit:"cover",display:"block",...style}} alt=""/>;
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
  prosRef.current = pros;

  const renderMarkers = (L) => {
    if (!clusterRef.current) return;
    clusterRef.current.clearLayers();
    prosRef.current.forEach(pro => {
      const marker = L.marker([pro.lat,pro.lng], {icon:proPinIcon(L,pro)});
      marker.bindTooltip(`${pro.emoji} <b>${pro.name}</b><br/>${pro.distKm.toFixed(1)} km`, {direction:"top",offset:[0,-38]});
      marker.on("click", () => onSelectPro(pro));
      clusterRef.current.addLayer(marker);
    });
  };

  // Crea la mappa una sola volta
  useEffect(() => {
    let cancelled = false;
    loadMarkerCluster().then(L => {
      if (cancelled || !ref.current) return;
      const map = L.map(ref.current, {zoomControl:true, attributionControl:true}).setView([center.lat,center.lng], 12);
      mapRef.current = map;
      const tiles = dark ? TILE_LAYERS.dark : TILE_LAYERS.light;
      tileRef.current = L.tileLayer(tiles.url, {maxZoom:19, attribution:tiles.attribution}).addTo(map);
      clusterRef.current = L.markerClusterGroup({
        maxClusterRadius:50,
        iconCreateFunction: cluster => L.divIcon({
          html:`<div style="background:${T.brand};color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;font-family:inherit;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${cluster.getChildCount()}</div>`,
          className:"", iconSize:[40,40],
        }),
      }).addTo(map);
      renderMarkers(L);
      userMarkerRef.current = L.marker([center.lat,center.lng], {icon:userDotIcon(L), zIndexOffset:1000, interactive:false}).addTo(map);
      map.on("moveend", () => { const c = map.getCenter(); onMapMove && onMapMove({lat:c.lat,lng:c.lng}); });
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
      tileRef.current = L.tileLayer(tiles.url, {maxZoom:19, attribution:tiles.attribution});
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

  return <div ref={ref} style={{height,width:"100%",background:"#E8F0E8"}}/>;
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
        <div style={{display:"flex",background:T.surface,borderRadius:12,padding:3,gap:2,marginBottom:12}}>
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
          <div style={{width:64,height:64,borderRadius:18,background:`${catColor}1A`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><CatIcon id={catId} size={30} color={catColor}/></div>
          <p style={{fontSize:17,fontWeight:700,color:T.ink,marginBottom:6}}>Nessun professionista trovato</p>
          <button onClick={()=>setRadius(Infinity)} style={{padding:"12px 24px",borderRadius:12,border:"none",background:T.brand,color:T.white,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Rimuovi il limite di distanza</button>
        </div>
      ) : viewMode==="lista" ? (
        <div style={{padding:"4px 20px 0",display:"flex",flexDirection:"column",gap:10}}>
          <p style={{fontSize:11,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:.8,margin:"6px 0 0"}}>{pros.length} risultati</p>
          {pros.map(pro => (
            <div key={pro.id} onClick={()=>onSelectPro(pro)} className="clay ba-lift" style={{background:T.white,borderRadius:22,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:13}}>
              <div style={{width:50,height:50,borderRadius:17,background:`${pro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0,position:"relative",boxShadow:`inset 2px 2px 4px ${pro.accent}33, inset -2px -2px 4px rgba(255,255,255,.7)`}}>
                {pro.emoji}
                {pro.verified && <div style={{position:"absolute",bottom:-2,right:-2,width:15,height:15,borderRadius:"50%",background:T.green,border:`2.5px solid ${T.white}`}}/>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:15,fontWeight:800,color:T.ink,margin:"0 0 2px"}}>{pro.name}</p>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <span style={{color:T.gold,fontSize:12}}>{"★".repeat(Math.floor(pro.rating))}</span>
                  <span style={{color:T.inkSoft,fontSize:11}}>({pro.reviews}) · {pro.distKm.toFixed(1)} km</span>
                </div>
                <p style={{fontSize:11,color:T.inkSoft,margin:0}}>Prima disp. {pro.slots[0]} · Da {Math.min(...pro.services.map(s=>s.price))}€</p>
              </div>
              <button onClick={e=>{e.stopPropagation();onBook(pro);}} className="clay-btn" style={{padding:"10px 15px",borderRadius:15,border:"none",background:T.brand,color:T.white,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Prenota</button>
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
              <div style={{background:T.white,borderRadius:18,padding:"16px",boxShadow:"0 10px 30px rgba(0,0,0,.25)",display:"flex",gap:13,alignItems:"center"}}>
                <div style={{width:58,height:58,borderRadius:15,background:`${selectedPro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{selectedPro.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:15,fontWeight:700,color:T.ink,margin:"0 0 2px"}}>{selectedPro.name}</p>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{color:T.gold,fontSize:12}}>{"★".repeat(Math.floor(selectedPro.rating))}</span>
                    <span style={{color:T.inkSoft,fontSize:11}}>({selectedPro.reviews}) · {selectedPro.distKm.toFixed(1)} km</span>
                  </div>
                  <p style={{fontSize:11,color:T.inkSoft,margin:0}}>Prima disponibilità: {selectedPro.slots[0]}</p>
                </div>
                <button onClick={()=>setSelectedPro(null)} style={{position:"absolute",top:8,right:8,background:T.surface,border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:12}}>x</button>
              </div>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>onSelectPro(selectedPro)} style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:T.white,color:T.ink,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(0,0,0,.15)"}}>Profilo</button>
                <button onClick={()=>onBook(selectedPro)} style={{flex:2,padding:"12px 0",borderRadius:12,border:"none",background:T.brand,color:T.white,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(0,0,0,.25)"}}>Prenota</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ICONS */
const IH = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.ink:"none"} stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
const IC = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" fill={a?T.ink:"none"}/></svg>;
const IK = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.3" fill={a?T.ink:T.inkSoft}/></svg>;
const IP = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IHeart = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a?"#E91E8C":"none"} stroke={a?"#E91E8C":T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const IU = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
const IS = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a?T.ink:"none"} stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const ICS = ({a}) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?T.ink:T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>;
const IPlus = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;

/* LOGO — forbici (SVG custom, niente emoji) */
const LogoMark = ({size=22,color="#fff"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/>
    <line x1="20" y1="4" x2="8.5" y2="15.5"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="8.5" y1="8.5" x2="12" y2="12"/>
  </svg>
);

/* ICONE CATEGORIA — line-art SVG custom per ciascun servizio */
const CAT_PATHS = {
  barbiere:    <><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M8 8l8-3M8 13l8-3M8 18l8-3"/></>,
  parrucchiere:<><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><line x1="20" y1="4" x2="8.4" y2="15.6"/><line x1="14.6" y1="14.6" x2="20" y2="20"/><line x1="8.4" y1="8.4" x2="12" y2="12"/></>,
  nail_artist: <><path d="M10 3h4v10a2 2 0 0 1-4 0z"/><path d="M9 13h6v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></>,
  estetista:   <><path d="M12 21c-4-2-7-5-7-9 2 0 4 .8 5 2 .2-2 1-4 2-6 1 2 1.8 4 2 6 1-1.2 3-2 5-2 0 4-3 7-7 9z"/></>,
  laser:       <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/><circle cx="12" cy="12" r="2.2"/></>,
  tatuatore:   <><path d="M14 4l6 6-9 9-4 1 1-4z"/><line x1="13" y1="5" x2="19" y2="11"/></>,
  ciglia:      <><path d="M3 12s3.5-6 9-6 9 6 9 6"/><path d="M12 6v-3M6.5 7L5 4.5M17.5 7L19 4.5"/><circle cx="12" cy="12" r="2.4"/></>,
  makeup:      <><rect x="9" y="9" width="6" height="12" rx="1.5"/><path d="M10 9V5.5a2 2 0 0 1 4 0V9"/></>,
  massaggio:   <><circle cx="12" cy="6" r="2.4"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/><path d="M3 10c1.5 1 2.5 1 4 0M17 10c1.5 1 2.5 1 4 0"/></>,
};
const CatIcon = ({id,size=24,color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {CAT_PATHS[id] || <circle cx="12" cy="12" r="8"/>}
  </svg>
);

/* NAV */
function NavBar({items,s,nav,labelSize=10}) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const lastId = useRef(null);
  const N = items.length;

  // pill: posizione frazionaria 0..(N-1) per animazione fluida
  const [pill,setPill] = useState(() => Math.max(0,items.findIndex(it=>it.id===s)));
  const [live,setLive] = useState(false); // true durante drag → no transition

  // Sincronizza la pillola quando cambia tab dall'esterno
  useEffect(()=>{
    if(!dragging.current){
      const idx=items.findIndex(it=>it.id===s);
      if(idx>=0){setLive(false);setPill(idx);}
    }
  },[s]);

  const fracFromX = (clientX) => {
    if(!ref.current) return 0;
    const {left,width}=ref.current.getBoundingClientRect();
    const f=(clientX-left)/width*N - 0.5; // 0 = centro item 0
    return Math.max(0,Math.min(N-1,f));
  };
  const idAtPoint = (x,y) => {
    const el=document.elementFromPoint(x,y);
    const t=el&&el.closest?el.closest("[data-navid]"):null;
    return t?t.getAttribute("data-navid"):null;
  };
  const goTo = (id,frac) => {
    if(frac!==undefined) setPill(Math.max(0,Math.min(N-1,frac)));
    if(id&&id!==lastId.current){
      lastId.current=id;
      nav(id);
      if(navigator.vibrate){try{navigator.vibrate(8);}catch(e){}}
    }
  };
  const onDown = (e) => {
    dragging.current=true; setLive(true);
    lastId.current=s;
    try{ref.current.setPointerCapture(e.pointerId);}catch(err){}
    goTo(idAtPoint(e.clientX,e.clientY),fracFromX(e.clientX));
  };
  const onMove = (e) => {
    if(!dragging.current) return;
    goTo(idAtPoint(e.clientX,e.clientY),fracFromX(e.clientX));
  };
  const onUp = () => {
    dragging.current=false; setLive(false);
    const idx=items.findIndex(it=>it.id===lastId.current);
    if(idx>=0) setPill(idx); // snap preciso
  };

  const pct = 100/N;
  // pillola: posizionata in base a pill frazionario
  const pillLeft = `calc(${pill*pct}% + 3px)`;
  const pillW = `calc(${pct}% - 6px)`;

  return (
    <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{position:"fixed",bottom:12,left:"50%",transform:"translateX(-50%)",
        width:"calc(100% - 24px)",maxWidth:406,background:"#5B21B6",borderRadius:26,
        display:"flex",zIndex:100,padding:"6px 4px",touchAction:"none",userSelect:"none",
        boxShadow:"0 8px 28px rgba(91,33,182,.35)",
        boxShadow:"0 4px 24px rgba(91,33,182,.14)",
        position:"fixed"}}>
      {/* Pillola scorrevole — salmone su navy */}
      <div style={{
        position:"absolute", top:6, height:"calc(100% - 12px)",
        left:pillLeft, width:pillW,
        background:"#F59E0B", borderRadius:18,
        transition:live?"none":"left .28s cubic-bezier(.34,1.56,.64,1), width .28s cubic-bezier(.34,1.56,.64,1)",
        pointerEvents:"none", zIndex:0,
      }}/>
      {items.map(({id,I,l,color}) => {
        const active=s===id;
        return (
          <div key={id} data-navid={id} onClick={()=>nav(id)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
              gap:3,padding:"9px 0 10px",borderRadius:18,cursor:"pointer",
              position:"relative",zIndex:1,WebkitTapHighlightColor:"transparent"}}>
            <div style={{pointerEvents:"none",transition:"transform .18s ease",
              transform:active?"translateY(-1px) scale(1.08)":"none"}}>
              <I a={active}/>
            </div>
            <span style={{fontSize:labelSize,fontWeight:active?800:600,
              color:active?"#5B21B6":"rgba(255,255,255,.6)",pointerEvents:"none",
              transition:"color .22s ease"}}>{l}</span>
          </div>
        );
      })}
    </div>
  );
}
function NavCl({s,nav}) {
  return <NavBar s={s} nav={nav} labelSize={9} items={[
    {id:"cl_home",I:IH,l:"Home"},
    {id:"cl_explore",I:IC,l:"Esplora"},
    {id:"cl_preferiti",I:IHeart,l:"Preferiti",color:T.purple},
    {id:"cl_appts",I:IK,l:"Appuntamenti"},
    {id:"cl_profilo",I:IP,l:"Profilo"},
  ]}/>;
}
function NavPro({s,nav}) {
  return <NavBar s={s} nav={nav} labelSize={10} items={[
    {id:"pro_agenda",I:IK,l:"Agenda"},
    {id:"pro_clienti",I:IU,l:"Clienti"},
    {id:"pro_servizi",I:ICS,l:"Servizi"},
    {id:"pro_stats",I:IS,l:"Statistiche"},
  ]}/>;
}

/* AUTH */
function LoginScreen({onAuth}) {
  const [tp,setTp] = useState(null);
  return (
    <div style={{minHeight:"100dvh",background:T.white,display:"flex",flexDirection:"column"}}>
      {/* Top salmone con logo */}
      <div style={{background:"#F59E0B",padding:"64px 26px 36px",display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
        <div className="ba-rise" style={{width:56,height:56,borderRadius:18,background:"#5B21B6",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,boxShadow:"0 8px 20px rgba(91,33,182,.30)"}}><LogoMark size={28}/></div>
        <h1 className="ba-rise" style={{fontSize:38,fontWeight:900,color:"#5B21B6",lineHeight:1.05,margin:"0 0 8px",animationDelay:".06s"}}>BeautyApp</h1>
        <p className="ba-rise" style={{fontSize:15,color:"rgba(30,16,64,.75)",margin:0,animationDelay:".12s",fontWeight:600}}>La bellezza, a portata di mano.</p>
      </div>
      {/* Card scelta */}
      <div style={{flex:1,padding:"28px 26px 40px",display:"flex",flexDirection:"column",gap:14}}>
        <p style={{fontSize:13,fontWeight:700,color:T.inkSoft,textTransform:"uppercase",letterSpacing:1,margin:"0 0 4px"}}>Come vuoi entrare?</p>
        {[
          {id:"pro",emoji:"💼",title:"Professionista",desc:"Agenda, clienti, servizi, statistiche"},
          {id:"cliente",emoji:"🛋️",title:"Cliente",desc:"Cerca, esplora, prenota, recensisci"},
        ].map((opt,oi) => (
          <div key={opt.id} onClick={()=>setTp(opt.id)} className="ba-rise ba-lift"
            style={{borderRadius:20,padding:"18px",cursor:"pointer",
              background:tp===opt.id?"#5B21B6":T.white,
              boxShadow:tp===opt.id?"0 8px 24px rgba(91,33,182,.30)":"0 2px 12px rgba(0,0,0,.07)",
              border:tp===opt.id?"none":`1.5px solid ${T.line}`,
              animationDelay:`${.16+oi*.07}s`,transition:"all .2s ease"}}>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <div style={{width:48,height:48,borderRadius:14,
                background:tp===opt.id?"rgba(255,255,255,.15)":"#F59E0B",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{opt.emoji}</div>
              <div>
                <p style={{fontSize:16,fontWeight:800,color:tp===opt.id?"#fff":T.ink,margin:"0 0 3px"}}>{opt.title}</p>
                <p style={{fontSize:13,color:tp===opt.id?"rgba(255,255,255,.75)":T.inkMid,margin:0,fontWeight:500}}>{opt.desc}</p>
              </div>
            </div>
          </div>
        ))}
        <div style={{marginTop:8}}>
          <button disabled={!tp} onClick={()=>onAuth({name:tp==="pro"?"Salon Elite":"Alessio",type:tp})}
            style={{width:"100%",padding:"17px 0",borderRadius:18,border:"none",
              background:tp?"#F59E0B":"#E0E0E0",color:tp?"#5B21B6":"#aaa",
              fontSize:16,fontWeight:900,cursor:tp?"pointer":"default",fontFamily:"inherit",
              boxShadow:tp?"0 8px 22px rgba(91,33,182,.30)":"none",transition:"all .2s ease"}}>
            Entra nell'app
          </button>
        </div>
      </div>
    </div>
  );
}

/* HOME CLIENTE */
function ClHome({nav,favorites,setFavorites,myAppts=[]}) {
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

  const filteredPros = selCat
    ? prosFromSearchCenter.filter(p=>p.catId===selCat && p.distKm<=radius).sort((a,b)=>a.distKm-b.distKm)
    : [];

  const openCategory = (catId) => { setSelCat(catId); setSearchCenter(userCoords); setViewMode("lista"); setSelectedPro(null); };

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
    setGeoStatus("loading");
    const request = () => navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {lat:pos.coords.latitude,lng:pos.coords.longitude};
        setUserCoords(coords);setSearchCenter(coords);
        setCity("La mia posizione");
        setGeoStatus(null);setShowCity(false);setSelCat(null);
      },
      (err) => setGeoStatus(err.code===1?"denied":"error"),
      {enableHighAccuracy:true,timeout:10000}
    );
    if (navigator.permissions?.query) {
      navigator.permissions.query({name:"geolocation"})
        .then(status => { if (status.state==="denied") setGeoStatus("denied"); else request(); })
        .catch(request);
    } else request();
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

  return (
    <div style={{paddingBottom:90,background:T.surface,minHeight:"100dvh"}}>

      {/* Header salmone — come Beauty Star: sfondo rosa-salmone in cima */}
      <div style={{background:"#F59E0B",paddingTop:52,paddingBottom:24,paddingLeft:20,paddingRight:20}}>
        {/* Logo + cuore */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:32,height:32,borderRadius:9,background:T.brand,display:"flex",alignItems:"center",justifyContent:"center"}}><LogoMark size={17}/></div>
            <span className="ba-serif" style={{fontSize:21,fontWeight:800,color:T.brand,letterSpacing:"-.02em"}}>BeautyApp</span>
          </div>
          <button onClick={()=>nav("cl_preferiti")} style={{width:36,height:36,borderRadius:11,background:"rgba(255,255,255,.35)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <IHeart a={false}/>
          </button>
        </div>

        {/* Saluto + ricerca */}
        <p style={{fontSize:13,fontWeight:700,color:T.brand,margin:"0 0 12px",opacity:.85}}>Ciao, cosa vuoi fare oggi? 👋</p>
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:16,padding:"13px 16px",boxShadow:"0 4px 16px rgba(91,33,182,.12)"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.2" strokeLinecap="round" style={{flexShrink:0}}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input value={q} onChange={e=>{setQ(e.target.value);setSearching(true);}} onFocus={()=>setSearching(true)}
            placeholder="Cerca parrucchiere, servizio, città..."
            style={{flex:1,border:"none",outline:"none",background:"none",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
          {q && <button onClick={()=>{setQ("");setSearching(false);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.inkSoft,padding:0}}>×</button>}
        </div>

        {/* Banner appuntamento — dentro il blocco salmone, card bianca */}
        {!(searching && q.length >= 2) && banner && (
          <div className="ba-rise ba-lift" onClick={()=>nextAppt?nav("cl_appts"):nav("cl_prenota",{pro:lastAppt.proObj})}
            style={{display:"flex",alignItems:"center",gap:14,padding:"16px 18px",borderRadius:20,cursor:"pointer",
              background:T.white,marginTop:16,boxShadow:"0 6px 20px rgba(91,33,182,.14)",animationDelay:".05s"}}>
            <div style={{width:46,height:46,borderRadius:13,background:T.brandBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {nextAppt?<><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></>:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>}
              </svg>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:10,fontWeight:700,color:"#F59E0B",margin:"0 0 2px",textTransform:"uppercase",letterSpacing:1.1}}>
                {nextAppt?"Il tuo appuntamento":"Ultimo appuntamento"}
              </p>
              <p style={{fontSize:16,fontWeight:900,color:T.ink,margin:"0 0 1px",lineHeight:1.2}}>{banner.service}</p>
              <p style={{fontSize:12,color:T.inkMid,margin:0}}>{banner.pro} · {nextAppt?`${banner.date}, ${banner.time}`:banner.date}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        )}
      </div>

      {/* Risultati ricerca */}
      {searching && q.length >= 2 && (
        <div style={{padding:"14px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <p style={{fontSize:12,color:T.inkSoft,margin:0}}>{searchResults.length} risultati per "{q}"</p>
            <button onClick={()=>{setQ("");setSearching(false);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.inkMid,fontFamily:"inherit"}}>Chiudi</button>
          </div>
          {searchResults.length === 0 && (
            <div style={{textAlign:"center",padding:"40px 0"}}>
              <p style={{fontSize:32,marginBottom:8}}>🔍</p>
              <p style={{fontSize:14,color:T.inkSoft}}>Nessun risultato. Prova con altro.</p>
            </div>
          )}
          {searchResults.map((pro,i) => (
            <div key={pro.id}>
              <div onClick={()=>{nav("cl_pro",pro);setQ("");setSearching(false);}} style={{display:"flex",gap:13,padding:"13px 0",cursor:"pointer",alignItems:"center"}}>
                <div style={{width:52,height:52,borderRadius:14,background:`${pro.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>{pro.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:15,fontWeight:700,color:T.ink,margin:"0 0 2px"}}>{pro.name}</p>
                  <p style={{fontSize:12,color:T.inkSoft,margin:"0 0 3px"}}>{pro.cat} - {pro.city}</p>
                  <span style={{color:T.gold,fontSize:12}}>{"★".repeat(Math.floor(pro.rating))}</span>
                </div>
                <button onClick={e=>{e.stopPropagation();nav("cl_prenota",{pro});}} style={{padding:"9px 14px",borderRadius:10,border:"none",background:"#F59E0B",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Prenota</button>
              </div>
              {i < searchResults.length-1 && <Div/>}
            </div>
          ))}
        </div>
      )}

      {/* Contenuto principale */}
      {!(searching && q.length >= 2) && (
        <div>
          {/* Posizione */}
          <div style={{padding:"18px 20px 10px"}}>
            <button onClick={()=>setShowCity(true)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",marginBottom:14}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{fontSize:16,fontWeight:700,color:T.ink}}>{city}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <h1 style={{fontSize:26,fontWeight:700,color:T.ink,margin:"0 0 4px",lineHeight:1.15}}>Cosa vuoi fare oggi?</h1>
            <p style={{fontSize:14,color:T.inkSoft,margin:0}}>Scegli una categoria</p>
          </div>

          {/* Passo 1: Categorie — chip piccole a scorrimento orizzontale */}
          {!selCat && (
            <>
              <div style={{display:"flex",gap:10,overflowX:"auto",padding:"2px 20px 6px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}} className="ba-noscroll">
                {CAT_LIST.map((cat,ci) => (
                  <button key={cat.id} onClick={()=>openCategory(cat.id)} className="ba-rise ba-lift" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"10px 4px",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",flexShrink:0,width:66,animationDelay:`${0.03*ci+0.06}s`}}>
                    <div style={{width:56,height:56,borderRadius:18,background:T.white,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 6px 16px rgba(0,0,0,.12), inset 1px 1px 3px rgba(255,255,255,.9)`}}><CatIcon id={cat.id} size={26} color={cat.color}/></div>
                    <span style={{fontSize:11,fontWeight:600,color:T.inkMid,textAlign:"center",lineHeight:1.1}}>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Professionisti nella tua zona */}
              <div style={{padding:"16px 20px 0"}}>
                <h2 style={{fontSize:18,fontWeight:800,color:T.ink,margin:"0 0 12px",letterSpacing:-0.3}}>Professionisti vicino a te</h2>
                {(() => {
                  const list = [...prosWithDist].sort((a,b)=>a.distKm-b.distKm);
                  if (list.length === 0) return <p style={{fontSize:14,color:T.inkSoft,padding:"20px 0"}}>Nessun professionista trovato in zona.</p>;
                  const badgeFor = (pro) => {
                    if (pro.rating >= 4.9) return {l:"Top",bg:T.amberBg,c:T.amber};
                    if (pro.reviews >= 150) return {l:"Popolare",bg:T.purpleBg,c:T.purple};
                    if (pro.verified) return {l:"Verificato",bg:T.brandBg,c:T.brandDeep};
                    return null;
                  };
                  return (
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {list.map((pro,i) => {
                        const b = badgeFor(pro);
                        return (
                          <div key={pro.id} onClick={()=>nav("cl_pro",pro)} className="ba-rise clay" style={{display:"flex",gap:13,padding:"14px",cursor:"pointer",alignItems:"center",background:T.white,borderRadius:20,animationDelay:`${0.03*i+0.1}s`}}>
                            <div style={{width:54,height:54,borderRadius:15,background:`${pro.accent}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,border:`2px solid ${pro.accent}33`}}>{pro.emoji}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:7,margin:"0 0 3px"}}>
                                <p style={{fontSize:15,fontWeight:800,color:T.ink,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pro.name}</p>
                                {b && <span style={{fontSize:10,fontWeight:800,color:b.c,background:b.bg,padding:"2px 8px",borderRadius:99,flexShrink:0,letterSpacing:.2}}>{b.l}</span>}
                              </div>
                              <p style={{fontSize:12,color:T.inkSoft,margin:"0 0 4px"}}>{pro.cat} · {pro.city} · {pro.distKm<1?`${Math.round(pro.distKm*1000)} m`:`${pro.distKm.toFixed(1)} km`}</p>
                              <span style={{color:T.gold,fontSize:12,fontWeight:700}}>★ {pro.rating} <span style={{color:T.inkSoft,fontWeight:500}}>({pro.reviews})</span></span>
                            </div>
                            <button onClick={e=>{e.stopPropagation();nav("cl_prenota",{pro});}} style={{padding:"10px 15px",borderRadius:12,border:"none",background:"#F59E0B",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Prenota</button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

        </div>
      )}

      {/* Passo 2: Browse professionisti — Lista / Mappa */}
      {selCat && !(searching && q.length >= 2) && (
        <BrowsePros
          catId={selCat}
          catLabel={CAT_LIST.find(c=>c.id===selCat)?.label}
          catColor={CAT_LIST.find(c=>c.id===selCat)?.color}
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:300,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:T.white,borderRadius:"22px 22px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"18px 20px 50px",maxHeight:"85dvh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontSize:17,fontWeight:700,color:T.ink,margin:0}}>Imposta posizione</h2>
              <button onClick={()=>{setShowCity(false);setCitySearch("");setGeoStatus(null);}} style={{background:T.surface,border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:15}}>x</button>
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
            {geoStatus==="denied" && (
              <p style={{fontSize:12,color:T.red,margin:"-8px 0 14px"}}>Permesso di localizzazione negato. Abilitalo nelle impostazioni del browser per usare questa funzione.</p>
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ESPLORA */
function ClExplore({nav}) {
  const [cat,setCat] = useState("Tutti");
  const [q,setQ] = useState("");
  const [searchMode,setSearchMode] = useState(false);
  const CATS = ["Tutti","Nail Art","Capelli","Barba"];
  const posts = cat==="Tutti" ? FEED : FEED.filter(p=>p.cat===cat);
  const accountResults = q.length >= 1
    ? ALL_PROS.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.handle.toLowerCase().includes(q.toLowerCase())||p.city.toLowerCase().includes(q.toLowerCase()))
    : ALL_PROS;

  return (
    <div style={{paddingBottom:90}}>
      <div style={{position:"sticky",top:0,zIndex:20,background:T.white,borderBottom:`1px solid ${T.line}`}}>
        <div style={{padding:"50px 14px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:8,background:T.surface,borderRadius:11,padding:"10px 12px"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setSearchMode(true)} placeholder="Cerca account, citta..." style={{flex:1,border:"none",outline:"none",background:"none",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
              {q && <button onClick={()=>setQ("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.inkSoft,padding:0}}>x</button>}
            </div>
            {searchMode && (
              <button onClick={()=>{setSearchMode(false);setQ("");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,color:T.ink,fontFamily:"inherit",flexShrink:0}}>Annulla</button>
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
          const pro = ALL_PROS.find(p=>p.id===post.proId)||ALL_PROS[0];
          return (
            <div key={post.id} style={{background:T.white,borderBottom:`1px solid ${T.line}`}}>
              <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 13px"}}>
                <div onClick={()=>nav("cl_pro",pro)} style={{cursor:"pointer"}}><Av pro={pro} size={33} fs={15}/></div>
                <div style={{flex:1,cursor:"pointer"}} onClick={()=>nav("cl_pro",pro)}>
                  <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>@{pro.handle}</p>
                  <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{pro.city} - {post.cat}</p>
                </div>
                <button onClick={()=>nav("cl_prenota",{pro})} style={{padding:"6px 12px",borderRadius:99,border:"none",background:T.brand,cursor:"pointer",fontSize:12,fontWeight:600,color:T.white,fontFamily:"inherit"}}>Prenota</button>
              </div>
              <Photo src={post.img} style={{width:"100%",aspectRatio:"4/5"}}/>
              <div style={{padding:"9px 13px 4px"}}>
                <p style={{fontSize:13,color:T.ink,margin:"0 0 3px",lineHeight:1.5}}><span style={{fontWeight:700,marginRight:3}}>@{pro.handle}</span>{post.caption}</p>
                <p style={{fontSize:11,color:"#6366F1",margin:"0 0 8px"}}>{post.tags.map(t=><span key={t} style={{marginRight:4}}>{t}</span>)}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* PREFERITI */
function ClPreferiti({nav,favorites,setFavorites}) {
  const favPros = ALL_PROS.filter(p=>favorites.has(p.id));
  return (
    <div style={{paddingBottom:90,background:T.white,minHeight:"100dvh"}}>
      <div style={{padding:"52px 20px 20px",background:"#F59E0B"}}>
        <h1 style={{fontSize:24,fontWeight:900,color:"#5B21B6",margin:"0 0 4px"}}>Preferiti</h1>
        <p style={{fontSize:13,color:"rgba(30,16,64,.70)",margin:0,fontWeight:600}}>I tuoi professionisti salvati</p>
      </div>
      {favPros.length === 0 ? (
        <div style={{textAlign:"center",padding:"80px 30px"}}>
          <p style={{fontSize:48,marginBottom:14}}>❤️</p>
          <p style={{fontSize:17,fontWeight:700,color:T.ink,marginBottom:8}}>Nessun preferito</p>
          <p style={{fontSize:14,color:T.inkSoft,marginBottom:22,lineHeight:1.6}}>Apri un profilo e tocca il cuore per salvarlo qui.</p>
          <button onClick={()=>nav("cl_home")} style={{padding:"13px 28px",borderRadius:13,border:"none",background:T.brand,color:T.white,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cerca professionisti</button>
        </div>
      ) : (
        <div style={{padding:"14px 20px"}}>
          {favPros.map(pro => (
            <div key={pro.id} className="clay" style={{background:T.white,borderRadius:22,marginBottom:16,overflow:"hidden"}}>
              <div style={{padding:"16px 16px 14px",display:"flex",alignItems:"center",gap:13,borderBottom:`1px solid ${T.line}`}}>
                {/* Avatar piccolo con solo colore di bordo/sfondo leggero */}
                <div style={{width:52,height:52,borderRadius:16,background:`${pro.accent}16`,border:`2.5px solid ${pro.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{pro.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:16,fontWeight:900,color:T.ink,margin:"0 0 3px",lineHeight:1.1}}>{pro.name}</p>
                  <p style={{fontSize:12,color:T.inkMid,margin:0,fontWeight:600}}>{pro.cat} · <span style={{color:T.gold}}>★</span> {pro.rating}</p>
                </div>
                <button onClick={()=>setFavorites(f=>{const n=new Set(f);n.delete(pro.id);return n;})} style={{background:T.surface,border:"none",borderRadius:10,width:34,height:34,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <IHeart a={true}/>
                </button>
              </div>
              <div style={{padding:"13px 16px"}}>
                <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>Disponibile oggi</p>
                <div style={{display:"flex",gap:6,marginBottom:13,flexWrap:"wrap"}}>
                  {pro.slots.slice(0,4).map(slot => (
                    <button key={slot} onClick={()=>nav("cl_prenota",{pro,preselSlot:slot})} style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${T.line}`,background:T.surface,cursor:"pointer",fontSize:13,fontWeight:700,color:T.ink,fontFamily:"inherit"}}>{slot}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>nav("cl_pro",pro)} className="clay-soft" style={{flex:1,padding:"11px 0",borderRadius:12,border:"none",background:T.surface,cursor:"pointer",fontSize:13,fontWeight:700,color:T.inkMid,fontFamily:"inherit"}}>Profilo</button>
                  <button onClick={()=>nav("cl_prenota",{pro})} style={{flex:2,padding:"11px 0",borderRadius:12,border:"none",background:T.brand,cursor:"pointer",fontSize:14,fontWeight:800,color:T.white,fontFamily:"inherit"}}>Prenota ora</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* PROFILO PRO */
function ClPro({pro,nav,favorites,setFavorites}) {
  const isFav = favorites?.has(pro.id)||false;
  const toggleFav = () => setFavorites&&setFavorites(f=>{const n=new Set(f);isFav?n.delete(pro.id):n.add(pro.id);return n;});
  const [selSvc,setSvc] = useState(null);
  const [showRev,setShowRev] = useState(false);
  const [stars,setStars] = useState(5);
  const [revText,setRevText] = useState("");
  const [reviews,setReviews] = useState([
    {name:"Marco T.",text:"Risultato perfetto!",stars:5,date:"10 giu 2026"},
    {name:"Lucia F.",text:"Professionale e puntuale.",stars:5,date:"28 mag 2026"},
  ]);
  const proPosts = FEED.filter(p=>p.proId===pro.id);
  const coverKw = {parrucchiere:"hair salon interior",barbiere:"barbershop interior",nail_artist:"nail salon beauty",estetista:"spa beauty",tatuatore:"tattoo studio"}[pro.catId]||"beauty salon";

  return (
    <div style={{paddingBottom:140}}>
      {/* Cover */}
      <div style={{position:"relative",height:170}}>
        <Photo src={U(coverKw,860,400)} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
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
          {[[proPosts.length,"post"],[pro.followers,"follower"],[pro.reviews,"rec."],[pro.rating,""]].map(([v,l],i,arr) => (
            <div key={l+i} style={{flex:1,textAlign:"center",borderRight:i<arr.length-1?`1px solid ${T.line}`:"none"}}>
              <p style={{fontSize:15,fontWeight:700,color:T.ink,margin:0}}>{i===3?"★":""}{v}</p>
              <p style={{fontSize:10,color:T.inkSoft,margin:0}}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:9}}>
          <button onClick={()=>setShowRev(true)} style={{flex:1,padding:"11px 0",borderRadius:10,border:`1.5px solid ${T.line}`,background:T.white,cursor:"pointer",fontSize:13,fontWeight:500,color:T.inkMid,fontFamily:"inherit"}}>Recensisci</button>
        </div>
      </div>

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
                  <button onClick={()=>nav("cl_prenota",{pro,service:s})} style={{width:"100%",padding:"11px 0",borderRadius:10,border:"none",background:T.brand,color:T.white,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Scegli data e orario</button>
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
      <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 32px)",maxWidth:398,zIndex:50}}>
        <button onClick={()=>nav("cl_prenota",{pro})} style={{width:"100%",padding:"17px 0",borderRadius:16,border:"none",background:T.brand,color:T.white,fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 8px 28px rgba(0,0,0,.35)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
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
function ClPrenota({data,nav}) {
  const {pro,service:preselSvc} = data;
  const [svc,setSvc] = useState(preselSvc||pro.services[0]);
  const [selDate,setSelDate] = useState(null);
  const [selTime,setSelTime] = useState(data.preselSlot||null);
  const [step,setStep] = useState(preselSvc?2:1);
  const [done,setDone] = useState(false);

  const today = new Date(2026,5,14);
  const DATES = Array.from({length:14},(_,i)=>{
    const d = new Date(today); d.setDate(today.getDate()+i);
    const DN = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
    const MN = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
    return {label:i===0?"Oggi":i===1?"Domani":`${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`,day:d.getDate(),dayName:DN[d.getDay()]};
  });
  const TIMES = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30"];

  if (done) return (
    <div style={{minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 26px",background:T.white,textAlign:"center"}}>
      <div style={{width:68,height:68,borderRadius:34,background:T.greenBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:16}}>✓</div>
      <h1 style={{fontSize:22,fontWeight:700,color:T.ink,marginBottom:8}}>Prenotazione confermata!</h1>
      <p style={{fontSize:13,color:T.inkMid,marginBottom:22,lineHeight:1.6}}>{svc.name} - {pro.name}<br/>{selDate?.label} alle {selTime}</p>
      <BigBtn label="Vedi appuntamenti" onClick={()=>nav("cl_appts")}/>
      <button onClick={()=>nav("cl_pro",pro)} style={{marginTop:9,background:"none",border:"none",cursor:"pointer",fontSize:13,color:T.inkSoft,padding:"9px 0",fontFamily:"inherit"}}>Torna al profilo</button>
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
                {TIMES.map(t => (
                  <button key={t} onClick={()=>setSelTime(t)} style={{padding:"8px 13px",borderRadius:9,border:`1.5px solid ${selTime===t?T.ink:T.line}`,background:selTime===t?T.ink:T.white,cursor:"pointer",fontSize:13,fontWeight:selTime===t?700:400,color:selTime===t?T.white:T.ink,fontFamily:"inherit"}}>{t}</button>
                ))}
              </div>
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
          <BigBtn label="Conferma prenotazione" onClick={()=>setDone(true)}/>
          <button onClick={()=>setStep(2)} style={{width:"100%",marginTop:9,background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.inkSoft,padding:"9px 0",fontFamily:"inherit"}}>Modifica data e orario</button>
        </div>
      )}
    </div>
  );
}

/* APPUNTAMENTI CLIENTE */
function ClAppts({nav,allAppts,setAllAppts}) {
  const [tab,setTab] = useState("futuri");
  const [spostaId,setSpostaId] = useState(null);
  const [newDate,setNewDate] = useState("");
  const [newTime,setNewTime] = useState("");
  const [view,setView] = useState("lista");

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
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
      <div style={{background:"#F59E0B",padding:"52px 18px 16px"}}>
        <h1 style={{fontSize:24,fontWeight:900,color:"#5B21B6",margin:"0 0 12px"}}>Appuntamenti</h1>
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
              {tab==="futuri" && <button onClick={()=>nav("cl_home")} style={{padding:"12px 24px",borderRadius:12,border:"none",background:T.brand,color:T.white,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Prenota ora</button>}
            </div>
          )}
          {shown.map(a => {
            const locked = !canModify(a);
            const isPast = a.status==="completato";
            const isCancelled = a.status==="cancellato";
            return (
              <div key={a.id} className="clay" style={{background:T.white,borderRadius:20,marginBottom:11,overflow:"hidden"}}>
                <div style={{height:5,background:ST[a.status]?.bar||T.line}}/>
                <div style={{padding:"14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                    <div><p style={{fontSize:15,fontWeight:700,color:T.ink,margin:"0 0 2px"}}>{a.service}</p><p style={{fontSize:12,color:T.inkSoft,margin:0}}>{a.pro}</p></div>
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
                      {locked && <div style={{padding:"7px 10px",background:T.amberBg,borderRadius:7,marginBottom:8,display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:13}}>⏰</span><p style={{fontSize:11,color:T.amber,margin:0}}>Non modificabile - meno di 24 ore</p></div>}
                      <div style={{display:"flex",gap:7}}>
                        <button onClick={()=>{if(!locked){setSpostaId(a.id);setNewDate(a.date);setNewTime(a.time);}}} disabled={locked} style={{flex:1,padding:"10px 0",borderRadius:9,border:`1.5px solid ${T.line}`,background:locked?T.surface:T.white,cursor:locked?"default":"pointer",fontSize:12,fontWeight:600,color:locked?T.inkSoft:T.inkMid,fontFamily:"inherit",opacity:locked?.5:1}}>Sposta</button>
                        <button onClick={()=>{if(!locked)setAllAppts(p=>p.map(x=>x.id===a.id?{...x,status:"cancellato"}:x));}} disabled={locked} style={{flex:1,padding:"10px 0",borderRadius:9,border:`1.5px solid ${locked?T.line:T.redBg}`,background:locked?T.surface:T.redBg,cursor:locked?"default":"pointer",fontSize:12,fontWeight:600,color:locked?T.inkSoft:T.red,fontFamily:"inherit",opacity:locked?.5:1}}>Cancella</button>
                      </div>
                    </>
                  )}
                  {(isPast||isCancelled) && (
                    <button onClick={()=>a.proObj&&nav("cl_prenota",{pro:a.proObj})} style={{width:"100%",padding:"11px 0",borderRadius:9,border:"none",background:T.brand,cursor:"pointer",fontSize:13,fontWeight:700,color:T.white,fontFamily:"inherit"}}>Riprenota</button>
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
                <div style={{flex:1}}><p style={{fontSize:13,fontWeight:600,color:T.ink,margin:"0 0 1px"}}>{a.service}</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>{a.pro}</p></div>
                <p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>{a.price}€</p>
              </div>
            )) : (
              <div style={{padding:"24px",textAlign:"center"}}>
                <p style={{fontSize:12,color:T.inkSoft,margin:"0 0 10px"}}>Nessun appuntamento</p>
                <button onClick={()=>nav("cl_home")} style={{padding:"8px 18px",borderRadius:8,border:"none",background:T.brand,color:T.white,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Prenota</button>
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
    </div>
  );
}

/* PROFILO CLIENTE */
function ClProfilo({user,onSwitch}) {
  const [tab,setTab] = useState("profilo");
  const [info,setInfo] = useState({name:user.name,email:"alessio@email.it",city:"Dolcedo, Liguria",phone:""});
  const [editInfo,setEditInfo] = useState(false);
  const [tmp,setTmp] = useState(info);
  const [reviews,setReviews] = useState([
    {id:1,pro:"Salon Elite",stars:5,text:"Professionale e puntuale!",date:"10 giu 2026"},
    {id:2,pro:"Nails by Sofia",stars:5,text:"Sofia e fantastica.",date:"28 mag 2026"},
  ]);
  const [showAddRev,setShowAddRev] = useState(false);
  const [newRevPro,setNewRevPro] = useState("");
  const [newRevStars,setNewRevStars] = useState(5);
  const [newRevText,setNewRevText] = useState("");
  const PROS_LIST = ["Salon Elite","BarberKing","Nails by Sofia","Armonia Spa"];

  return (
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
      <div style={{background:"#F59E0B",padding:"50px 18px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:"#5B21B6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#fff",flexShrink:0}}>{info.name[0]}</div>
          <div>
            <h1 style={{fontSize:20,fontWeight:900,color:"#5B21B6",margin:"0 0 2px"}}>{info.name}</h1>
            <p style={{fontSize:12,color:"rgba(30,16,64,.75)",margin:0,fontWeight:600}}>{info.city}</p>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {[["profilo","Profilo"],["recensioni","Recensioni"]].map(([id,l]) => (
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:tab===id?700:400,color:tab===id?T.ink:T.inkSoft,borderBottom:tab===id?`2px solid ${T.ink}`:"2px solid transparent",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
      </div>

      {tab==="profilo" && (
        <div style={{padding:"12px 16px"}}>
          <div className="clay" style={{background:T.white,borderRadius:20,overflow:"hidden",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:`1px solid ${T.line}`}}>
              <p style={{fontSize:13,fontWeight:800,color:T.ink,margin:0}}>Informazioni</p>
              {editInfo
                ? <div style={{display:"flex",gap:6}}><Btn label="Annulla" onClick={()=>{setEditInfo(false);setTmp(info);}} style={{fontSize:11,padding:"4px 10px"}}/><button onClick={()=>{setInfo(tmp);setEditInfo(false);}} style={{padding:"4px 10px",borderRadius:8,border:"none",background:T.brand,color:T.white,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Salva</button></div>
                : <Btn label="Modifica" onClick={()=>{setEditInfo(true);setTmp(info);}} style={{fontSize:11,padding:"4px 10px"}}/>
              }
            </div>
            {editInfo ? (
              <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                {[{k:"name",l:"Nome",ph:"Il tuo nome"},{k:"email",l:"Email",t:"email",ph:"email@esempio.it"},{k:"city",l:"Citta",ph:"Es. Milano"},{k:"phone",l:"Telefono",t:"tel",ph:"333 1234567"}].map(f => (
                  <div key={f.k}><label style={{fontSize:10,fontWeight:700,color:T.inkSoft,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>{f.l}</label><input type={f.t||"text"} placeholder={f.ph} value={tmp[f.k]} onChange={e=>setTmp(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",padding:"9px 11px",borderRadius:8,border:`1.5px solid ${T.line}`,fontSize:14,color:T.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                ))}
              </div>
            ) : (
              <div>
                {[["Email",info.email||"Non indicata"],["Citta",info.city||"Non indicata"],["Telefono",info.phone||"Non indicato"],["Notifiche","Attive"]].map(([k,v]) => (
                  <div key={k} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 14px",borderBottom:`1px solid ${T.line}`}}>
                    <span style={{fontSize:13,color:T.inkSoft,minWidth:70}}>{k}</span>
                    <span style={{fontSize:13,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="clay" style={{padding:"15px",borderRadius:20,background:T.white}}>
            <p style={{fontSize:13,fontWeight:800,color:T.ink,margin:"0 0 3px"}}>Sei anche un professionista?</p>
            <p style={{fontSize:12,color:T.inkMid,margin:"0 0 11px"}}>Passa alla modalita Pro.</p>
            <BigBtn label="Passa a modalita Pro" onClick={onSwitch} variant="ghost" style={{fontSize:13,padding:"10px 0"}}/>
          </div>
        </div>
      )}

      {tab==="recensioni" && (
        <div style={{padding:"12px 16px"}}>
          <button onClick={()=>setShowAddRev(true)} className="clay-soft" style={{width:"100%",padding:"13px 0",borderRadius:16,border:"none",background:T.white,color:T.brand,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>+ Scrivi una recensione</button>
          {reviews.map((r,i) => (
            <div key={r.id} className="clay" style={{background:T.white,borderRadius:18,padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <p style={{fontSize:14,fontWeight:700,color:T.ink,margin:0}}>{r.pro}</p>
                <p style={{fontSize:11,color:T.inkSoft,margin:0}}>{r.date}</p>
              </div>
              <div style={{color:T.gold,fontSize:13,marginBottom:4}}>{"★".repeat(r.stars)}</div>
              <p style={{fontSize:13,color:T.inkMid,margin:0,lineHeight:1.5}}>{r.text}</p>
            </div>
          ))}
        </div>
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
function ProAgenda({appts,setAppts,clients,setClients,services,staff,hours}) {
  const [selStaff,setSelS] = useState(0);
  const [selAppt,setSelAppt] = useState(null);
  const [showAdd,setShowAdd] = useState(false);
  const [dateView,setDateView] = useState("oggi");
  const [view,setView] = useState("giorno");
  const [calMonth,setCalMonth] = useState({y:2026,m:5});
  const [newA,setNewA] = useState({time:"",clientSearch:"",clientId:null,serviceId:1,staffId:1,note:"",source:"app"});
  const [suggest,setSuggest] = useState([]);
  const [showLM,setShowLM] = useState(false);

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

  const checkConflict = (time,serviceId,staffId,excludeId) => {
    const start = toMin(time); const dur = getSvc(parseInt(serviceId)).min; const end = start+dur;
    return appts.find(a=>a.id!==excludeId&&a.staffId===parseInt(staffId)&&a.date===dateView&&a.status!=="cancellato"&&toMin(a.time)<end&&toMin(a.time)+getSvc(a.serviceId).min>start)||null;
  };

  const addAppt = () => {
    if(!newA.time||(!newA.clientId&&!newA.clientSearch)) return;
    if(checkConflict(newA.time,newA.serviceId,newA.staffId,null)) return;
    let cid = newA.clientId;
    if(!cid){const nc={id:Date.now(),name:newA.clientSearch,phone:"",visits:0,lastVisit:"Oggi",totalSpent:0,note:"",rating:0};setClients(p=>[...p,nc]);cid=nc.id;}
    setAppts(p=>[...p,{id:Date.now(),staffId:parseInt(newA.staffId),date:dateView,time:newA.time,clientId:cid,serviceId:parseInt(newA.serviceId),status:"confermato",source:newA.source,note:newA.note}]);
    setNewA({time:"",clientSearch:"",clientId:null,serviceId:1,staffId:1,note:"",source:"app"});
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
    const apptsByDay = {}; appts.filter(a=>a.status!=="cancellato").forEach(a=>{const d=a.date==="oggi"?14:a.date==="ieri"?13:null;if(d) apptsByDay[d]=(apptsByDay[d]||0)+1;});
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
            const isToday = d===14&&m===5; const count = apptsByDay[d]||0;
            return (
              <div key={i} onClick={()=>{setDateView(d===14?"oggi":d===13?"ieri":"oggi");setView("giorno");}} style={{aspectRatio:"1",borderRadius:9,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",background:isToday?T.ink:T.white,border:`1px solid ${T.line}`}}>
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
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 0",borderBottom:`1px solid ${T.line}`,position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
          <div><p style={{fontSize:11,color:T.inkSoft,margin:"0 0 1px"}}>Salon Elite</p><h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:0}}>Agenda</h1></div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <div style={{textAlign:"right"}}><p style={{fontSize:12,fontWeight:700,color:T.green,margin:0}}>{todayRev}€</p><p style={{fontSize:10,color:T.inkSoft,margin:0}}>{todayConf.length} appt.</p></div>
            <button onClick={()=>setShowLM(true)} style={{width:32,height:32,borderRadius:8,background:T.amberBg,border:"none",cursor:"pointer",fontSize:16}}>⚡</button>
            <button onClick={()=>setShowAdd(true)} style={{width:32,height:32,borderRadius:8,background:T.ink,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}><IPlus/></button>
          </div>
        </div>
        <div style={{display:"flex",background:T.surface,borderRadius:8,padding:3,gap:2,marginBottom:9}}>
          {[["giorno","Giorno"],["mese","Mese"]].map(([v,l])=><button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:view===v?700:400,background:view===v?T.white:T.surface,color:view===v?T.ink:T.inkSoft,fontFamily:"inherit"}}>{l}</button>)}
        </div>
        {view==="giorno" && (
          <>
            <div style={{display:"flex",gap:5,marginBottom:8}}>
              {[["oggi","Oggi"],["ieri","Ieri"]].map(([v,l])=><button key={v} onClick={()=>setDateView(v)} style={{padding:"5px 12px",borderRadius:99,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:dateView===v?T.ink:T.surface,color:dateView===v?T.white:T.inkSoft,fontFamily:"inherit"}}>{l}</button>)}
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
                  <div onClick={()=>setSelAppt(selAppt===appt.id?null:appt.id)} style={{flex:1,background:T.white,borderRadius:11,overflow:"hidden",cursor:"pointer",border:`1px solid ${T.line}`,marginBottom:3}}>
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
                    <div onClick={()=>{setNewA(p=>({...p,time:slot}));setShowAdd(true);}} style={{flex:1,borderRadius:9,border:`1.5px dashed ${T.line}`,padding:"8px 11px",cursor:"pointer",marginBottom:3}}>
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
                  {suggest.map((c,i)=><div key={c.id} onClick={()=>{setNewA(p=>({...p,clientId:c.id,clientSearch:""}));setSuggest([]);}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:i<suggest.length-1?`1px solid ${T.line}`:"none"}}><p style={{fontSize:13,fontWeight:600,color:T.ink,margin:"0 0 1px"}}>{c.name}</p><p style={{fontSize:11,color:T.inkSoft,margin:0}}>{c.phone||"No tel"} - {c.visits} visite</p></div>)}
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
              const cf = checkConflict(newA.time,newA.serviceId,newA.staffId,null);
              return <div style={{padding:"8px 10px",background:cf?T.redBg:T.blueBg,borderRadius:8}}><p style={{fontSize:11,color:cf?T.red:T.blue,margin:0,fontWeight:600}}>{cf?`Conflitto con ${getCl(cf.clientId)?.name||"?"} alle ${cf.time}`:`${newA.time} - ${toTime(toMin(newA.time)+svc.min)} - ${svc.min} min - ${svc.price}€`}</p></div>;
            })()}
            <div style={{display:"flex",gap:7}}>
              <Btn label="Annulla" onClick={()=>{setShowAdd(false);setSuggest([]);}} style={{flex:1,padding:"11px 0",textAlign:"center"}}/>
              <button onClick={addAppt} disabled={!newA.time||(!newA.clientId&&!newA.clientSearch)||!!checkConflict(newA.time,newA.serviceId,newA.staffId,null)} style={{flex:2,padding:"11px 0",borderRadius:9,border:"none",background:T.brand,cursor:"pointer",fontSize:14,fontWeight:600,color:T.white,fontFamily:"inherit",opacity:(!newA.time||(!newA.clientId&&!newA.clientSearch)||!!checkConflict(newA.time,newA.serviceId,newA.staffId,null))?.4:1}}>Aggiungi</button>
            </div>
          </div>
        </Modal>
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
function ProClienti({clients,setClients,appts,services,nav}) {
  const [q,setQ] = useState("");
  const list = clients.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.phone?.includes(q));
  return (
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 12px",borderBottom:`1px solid ${T.line}`,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:0}}>Clienti</h1>
          <Pill label={`${clients.length} tot.`} style={{background:T.surface,color:T.inkMid}}/>
        </div>
        <div className="clay-inset" style={{display:"flex",alignItems:"center",gap:8,background:T.white,borderRadius:15,padding:"10px 13px"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca..." style={{flex:1,border:"none",outline:"none",background:"none",fontSize:14,color:T.ink,fontFamily:"inherit"}}/>
        </div>
      </div>
      <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {list.map(c => (
          <div key={c.id} onClick={()=>nav("pro_cliente",c)} className="clay ba-lift" style={{background:T.white,borderRadius:20,padding:"13px 15px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:T.white,flexShrink:0,boxShadow:"inset 2px 2px 4px rgba(255,255,255,.35), inset -2px -3px 5px rgba(180,83,9,.35)"}}>{c.name[0]}</div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:14,fontWeight:600,color:T.ink,margin:"0 0 2px"}}>{c.name}</p>
              <p style={{fontSize:11,color:T.inkSoft,margin:"0 0 4px"}}>{c.phone||"No telefono"} - {c.lastVisit}</p>
              <div style={{display:"flex",gap:5}}><Pill label={`${c.visits} visite`} style={{background:T.surface,color:T.inkMid}}/><Pill label={`${c.totalSpent}€`} style={{background:T.greenBg,color:T.green,fontWeight:700}}/></div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.line} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        ))}
      </div>
    </div>
  );
}

/* PRO - SCHEDA CLIENTE */
function ProCliente({client,setClients,appts,services,nav}) {
  const [note,setNote] = useState(client.note||"");
  const [editing,setEditing] = useState(false);
  const getSvc = id => services.find(s=>s.id===id)||{name:"?",price:0};
  const cAppts = appts.filter(a=>a.clientId===client.id).slice(-8).reverse();
  const saveNote = () => {setClients(p=>p.map(c=>c.id===client.id?{...c,note}:c));setEditing(false);};
  return (
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"48px 16px 14px",borderBottom:`1px solid ${T.line}`}}>
        <BackBtn onClick={()=>nav("pro_clienti")}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10}}>
          <div style={{width:54,height:54,borderRadius:"50%",background:T.brand,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:T.white,boxShadow:"inset 2px 2px 4px rgba(255,255,255,.35), inset -2px -3px 5px rgba(180,83,9,.35)"}}>{client.name[0]}</div>
          <div><h1 style={{fontSize:19,fontWeight:900,color:T.ink,margin:"0 0 2px"}}>{client.name}</h1><p style={{fontSize:12,color:T.inkSoft,margin:0}}>{client.phone||"Nessun telefono"}</p></div>
        </div>
      </div>
      <div style={{padding:"12px 14px",display:"flex",gap:10}}>
        {[[client.visits,"Visite"],[`${client.totalSpent}€`,"Speso"],[client.lastVisit,"Ultima"]].map(([v,l]) => (
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
        <div style={{padding:"12px 16px"}}><p style={{fontSize:13,fontWeight:800,color:T.ink,margin:0}}>Storico</p></div>
        {cAppts.length>0 ? cAppts.map((a,i)=>{const svc=getSvc(a.serviceId);return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",borderBottom:i<cAppts.length-1?`1px solid ${T.line}`:"none"}}><div style={{width:8,height:8,borderRadius:4,background:ST[a.status]?.bar||"#ccc",flexShrink:0}}/><div style={{flex:1}}><p style={{fontSize:13,color:T.ink,margin:"0 0 1px",fontWeight:500}}>{svc.name}</p><p style={{fontSize:10,color:T.inkSoft,margin:0}}>{a.date} - {a.time}</p></div><p style={{fontSize:13,fontWeight:700,color:T.ink,margin:0}}>{svc.price}€</p></div>);})
          : <p style={{fontSize:13,color:T.inkSoft,padding:"13px 14px",margin:0}}>Nessun appuntamento.</p>}
      </div>
      <div style={{padding:"0 14px",display:"flex",gap:7}}>
        <button onClick={()=>nav("pro_agenda")} className="clay-btn" style={{flex:1,padding:"14px 0",borderRadius:18,border:"none",background:T.brand,color:T.white,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>+ Prenota</button>
      </div>
    </div>
  );
}

/* PRO - SERVIZI + STAFF + ORARI */
function ProServizi({services,setServices,staff,setStaff,hours,setHours}) {
  const [tab,setTab] = useState("servizi");
  const [showAddSvc,setShowAddSvc] = useState(false);
  const [newSvc,setNewSvc] = useState({name:"",price:"",min:""});
  const [editSvc,setEditSvc] = useState(null);
  const [editVals,setEditVals] = useState({name:"",price:"",min:""});
  const startEdit = s => {setEditSvc(s.id);setEditVals({name:s.name,price:String(s.price),min:String(s.min)});};
  const saveEdit = s => {setServices(p=>p.map(x=>x.id===s.id?{...x,name:editVals.name,price:parseInt(editVals.price)||0,min:parseInt(editVals.min)||0}:x));setEditSvc(null);};
  return (
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
      <div style={{background:T.white,padding:"50px 16px 12px",borderBottom:`1px solid ${T.line}`,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}>
          <h1 style={{fontSize:20,fontWeight:700,color:T.ink,margin:0}}>Gestione</h1>
          <button onClick={()=>tab==="servizi"?setShowAddSvc(true):null} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 11px",borderRadius:8,border:"none",background:T.brand,color:T.white,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}><IPlus/>Aggiungi</button>
        </div>
        <div style={{display:"flex",background:T.surface,borderRadius:8,padding:3,gap:2}}>
          {[["servizi","Servizi"],["staff","Staff"],["orari","Orari"]].map(([v,l])=><button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"6px 0",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:tab===v?700:400,background:tab===v?T.white:T.surface,color:tab===v?T.ink:T.inkSoft,fontFamily:"inherit"}}>{l}</button>)}
        </div>
      </div>

      {tab==="servizi" && (
        <div style={{padding:"10px 14px"}}>
          {services.map(s => (
            <div key={s.id} style={{background:T.white,borderRadius:12,marginBottom:7,overflow:"hidden",opacity:s.active?1:.55}}>
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
            <div key={s.id} style={{background:T.white,borderRadius:12,marginBottom:7,padding:"12px 13px"}}>
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
              <div key={i} style={{background:T.white,borderRadius:12,marginBottom:7,overflow:"hidden",opacity:isOpen?1:.6}}>
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
    <div style={{paddingBottom:90,background:T.paper,minHeight:"100dvh"}}>
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
        <div onClick={()=>nav("pro_piani")} className="clay-btn" style={{padding:"15px",borderRadius:20,background:T.brand,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
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

/* BETA */
const BETA_END = new Date(2026,8,14);
const TODAY_DEMO = new Date(2026,5,14);
const BETA_DAYS_LEFT = Math.ceil((BETA_END-TODAY_DEMO)/(1000*60*60*24));

function BetaBanner({nav}) {
  const filled = Math.max(0,Math.min(100,Math.round((1-BETA_DAYS_LEFT/90)*100)));
  return (
    <div onClick={()=>nav("pro_piani")} style={{margin:"12px 14px 0",background:T.ink,borderRadius:14,padding:"13px 14px",cursor:"pointer"}}>
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
    <div style={{paddingBottom:40,background:T.paper,minHeight:"100dvh"}}>
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
          <div key={p.id} style={{background:T.white,borderRadius:16,marginBottom:12,overflow:"hidden"}}>
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

/* ROOT */
export default function App() {
  const [user,setUser] = useState(null);
  const [mode,setMode] = useState("cliente");
  const [screen,setScreen] = useState("cl_home");
  const [sData,setSD] = useState(null);
  const [appts,setAppts] = useState(APPTS0);
  const [clients,setClients] = useState(CLIENTS0);
  const [services,setServices] = useState(SVCS0);
  const [staff,setStaff] = useState(STAFF0);
  const [hours,setHours] = useState(HOURS0);
  const [favorites,setFavorites] = useState(new Set([1,3]));
  const [showBetaWelcome,setShowBetaWelcome] = useState(false);
  const [myAppts,setMyAppts] = useState(MY_APPTS0);

  useEffect(()=>{injectFont();},[]);

  const nav = (to,data=null) => {setScreen(to);setSD(data);window.scrollTo({top:0});};

  const handleAuth = ({name,type}) => {
    setUser({name,type});setMode(type==="pro"?"pro":"cliente");
    if(type==="pro") setShowBetaWelcome(true);
    nav(type==="pro"?"pro_agenda":"cl_home");
  };

  const switchMode = () => {
    const next = mode==="cliente"?"pro":"cliente";
    setMode(next);nav(next==="pro"?"pro_agenda":"cl_home");
  };

  if(!user) return <W><LoginScreen onAuth={handleAuth}/></W>;

  const render = () => {
    if(screen==="cl_home")       return <ClHome nav={nav} favorites={favorites} setFavorites={setFavorites} myAppts={myAppts}/>;
    if(screen==="cl_explore")    return <ClExplore nav={nav}/>;
    if(screen==="cl_preferiti")  return <ClPreferiti nav={nav} favorites={favorites} setFavorites={setFavorites}/>;
    if(screen==="cl_pro")        return <ClPro pro={sData} nav={nav} favorites={favorites} setFavorites={setFavorites}/>;
    if(screen==="cl_prenota")    return <ClPrenota data={sData} nav={nav}/>;
    if(screen==="cl_appts")      return <ClAppts nav={nav} allAppts={myAppts} setAllAppts={setMyAppts}/>;
    if(screen==="cl_profilo")    return <ClProfilo user={user} onSwitch={switchMode}/>;
    if(screen==="pro_agenda")    return <ProAgenda appts={appts} setAppts={setAppts} clients={clients} setClients={setClients} services={services} staff={staff} hours={hours}/>;
    if(screen==="pro_clienti")   return <ProClienti clients={clients} setClients={setClients} appts={appts} services={services} nav={nav}/>;
    if(screen==="pro_cliente")   return <ProCliente client={sData} setClients={setClients} appts={appts} services={services} nav={nav}/>;
    if(screen==="pro_servizi")   return <ProServizi services={services} setServices={setServices} staff={staff} setStaff={setStaff} hours={hours} setHours={setHours}/>;
    if(screen==="pro_stats")     return <ProStats appts={appts} clients={clients} services={services} staff={staff} onSwitch={switchMode} nav={nav}/>;
    if(screen==="pro_piani")     return <PianiScreen nav={nav}/>;
    return null;
  };

  return (
    <W>
      {render()}
      {mode==="pro" && screen!=="pro_piani" && <BetaBanner nav={nav}/>}
      {mode==="pro" ? <NavPro s={screen} nav={nav}/> : <NavCl s={screen} nav={nav}/>}
      {showBetaWelcome && <BetaWelcome onClose={()=>setShowBetaWelcome(false)}/>}
    </W>
  );
}

function W({children}) {
  return <div style={{maxWidth:430,margin:"0 auto",minHeight:"100dvh",background:T.paper,fontFamily:"'Nunito',-apple-system,system-ui,sans-serif",fontWeight:600,WebkitFontSmoothing:"antialiased"}}>{children}</div>;
}
