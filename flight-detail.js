import { supabase } from "./supabase.js";

const $ = (s) => document.querySelector(s);
const PRICING_RPC = "calculate_public_flight_price";
const SERVICE_FEE_FALLBACK = 150000;
const PRIMARY_PREFIX = "letsgo_";
const LEGACY_PREFIX = String.fromCharCode(111,116,119) + "_";

const LOGOS = {
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};

function readState(name){
  for(const key of [PRIMARY_PREFIX + name, LEGACY_PREFIX + name]){
    try{
      const raw=sessionStorage.getItem(key)||localStorage.getItem(key);
      if(raw) return JSON.parse(raw);
    }catch{}
  }
  return null;
}
function writeState(name,value){
  sessionStorage.setItem(PRIMARY_PREFIX + name, JSON.stringify(value));
}
function readTextState(name){
  return sessionStorage.getItem(PRIMARY_PREFIX+name)
    || sessionStorage.getItem(LEGACY_PREFIX+name)
    || localStorage.getItem(PRIMARY_PREFIX+name)
    || localStorage.getItem(LEGACY_PREFIX+name)
    || "";
}
const rupiah=v=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0);
const hm=v=>{const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"};
const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d)};
const dur=m=>{m=Number(m||0);return m?`${Math.floor(m/60)}j ${m%60}m`:"—"};
const toast=m=>{const e=$("#toast");if(!e)return;e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)};

let selected=readState("selected_flight");
let search=readState("search")||{};
let pricing=readState("flight_pricing");
let catalog=[];
let bag=null;
let insurance=null;

const previousAddons=readState("flight_addons");
if(previousAddons?.baggage?.length) bag=previousAddons.baggage[0]?._catalog||null;
if(previousAddons?.insurance?._catalog) insurance=previousAddons.insurance._catalog;

function airlineCode(){
  const s=selected?.segments?.[0]||{};
  return String(s.carrier||selected?.airlineCode||"").toUpperCase();
}
function passengerCount(){
  const p=search?.passengers||{};
  return Number(p.adult??search.adults??1)+Number(p.child??search.children??0)+Number(p.infant??search.infants??0)||1;
}

function resolveOutbound(flightData, searchData){
  const segs=Array.isArray(flightData?.segments)?flightData.segments:[];
  const origin=String(searchData?.origin||flightData?.origin||segs[0]?.origin||"").toUpperCase();
  const wanted=String(searchData?.destination||flightData?.destination||"").toUpperCase();
  let outbound=[];
  for(const seg of segs){
    outbound.push(seg);
    if(wanted && String(seg?.destination||"").toUpperCase()===wanted) break;
  }
  if(!outbound.length && segs.length) outbound=[segs[0]];
  const first=outbound[0]||{};
  let last=outbound.at(-1)||first;
  // Round-trip provider responses can contain the return leg in the same offer.
  // Never let the last return segment turn BTH→CGK into BTH→BTH.
  if(wanted && String(last?.destination||"").toUpperCase()!==wanted){
    const hit=segs.find(s=>String(s?.destination||"").toUpperCase()===wanted);
    if(hit) last=hit;
  }
  return {segs,outbound,first,last,origin,destination:wanted||String(last?.destination||"").toUpperCase()};
}

