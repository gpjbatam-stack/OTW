import { requireAuth } from "./guard.js";
import { supabase } from "./supabase.js";

try { await requireAuth({ redirect: "login.html" }); }
catch (e) { console.warn("[OTW] auth guard:", e); }

const $ = (s) => document.querySelector(s);

const API_URL = "https://vumyxlbybhlaicubtgun.supabase.co/functions/v1/jetwize-search";
const PRICING_RPC = "calculate_public_flight_price";
const ADDON_RPC = "get_public_addon_catalog";

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

let addonCatalog = [];
let selectedBaggage = {};
let selectedInsurance = null;
let addonTotal = 0;

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
  return "--:--";
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

function selectedAirlineCode(){
  const seg=selected?.segments?.[0]||{};
  return resolveCode(seg.carrier||selected?.carrier||selected?.airlineCode,seg.carrierName||selected?.carrierName||selected?.airlineName);
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

function calculateVisibleTotal(){
  const flightTotal=Number(pricingSnapshot?.totalPrice||0);
  const visibleTotal=flightTotal+addonTotal;

  $("#addonPrice").textContent=rupiah(addonTotal);
  $("#totalPrice").textContent=rupiah(visibleTotal);
  $("#stickyPrice").textContent=rupiah(visibleTotal);

  if(pricingSnapshot){
    pricingSnapshot={
      ...pricingSnapshot,
      addonTotal,
      checkoutTotal:visibleTotal
    };
    sessionStorage.setItem("otw_flight_pricing",JSON.stringify(pricingSnapshot));
  }
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
  calculateVisibleTotal();
  $("#continueBtn").disabled=false;
}

function restoreAddonSelection(){
  const saved=readJSON("otw_flight_addons");
  const code=selectedAirlineCode();

  if(!saved || saved.airlineCode!==code) return;

  selectedBaggage={};
  (saved.baggage||[]).forEach(item=>{
    const found=addonCatalog.find(x=>String(x.id)===String(item.addonId));
    if(found) selectedBaggage[String(item.passengerIndex)]=found;
  });

  if(saved.insurance){
    selectedInsurance=addonCatalog.find(x=>String(x.id)===String(saved.insurance.addonId))||null;
  }
}

function baggageCatalog(){
  return addonCatalog.filter(x=>String(x.addon_type).toUpperCase()==="BAGGAGE");
}

function insuranceCatalog(){
  return addonCatalog.filter(x=>String(x.addon_type).toUpperCase()==="INSURANCE");
}

function renderAddonChoices(){
  $("#addonLoading").classList.add("hidden");
  $("#addonError").classList.add("hidden");

  const bags=baggageCatalog();
  const ins=insuranceCatalog();

  $("#baggageArea").classList.toggle("hidden",!bags.length);
  $("#insuranceArea").classList.toggle("hidden",!ins.length);
  $("#addonEmpty").classList.toggle("hidden",Boolean(bags.length||ins.length));

  if(!bags.length && !ins.length){
    $("#addonEmptyText").textContent=`Belum ada BAGGAGE atau INSURANCE aktif untuk ${selectedAirlineCode()}.`;
  }

  if(bags.length){
    const list=$("#baggagePassengerList");
    list.innerHTML="";

    for(let i=0;i<passengerCount();i++){
      const chosen=selectedBaggage[String(i)]||null;
      const wrap=document.createElement("div");
      wrap.className="addon-pax";

      wrap.innerHTML=`
        <div class="addon-pax-head">
          <strong>Penumpang ${i+1}</strong>
          <small>${chosen?esc(chosen.addon_name):"Tanpa tambahan"}</small>
        </div>
        <div class="addon-option-grid">
          <button class="addon-option ${!chosen?"active":""}" type="button" data-pax="${i}" data-none="1">
            <i class="radio"></i>
            <b>Tanpa bagasi</b>
            <small>Gunakan bagasi bawaan tiket</small>
            <strong>Rp0</strong>
          </button>
          ${bags.map(item=>`
            <button class="addon-option ${chosen&&String(chosen.id)===String(item.id)?"active":""}" type="button" data-pax="${i}" data-id="${esc(item.id)}">
              <i class="radio"></i>
              <b>${esc(item.addon_name)}</b>
              <small>${item.weight_kg?`Tambahan ${Number(item.weight_kg)} kg`:"Bagasi tambahan"}</small>
              <strong>${rupiah(item.selling_price)}</strong>
            </button>
          `).join("")}
        </div>
      `;

      list.appendChild(wrap);
    }

    document.querySelectorAll("[data-pax]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const idx=String(btn.dataset.pax);

        if(btn.dataset.none){
          delete selectedBaggage[idx];
        }else{
          const item=bags.find(x=>String(x.id)===String(btn.dataset.id));
          if(item) selectedBaggage[idx]=item;
        }

        renderAddonChoices();
        updateAddonSummary();
      });
    });
  }

  if(ins.length){
    const box=$("#insuranceOptions");
    box.innerHTML=`
      <button class="addon-option ${!selectedInsurance?"active":""}" type="button" data-ins-none="1">
        <i class="radio"></i>
        <b>Tanpa asuransi</b>
        <small>Lanjut tanpa perlindungan tambahan</small>
        <strong>Rp0</strong>
      </button>
      ${ins.map(item=>`
        <button class="addon-option ${selectedInsurance&&String(selectedInsurance.id)===String(item.id)?"active":""}" type="button" data-ins-id="${esc(item.id)}">
          <i class="radio"></i>
          <b>${esc(item.addon_name)}</b>
          <small>Perlindungan perjalanan</small>
          <strong>${rupiah(item.selling_price)}</strong>
        </button>
      `).join("")}
    `;

    $("[data-ins-none]")?.addEventListener("click",()=>{
      selectedInsurance=null;
      renderAddonChoices();
      updateAddonSummary();
    });

    document.querySelectorAll("[data-ins-id]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        selectedInsurance=ins.find(x=>String(x.id)===String(btn.dataset.insId))||null;
        renderAddonChoices();
        updateAddonSummary();
      });
    });
  }

  updateAddonSummary();
}

