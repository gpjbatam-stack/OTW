import { requireAuth } from "./guard.js";
import { supabase } from "./supabase.js";

try { await requireAuth({ redirect: "login.html" }); }
catch (e) { console.warn("[OTW] auth guard:", e); }

const $ = (s) => document.querySelector(s);

const API_URL = "https://vumyxlbybhlaicubtgun.supabase.co/functions/v1/jetwize-search";
const PRICING_RPC = "calculate_public_flight_price";

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

const CABIN = {
  ECONOMY:"Ekonomi",PREMIUM_ECONOMY:"Premium Ekonomi",
  BUSINESS:"Bisnis",FIRST:"First"
};

let selected = null;
let search = readJSON("otw_search") || {};
let offerId = sessionStorage.getItem("otw_selected_offer_id") || "";
let pricingSnapshot = null;

function readJSON(key){
  try {
    return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function rupiah(v){
  return new Intl.NumberFormat("id-ID",{
    style:"currency",currency:"IDR",maximumFractionDigits:0
  }).format(Number(v)||0);
}

function esc(v=""){
  return String(v).replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function localDate(v){
  if(!v) return "—";
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID",{
    weekday:"short",day:"2-digit",month:"short",year:"numeric"
  }).format(d);
}

function hm(v){
  if(!v) return "--:--";
  const match=String(v).match(/T(\d{2}):(\d{2})/);
  if(match) return `${match[1]}:${match[2]}`;
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function duration(m){
  m=Number(m)||0;
  const h=Math.floor(m/60),min=m%60;
  return `${h?`${h}j `:""}${min}m`;
}

function resolveCode(code,name){
  const c=String(code||"").toUpperCase();
  return LOGOS[c]?c:(NAME_CODES[String(name||"").toLowerCase()]||c||"FL");
}

function logoHTML(code,name){
  const c=resolveCode(code,name),src=LOGOS[c];
  return src
    ? `<img src="./${src}?v=20260819" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span style="display:none">${esc(c)}</span>`
    : `<span>${esc(c)}</span>`;
}

function airportName(code){
  return AIRPORTS[code] || "Bandara";
}

function getToken(){
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k?.startsWith("sb-")&&k.endsWith("-auth-token")){
      try{
        const r=JSON.parse(localStorage.getItem(k));
        if(r?.access_token) return r.access_token;
        if(r?.currentSession?.access_token) return r.currentSession.access_token;
      }catch{}
    }
  }
  return null;
}

function toast(msg){
  const el=$("#toast");
  el.textContent=msg;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove("show"),2300);
}

function normalizeSelected(){
  selected=readJSON("otw_selected_flight");
  if(selected) return selected;

  const params=new URLSearchParams(location.search);
  const raw=params.get("offer");

  if(raw){
    try{
      selected=JSON.parse(decodeURIComponent(raw));
      return selected;
    }catch{}
  }

  return null;
}

function passengerCount(){
  const p=search?.passengers||{};
  return (
    Number(p.adult ?? search.adults ?? 1) +
    Number(p.child ?? search.children ?? 0) +
    Number(p.infant ?? search.infants ?? 0)
  ) || 1;
}

function supplierPriceOf(f){
  return Number(
    f?.supplierTotalPrice ??
    f?.totalPrice ??
    ((Number(f?.basePrice)||0)+(Number(f?.tax)||0))
  ) || 0;
}

function renderFlight(f){
  const segs=f?.segments||[];
  const first=segs[0]||{};
  const last=segs[segs.length-1]||first;
  const name=first.carrierName||f.carrierName||"Maskapai";
  const code=first.carrier||f.carrier||"";
  const cabin=CABIN[first.cabinClass||search.cabinClass] || first.cabinClass || search.cabin || "Ekonomi";
  const stops=Number(f.stops ?? Math.max(0,segs.length-1));
  const pax=passengerCount();

  $("#airlineLogo").innerHTML=logoHTML(code,name);
  $("#tinyLogo").innerHTML=logoHTML(code,name);
  $("#airlineName").textContent=name;
  $("#tlAirline").textContent=name;
  $("#flightNumber").textContent=first.flightNumber||"—";
  $("#cabinClass").textContent=cabin;
  $("#benefitCabin").textContent=cabin;
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

  $("#priceNote").textContent=`Untuk ${pax} penumpang`;
  $("#stickyPassenger").textContent=`${pax} penumpang`;
}

function setPricingState(state,text){
  const box=$("#pricingSync");
  box.className=`pricing-sync ${state||""}`.trim();
  $("#pricingSyncText").textContent=text;
}

