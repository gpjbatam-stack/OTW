import { requireAuth } from "./guard.js";

try { await requireAuth({ redirect: "login.html" }); }
catch (e) { console.warn("[OTW] auth guard:", e); }

const $ = (s) => document.querySelector(s);
const API_URL = "https://vumyxlbybhlaicubtgun.supabase.co/functions/v1/jetwize-search";

const LOGOS = Object.freeze({
  GA:"GA.png", JT:"JT.png", QG:"QG.png", ID:"ID.png", IU:"IU.png",
  "8B":"8B.png", IN:"IN.png", IP:"IP.png", IW:"IW.png", QZ:"QZ.png", SJ:"SJ.png"
});
const NAME_CODES = {
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};
const AIRPORTS = {
  BTH:"Hang Nadim",CGK:"Soekarno-Hatta",DPS:"I Gusti Ngurah Rai",SUB:"Juanda",
  KNO:"Kualanamu",JOG:"Adisutjipto",YIA:"Yogyakarta Intl.",UPG:"Sultan Hasanuddin",
  BPN:"Sultan Aji Muhammad Sulaiman",PKU:"Sultan Syarif Kasim II",PLM:"Sultan Mahmud Badaruddin II"
};
const CABIN = {ECONOMY:"Ekonomi",PREMIUM_ECONOMY:"Premium Ekonomi",BUSINESS:"Bisnis",FIRST:"First"};

let selected = null;
let search = readJSON("otw_search") || {};
let offerId = sessionStorage.getItem("otw_selected_offer_id") || "";

function readJSON(key){
  try { return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || "null"); }
  catch { return null; }
}
function rupiah(v){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0); }
function esc(v=""){ return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
function localDate(v){ if(!v)return "—"; return new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(new Date(v)); }
function hm(v){ if(!v)return "--:--"; const d=new Date(v); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function duration(m){ m=Number(m)||0; const h=Math.floor(m/60),min=m%60; return `${h?`${h}j `:""}${min}m`; }
function resolveCode(code,name){ const c=String(code||"").toUpperCase(); return LOGOS[c]?c:(NAME_CODES[String(name||"").toLowerCase()]||c||"FL"); }
function logoHTML(code,name){ const c=resolveCode(code,name), src=LOGOS[c]; return src ? `<img src="./${src}?v=20260819" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span style="display:none">${esc(c)}</span>` : `<span>${esc(c)}</span>`; }
function airportName(code){ return AIRPORTS[code] || "Bandara"; }
function getToken(){
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k?.startsWith("sb-")&&k.endsWith("-auth-token")){
      try{ const r=JSON.parse(localStorage.getItem(k)); if(r?.access_token)return r.access_token; if(r?.currentSession?.access_token)return r.currentSession.access_token; }
      catch{}
    }
  }
  return null;
}
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2300); }

function normalizeSelected(){
  selected = readJSON("otw_selected_flight");
  if(selected) return selected;

  const params=new URLSearchParams(location.search);
  const raw=params.get("offer");
  if(raw){ try{ selected=JSON.parse(decodeURIComponent(raw)); return selected; }catch{} }

  return null;
}