function updateAddonSummary(){
  const baggageItems=Object.values(selectedBaggage);
  const baggageTotal=baggageItems.reduce((sum,x)=>sum+Number(x.selling_price||0),0);
  const insuranceTotal=Number(selectedInsurance?.selling_price||0);

  addonTotal=baggageTotal+insuranceTotal;

  const count=baggageItems.length+(selectedInsurance?1:0);
  $("#addonSummaryText").textContent=count
    ? `${baggageItems.length} bagasi${selectedInsurance?" + asuransi":""}`
    : "Tidak ada";

  $("#addonTotalPrice").textContent=rupiah(addonTotal);
  $("#addonBenefitStatus").textContent=count?`${count} dipilih`:"Opsional";

  calculateVisibleTotal();
  persistAddons();
}

function persistAddons(){
  const baggage=Object.entries(selectedBaggage).map(([passengerIndex,item])=>({
    passengerIndex:Number(passengerIndex),
    addonId:item.id,
    addonCode:item.addon_code,
    addonName:item.addon_name,
    weightKg:item.weight_kg==null?null:Number(item.weight_kg),
    sellingPrice:Number(item.selling_price||0)
  }));

  const insurance=selectedInsurance?{
    addonId:selectedInsurance.id,
    addonCode:selectedInsurance.addon_code,
    addonName:selectedInsurance.addon_name,
    sellingPrice:Number(selectedInsurance.selling_price||0)
  }:null;

  sessionStorage.setItem("otw_flight_addons",JSON.stringify({
    airlineCode:selectedAirlineCode(),
    baggage,
    insurance,
    total:addonTotal,
    currency:"IDR",
    pricingSource:"OTW_ADMIN_CATALOG",
    selectedAt:new Date().toISOString()
  }));
}

async function loadAddonCatalog(){
  $("#addonLoading").classList.remove("hidden");
  $("#addonError").classList.add("hidden");
  $("#addonEmpty").classList.add("hidden");

  const code=selectedAirlineCode();

  try{
    const {data,error}=await supabase.rpc(ADDON_RPC,{
      p_airline_code:code
    });

    if(error) throw error;

    addonCatalog=(data||[]).map(x=>({
      ...x,
      selling_price:Number(x.selling_price||0),
      weight_kg:x.weight_kg==null?null:Number(x.weight_kg)
    }));

    restoreAddonSelection();
    renderAddonChoices();

  }catch(error){
    console.error("[OTW] add-on catalog:",error);
    $("#addonLoading").classList.add("hidden");
    $("#addonError").classList.remove("hidden");
    $("#addonErrorText").textContent=error?.message||"Katalog add-on belum dapat dimuat.";
  }
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
    await loadAddonCatalog();
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
      await loadAddonCatalog();
      return;
    }

    throw new Error("Price-check belum tersedia");

  }catch(e){
    console.info("[OTW] price-check fallback:",e.message);
    setVerify("verified","Penerbangan siap dipilih","Menggunakan hasil pencarian real-time terakhir.");
    await applyOtwPricing(selected);
    await loadAddonCatalog();
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
$("#retryAddonBtn")?.addEventListener("click",loadAddonCatalog);

$("#continueBtn")?.addEventListener("click",()=>{
  if(!selected){
    toast("Pilih penerbangan terlebih dahulu.");
    return;
  }

  if(!pricingSnapshot){
    toast("Harga OTW belum berhasil dihitung.");
    return;
  }

  persistAddons();

  sessionStorage.setItem("otw_selected_flight",JSON.stringify(selected));
  sessionStorage.setItem("otw_flight_pricing",JSON.stringify(pricingSnapshot));

  if(offerId){
    sessionStorage.setItem("otw_selected_offer_id",offerId);
  }

  location.href="passenger-details.html";
});

await init();