async function applyOtwPricing(f){
  const supplierPrice=supplierPriceOf(f);

  if(!supplierPrice){
    setPricingState("error","Harga supplier tidak tersedia.");
    $("#continueBtn").disabled=true;
    return;
  }

  setPricingState("","Menghitung harga OTW...");

  const {data,error}=await supabase.rpc(PRICING_RPC,{
    p_supplier_price:supplierPrice
  });

  if(error){
    console.error("[OTW] pricing RPC:",error);
    setPricingState("error","Pricing OTW belum dapat dimuat.");
    $("#priceStatus").textContent="Pricing error";
    $("#continueBtn").disabled=true;
    toast("Konfigurasi pricing OTW belum siap.");
    return;
  }

  const row=Array.isArray(data)?data[0]:data;

  if(!row){
    setPricingState("error","Konfigurasi pricing tidak ditemukan.");
    $("#continueBtn").disabled=true;
    return;
  }

  pricingSnapshot={
    supplierPrice,
    ticketPrice:Number(row.ticket_price)||0,
    serviceFee:Number(row.service_fee)||0,
    totalPrice:Number(row.total_price)||0,
    currency:row.currency||"IDR",
    pricingUpdatedAt:row.pricing_updated_at||null,
    source:"OTW_ADMIN_PRICING"
  };

  $("#ticketPrice").textContent=rupiah(pricingSnapshot.ticketPrice);
  $("#serviceFee").textContent=rupiah(pricingSnapshot.serviceFee);
  $("#serviceFeeRow").classList.toggle("hidden",pricingSnapshot.serviceFee<=0);
  $("#totalPrice").textContent=rupiah(pricingSnapshot.totalPrice);
  $("#stickyPrice").textContent=rupiah(pricingSnapshot.totalPrice);
  $("#priceStatus").textContent="OTW Price";
  $("#pricingSourceLabel").textContent="OTW Pricing";
  setPricingState("ready","Harga dihitung dari konfigurasi Admin OTW.");

  selected={
    ...f,
    displayPrice:pricingSnapshot.totalPrice,
    otwTicketPrice:pricingSnapshot.ticketPrice,
    otwServiceFee:pricingSnapshot.serviceFee,
    otwPricing:pricingSnapshot
  };

  sessionStorage.setItem("otw_selected_flight",JSON.stringify(selected));
  sessionStorage.setItem("otw_flight_pricing",JSON.stringify(pricingSnapshot));
  $("#continueBtn").disabled=false;
}

function setVerify(state,title,text){
  const b=$("#verifyBanner");
  b.className=`verify-banner ${state}`;
  $("#verifyTitle").textContent=title;
  $("#verifyText").textContent=text;
  $("#verifySpinner").classList.toggle("hidden",state!=="checking");
}

async function verifyOffer(){
  if(!selected) return;

  const id=offerId||selected.offerId;

  if(!id){
    setVerify("verified","Detail siap","Harga akan diverifikasi kembali sebelum pemesanan.");
    await applyOtwPricing(selected);
    return;
  }

  try{
    const token=getToken();
    if(!token) throw new Error("Sesi login tidak ditemukan");

    const res=await fetch(API_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      },
      body:JSON.stringify({action:"price-check",offerId:id})
    });

    if(!res.ok) throw new Error(`HTTP ${res.status}`);

    const data=await res.json();
    const verified=data?.result||data?.offer||data?.data;

    if(verified?.offerId || verified?.segments){
      const oldPrice=supplierPriceOf(selected);
      const newPrice=supplierPriceOf(verified)||oldPrice;

      selected={...selected,...verified};
      renderFlight(selected);

      if(oldPrice&&newPrice&&oldPrice!==newPrice){
        setVerify("changed","Harga diperbarui","Harga supplier terbaru telah diterapkan.");
      }else{
        setVerify("verified","Harga & kursi terverifikasi","Penawaran masih tersedia untuk dilanjutkan.");
      }

      await applyOtwPricing(selected);
      return;
    }

    throw new Error("Price-check belum tersedia");

  }catch(e){
    console.info("[OTW] price-check fallback:",e.message);
    setVerify("verified","Penerbangan siap dipilih","Menggunakan hasil pencarian real-time terakhir.");
    await applyOtwPricing(selected);
  }
}

async function init(){
  selected=normalizeSelected();

  if(!selected){
    setVerify("failed","Data penerbangan tidak ditemukan","Kembali ke hasil pencarian dan pilih penerbangan.");
    $("#continueBtn").disabled=true;
    $("#expiredState").classList.remove("hidden");
    return;
  }

  offerId=offerId||selected.offerId||"";
  $("#continueBtn").disabled=true;

  renderFlight(selected);
  await verifyOffer();
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#backToSearchBtn")?.addEventListener("click",()=>history.back());

$("#continueBtn")?.addEventListener("click",()=>{
  if(!selected){
    toast("Pilih penerbangan terlebih dahulu.");
    return;
  }

  if(!pricingSnapshot){
    toast("Harga OTW belum berhasil dihitung.");
    return;
  }

  sessionStorage.setItem("otw_selected_flight",JSON.stringify(selected));
  sessionStorage.setItem("otw_flight_pricing",JSON.stringify(pricingSnapshot));

  if(offerId){
    sessionStorage.setItem("otw_selected_offer_id",offerId);
  }

  location.href="passenger-details.html";
});

await init();