function renderFlight(){
  if(!selected){
    $("#verifyTitle").textContent="Data penerbangan tidak ditemukan";
    $("#verifyText").textContent="Kembali ke pencarian dan pilih penerbangan.";
    $("#continueBtn").disabled=true;
    return;
  }
  const {segs,first,last,destination}=resolveOutbound(selected,search);
  const code=airlineCode();
  const name=first.carrierName||selected.airlineName||"Maskapai";

  $("#airlineLogo").innerHTML=LOGOS[code]?`<img src="./${LOGOS[code]}" alt="${name}">`:code||"FL";
  $("#airlineName").textContent=name;
  $("#flightNumber").textContent=first.flightNumber||selected.flightNumber||"—";
  $("#departureTime").textContent=hm(first.departureLocalTime||first.departureTime||selected.departureTime);
  $("#arrivalTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime||selected.arrivalTime);
  $("#originCode").textContent=first.origin||selected.origin||search.origin||"---";
  $("#destinationCode").textContent=destination||last.destination||selected.destination||"---";

  const stops=Number(selected.stops??Math.max(0,segs.length-1));
  $("#stopBadge").textContent=stops?`${stops} Transit`:"Langsung";
  $("#routeType").textContent=stops?`${stops} transit`:"Langsung";
  $("#durationLabel").textContent=dur(selected.totalDuration||first.duration);
  $("#flightDate").textContent=date(first.departureLocalTime||first.departureTime||selected.departureTime||search.departDate);
  $("#cabinClass").textContent=first.cabinClass||selected.cabin||search.cabin||"Ekonomi";
  $("#baggage").textContent=`Bagasi ${first.baggageAllowance||selected.baggage||"sesuai fare"}`;
  $("#paxNote").textContent=`${passengerCount()} penumpang`;
}

function supplierPrice(){
  const candidates=[
    selected?.supplierTotalPrice,
    selected?.supplierPrice,
    selected?.rawPrice,
    selected?.letsgoPricing?.supplierPrice,
    pricing?.supplierPrice,
    selected?.totalPrice
  ];
  return Number(candidates.find(v=>Number(v)>0)||0);
}

async function loadPricing(){
  const supplier=supplierPrice();
  if(!supplier){
    toast("Harga penerbangan tidak tersedia.");
    $("#verifyTitle").textContent="Harga belum tersedia";
    return;
  }

  const {data,error}=await supabase.rpc(PRICING_RPC,{p_supplier_price:supplier});
  if(error){
    console.error("[LetsGo Pricing]",error);
    toast("Konfigurasi harga belum dapat dimuat.");
    $("#verifyTitle").textContent="Pricing belum tersedia";
    return;
  }

  const row=Array.isArray(data)?data[0]:data;
  if(!row) return;

  const serviceFee=Number(row.service_fee)||SERVICE_FEE_FALLBACK;
  const ticketPrice=Number(row.ticket_price)||supplier;
  pricing={
    supplierPrice:supplier,
    ticketPrice,
    serviceFee,
    totalPrice:ticketPrice+serviceFee,
    currency:row.currency||"IDR",
    pricingUpdatedAt:row.pricing_updated_at||null,
    source:"LETSGO_ADMIN_PRICING"
  };

  selected={...selected,displayPrice:pricing.totalPrice,letsgoPricing:pricing};
  writeState("selected_flight",selected);
  writeState("flight_pricing",pricing);

  $("#flightPrice").textContent=rupiah(pricing.ticketPrice);
  $("#serviceFeePrice").textContent=rupiah(pricing.serviceFee);
  updateTotal();
  $("#continueBtn").disabled=false;
  $("#verifyTitle").textContent="Harga & detail siap";
  $("#verifyText").textContent="Silakan pilih layanan tambahan bila diperlukan.";
}

async function loadAddons(){
  const code=airlineCode();
  if(!code){renderOptions();return}

  const {data,error}=await supabase.rpc("get_public_addon_catalog",{p_airline_code:code});
  if(error){
    console.warn("[LetsGo Add-on]",error);
    catalog=[];
  }else{
    catalog=data||[];
  }

  // Restore previous selection by id.
  const previous=readState("flight_addons");
  const bagId=previous?.baggage?.[0]?.addonId;
  const insuranceId=previous?.insurance?.addonId;
  if(bagId) bag=catalog.find(x=>String(x.id)===String(bagId))||null;
  if(insuranceId) insurance=catalog.find(x=>String(x.id)===String(insuranceId))||null;

  renderOptions();
}
function renderOptions(){
  const code=airlineCode();
  const bags=catalog.filter(x=>x.addon_type==="BAGGAGE"&&(x.airline_code==="ALL"||x.airline_code===code));
  const ins=catalog.filter(x=>x.addon_type==="INSURANCE"&&(x.airline_code==="ALL"||x.airline_code===code));

  $("#baggageOptions").innerHTML=
    `<button class="option ${!bag?"active":""}" data-bag=""><b>Tanpa tambahan</b><small>Gunakan bagasi fare</small><strong>Rp0</strong></button>`+
    bags.map(x=>`<button class="option ${String(bag?.id)===String(x.id)?"active":""}" data-bag="${x.id}"><b>${x.addon_name}</b><small>${x.weight_kg?`Tambahan ${x.weight_kg} kg`:"Bagasi tambahan"}</small><strong>${rupiah(x.selling_price)}</strong></button>`).join("");

  $("#insuranceOptions").innerHTML=
    `<button class="option ${!insurance?"active":""}" data-ins=""><b>Tanpa asuransi</b><small>Tidak dipilih</small><strong>Rp0</strong></button>`+
    ins.map(x=>`<button class="option ${String(insurance?.id)===String(x.id)?"active":""}" data-ins="${x.id}"><b>${x.addon_name}</b><small>Perlindungan perjalanan</small><strong>${rupiah(x.selling_price)}</strong></button>`).join("");

  document.querySelectorAll("[data-bag]").forEach(btn=>{
    btn.onclick=()=>{
      bag=catalog.find(x=>String(x.id)===btn.dataset.bag)||null;
      renderOptions();updateTotal();
    };
  });
  document.querySelectorAll("[data-ins]").forEach(btn=>{
    btn.onclick=()=>{
      insurance=catalog.find(x=>String(x.id)===btn.dataset.ins)||null;
      renderOptions();updateTotal();
    };
  });
}

function addonPayload(){
  const baggage=bag?[{
    passengerIndex:0,
    addonId:bag.id,
    addonName:bag.addon_name,
    weightKg:Number(bag.weight_kg||0),
    sellingPrice:Number(bag.selling_price||0)
  }]:[];

  const ins=insurance?{
    addonId:insurance.id,
    addonName:insurance.addon_name,
    sellingPrice:Number(insurance.selling_price||0)
  }:null;

  return {
    airlineCode:airlineCode(),
    baggage,
    insurance:ins,
    total:baggage.reduce((a,x)=>a+x.sellingPrice,0)+(ins?.sellingPrice||0),
    currency:"IDR",
    savedAt:new Date().toISOString()
  };
}
function updateTotal(){
  const addons=addonPayload();
  $("#addonPrice").textContent=rupiah(addons.total);
  const total=Number(pricing?.totalPrice||0)+addons.total;
  $("#grandPrice").textContent=$("#stickyPrice").textContent=rupiah(total);
}
async function continueFlow(){
  if(!pricing) return toast("Tunggu harga selesai dimuat.");

  writeState("flight_addons",addonPayload());

  const {data,error}=await supabase.auth.getSession();
  if(error) console.warn("[LetsGo Session]",error);

  if(!data?.session){
    const next=encodeURIComponent("passenger-details.html");
    location.href=`login.html?next=${next}`;
    return;
  }

  location.href="passenger-details.html";
}

$("#continueBtn").onclick=continueFlow;
$("#backBtn").onclick=()=>history.length>1?history.back():location.href="search-flight.html";

renderFlight();
await Promise.all([loadPricing(),loadAddons()]);