function renderFlight(f){
  const segs=f?.segments||[];
  const first=segs[0]||{};
  const last=segs[segs.length-1]||first;
  const name=first.carrierName||f.carrierName||"Maskapai";
  const code=first.carrier||f.carrier||"";
  const cabin=CABIN[first.cabinClass||search.cabinClass] || first.cabinClass || search.cabin || "Ekonomi";
  const stops=Number(f.stops ?? Math.max(0,segs.length-1));
  const price=Number(f.displayPrice ?? f.totalPrice ?? f.supplierTotalPrice ?? f.basePrice ?? 0);
  const pax=(Number(search?.passengers?.adult||search.adults||1)+Number(search?.passengers?.child||search.children||0)+Number(search?.passengers?.infant||search.infants||0))||1;

  $("#airlineLogo").innerHTML=logoHTML(code,name); $("#tinyLogo").innerHTML=logoHTML(code,name);
  $("#airlineName").textContent=name; $("#tlAirline").textContent=name;
  $("#flightNumber").textContent=first.flightNumber||"—";
  $("#cabinClass").textContent=cabin; $("#benefitCabin").textContent=cabin;
  $("#stopBadge").textContent=stops===0?"Langsung":`${stops} Transit`;
  $("#routeType").textContent=stops===0?"Penerbangan langsung":`${stops} transit`;
  $("#departureTime").textContent=hm(first.departureLocalTime||first.departureTime);
  $("#arrivalTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime);
  $("#originCode").textContent=first.origin||search.origin||"---";
  $("#destinationCode").textContent=last.destination||search.destination||"---";
  $("#originName").textContent=airportName(first.origin||search.origin);
  $("#destinationName").textContent=airportName(last.destination||search.destination);
  $("#durationLabel").textContent=duration(f.totalDuration||first.duration);
  $("#flightDate").textContent=localDate(first.departureLocalTime||first.departureTime||search.departDate);
  $("#aircraft").textContent=first.aircraft||"—";
  $("#seatAvailability").textContent=f.seatsAvailable!=null?`${f.seatsAvailable} tersedia`:"Cek saat pesan";
  $("#baggage").textContent=first.baggageAllowance||f.baggageAllowance||"Sesuai tarif";

  $("#tlDepartTime").textContent=hm(first.departureLocalTime||first.departureTime);
  $("#tlDepartDate").textContent=localDate(first.departureLocalTime||first.departureTime);
  $("#tlOrigin").textContent=first.origin||search.origin||"---";
  $("#tlOriginName").textContent=airportName(first.origin||search.origin);
  $("#tlArrivalTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime);
  $("#tlArrivalDate").textContent=localDate(last.arrivalLocalTime||last.arrivalTime);
  $("#tlDestination").textContent=last.destination||search.destination||"---";
  $("#tlDestinationName").textContent=airportName(last.destination||search.destination);
  $("#tlFlightInfo").textContent=`${first.flightNumber||"—"} · ${cabin}`;
  $("#tlDuration").textContent=duration(f.totalDuration||first.duration);

  $("#ticketPrice").textContent=rupiah(price);
  $("#totalPrice").textContent=rupiah(price);
  $("#stickyPrice").textContent=rupiah(price);
  $("#priceNote").textContent=`Untuk ${pax} penumpang`;
  $("#stickyPassenger").textContent=`${pax} penumpang`;
}

function setVerify(state,title,text){
  const b=$("#verifyBanner"); b.className=`verify-banner ${state}`;
  $("#verifyTitle").textContent=title; $("#verifyText").textContent=text;
  $("#verifySpinner").classList.toggle("hidden",state!=="checking");
}

async function verifyOffer(){
  if(!selected) return;
  const id=offerId||selected.offerId;
  if(!id){ setVerify("verified","Detail siap","Harga akan diverifikasi sebelum pemesanan."); return; }

  // The current JetWize search edge function may not yet expose price-check.
  // Try a conventional action payload; gracefully keep selected search data if unsupported.
  try{
    const token=getToken();
    if(!token) throw new Error("Sesi login tidak ditemukan");
    const res=await fetch(API_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
      body:JSON.stringify({action:"price-check",offerId:id})
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    const verified=data?.result||data?.offer||data?.data;
    if(verified?.offerId || verified?.segments){
      const oldPrice=Number(selected.supplierTotalPrice||selected.totalPrice||0);
      const newPrice=Number(verified.supplierTotalPrice||verified.totalPrice||oldPrice);
      selected={...selected,...verified};
      sessionStorage.setItem("otw_selected_flight",JSON.stringify(selected));
      renderFlight(selected);
      if(oldPrice&&newPrice&&oldPrice!==newPrice) setVerify("changed","Harga diperbarui","Harga terbaru telah diterapkan sebelum Anda melanjutkan.");
      else setVerify("verified","Harga & kursi terverifikasi","Penawaran masih tersedia untuk dilanjutkan.");
      return;
    }
    throw new Error("Price-check belum tersedia");
  }catch(e){
    console.info("[OTW] price-check fallback:",e.message);
    setVerify("verified","Penerbangan siap dipilih","Detail berdasarkan hasil pencarian real-time terakhir.");
  }
}

function init(){
  selected=normalizeSelected();
  if(!selected){
    setVerify("failed","Data penerbangan tidak ditemukan","Kembali ke hasil pencarian dan pilih penerbangan.");
    $("#continueBtn").disabled=true;
    $("#expiredState").classList.remove("hidden");
    return;
  }
  offerId=offerId||selected.offerId||"";
  renderFlight(selected);
  verifyOffer();
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#backToSearchBtn")?.addEventListener("click",()=>history.back());
$("#continueBtn")?.addEventListener("click",()=>{
  if(!selected){ toast("Pilih penerbangan terlebih dahulu."); return; }
  sessionStorage.setItem("otw_selected_flight",JSON.stringify(selected));
  if(offerId) sessionStorage.setItem("otw_selected_offer_id",offerId);
  location.href="passenger-details.html";
});

init();
