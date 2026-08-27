import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

"use strict";

const $=(s,r=document)=>r.querySelector(s);
const PRIMARY_PREFIX="letsgo_";
const LEGACY_PREFIX=String.fromCharCode(111,116,119)+"_";
const SERVICE_FEE_FALLBACK=150000;

const LOGOS={
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};
const NAME_CODES={
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};

function readState(name){
  for(const key of [PRIMARY_PREFIX+name,LEGACY_PREFIX+name]){
    try{
      const raw=sessionStorage.getItem(key)||localStorage.getItem(key);
      if(raw)return JSON.parse(raw);
    }catch{}
  }
  return null;
}
function writeState(name,value){sessionStorage.setItem(PRIMARY_PREFIX+name,JSON.stringify(value))}
function readTextState(name){
  return sessionStorage.getItem(PRIMARY_PREFIX+name)||sessionStorage.getItem(LEGACY_PREFIX+name)||"";
}

let flight=readState("selected_flight");
let passengerData=readState("passenger_details");
let search=readState("search")||flight?.searchSnapshot||{};
let flightPricing=readState("flight_pricing")||passengerData?.pricing||flight?.letsgoPricing||null;
let addons=readState("flight_addons")||{baggage:[],insurance:null,total:0,currency:"IDR"};
let session=null;
let bookingSubmitting=false;

let pricing={
  ticketFare:0,serviceFee:SERVICE_FEE_FALLBACK,baggage:0,insurance:0,addonsTotal:0,flightTotal:0,grandTotal:0
};

function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"}
function dateLabel(v){const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d)}
function duration(min){min=Number(min||0);return min?`${Math.floor(min/60)}j ${min%60}m`:"—"}
function toast(m){const e=$("#toast");if(!e)return;e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function codeFor(c,n){c=String(c||"").toUpperCase();return LOGOS[c]?c:(NAME_CODES[String(n||"").toLowerCase()]||c||"FL")}

function validateState(){
  if(!flight)throw new Error("Data penerbangan tidak ditemukan.");
  if(!passengerData?.passengers?.length)throw new Error("Data penumpang belum lengkap.");
  if(!passengerData?.spt?.documentId)throw new Error("SPT belum terhubung.");
  if(!flightPricing)throw new Error("Pricing LetsGo tidak ditemukan.");
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
  const {segs,first:a,last:z,destination}=resolveOutbound(flight,search);
  const name=a.carrierName||flight?.airlineName||"Maskapai";
  const code=codeFor(a.carrier||flight?.airlineCode,name),logo=LOGOS[code];

  $("#airlineLogo").innerHTML=logo?`<img src="./${logo}?v=20260824" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`:`<span>${esc(code)}</span>`;
  $("#airlineName").textContent=name;
  $("#flightNumber").textContent=a.flightNumber||flight?.flightNumber||"—";
  $("#origin").textContent=a.origin||flight?.origin||search.origin||"---";
  $("#destination").textContent=destination||z.destination||flight?.destination||"---";
  $("#departTime").textContent=hm(a.departureLocalTime||a.departureTime||flight?.departureTime);
  $("#arriveTime").textContent=hm(z.arrivalLocalTime||z.arrivalTime||flight?.arrivalTime);
  $("#flightDate").textContent=dateLabel(a.departureLocalTime||a.departureTime||flight?.departureTime||search.departDate);
  $("#duration").textContent=duration(flight?.totalDuration||a.duration);

  const stops=Number(flight?.stops??Math.max(0,segs.length-1));
  $("#stopBadge").textContent=stops?`${stops} transit`:"Langsung";
  $("#routeType").textContent=stops?`${stops} kali transit`:"Penerbangan langsung";
  $("#baggage").textContent=`Bagasi ${a.baggageAllowance||flight?.baggage||"sesuai fare"}`;
  $("#cabin").textContent=a.cabinClass||flight?.cabin||search.cabin||"Ekonomi";
  $("#modalRoute").textContent=`${$("#origin").textContent} → ${$("#destination").textContent}`;
}
function renderPassengers(){
  const list=$("#passengerList"),pax=passengerData?.passengers||[];
  list.innerHTML="";
  pax.forEach((p,i)=>{
    const el=document.createElement("article");el.className="pax-card";
    const id=String(p.identityNumber||"");
    const masked=id.length>4?`${"•".repeat(Math.min(8,id.length-4))}${id.slice(-4)}`:id||"—";
    el.innerHTML=`
      <span class="pax-num">${i+1}</span>
      <div class="pax-main"><strong>${esc([p.title,p.fullName].filter(Boolean).join(" "))}</strong><small>${esc(p.label||p.type||"Penumpang")} · ${esc(p.gender==="M"?"Laki-laki":p.gender==="F"?"Perempuan":"—")}</small></div>
      <div class="pax-id"><strong>${esc(p.identityType||"Identitas")}</strong><small>${esc(masked)}</small></div>`;
    list.appendChild(el);
  });
  $("#paxPriceNote").textContent=`${pax.length} penumpang · harga penerbangan LetsGo`;
}
function renderSpt(){
  const s=passengerData?.spt||readState("uploaded_spt");
  $("#sptName").textContent=s?.fileName||s?.file_name||"Surat Perintah Tugas";
  const size=Number(s?.fileSize||s?.file_size||0);
  $("#sptMeta").textContent=size?`${(size/1024/1024).toFixed(2)} MB · tersimpan aman`:"Dokumen tersimpan aman";
}
function renderAddons(){
  const list=$("#addonsList"),empty=$("#addonsEmpty");
  list.innerHTML="";
  const baggage=Array.isArray(addons?.baggage)?addons.baggage:[];
  const insurance=addons?.insurance||null;
  empty.classList.toggle("hidden",Boolean(baggage.length||insurance));

  baggage.forEach(item=>{
    const passenger=passengerData?.passengers?.[item.passengerIndex];
    const row=document.createElement("div");row.className="addon-review-row";
    row.innerHTML=`<div class="addon-review-main"><span class="addon-review-icon"><svg viewBox="0 0 24 24"><path d="M8 7V5a4 4 0 0 1 8 0v2"/><rect x="4" y="7" width="16" height="13" rx="3"/></svg></span><div class="addon-review-copy"><strong>${esc(item.addonName||`Bagasi +${item.weightKg||0} kg`)}</strong><small>${esc(passenger?.fullName||`Penumpang ${Number(item.passengerIndex||0)+1}`)}</small></div></div><b>${rupiah(item.sellingPrice)}</b>`;
    list.appendChild(row);
  });

  if(insurance){
    const row=document.createElement("div");row.className="addon-review-row";
    row.innerHTML=`<div class="addon-review-main"><span class="addon-review-icon"><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg></span><div class="addon-review-copy"><strong>${esc(insurance.addonName||"Asuransi perjalanan")}</strong><small>Perlindungan perjalanan</small></div></div><b>${rupiah(insurance.sellingPrice)}</b>`;
    list.appendChild(row);
  }

  pricing.baggage=baggage.reduce((sum,x)=>sum+Number(x.sellingPrice||0),0);
  pricing.insurance=Number(insurance?.sellingPrice||0);
  pricing.addonsTotal=pricing.baggage+pricing.insurance;

  $("#addonsTotal").textContent=rupiah(pricing.addonsTotal);
  $("#reviewBaggageTotal").textContent=rupiah(pricing.baggage);
  $("#reviewInsuranceTotal").textContent=rupiah(pricing.insurance);
}
function renderPricing(){
  const serviceFee=Number(flightPricing?.serviceFee)||SERVICE_FEE_FALLBACK;
  const ticketFare=Number(flightPricing?.ticketPrice)||Math.max(0,Number(flightPricing?.totalPrice||0)-serviceFee);
  const flightTotal=ticketFare+serviceFee;

  pricing.ticketFare=ticketFare;
  pricing.serviceFee=serviceFee;
  pricing.flightTotal=flightTotal;
  pricing.grandTotal=flightTotal+pricing.addonsTotal;

  $("#ticketPrice").textContent=rupiah(flightTotal);
  $("#ticketFare").textContent=rupiah(ticketFare);
  $("#serviceFee").textContent=rupiah(serviceFee);
  $("#grandTotal").textContent=$("#stickyTotal").textContent=$("#modalTotal").textContent=rupiah(pricing.grandTotal);
  $("#priceEquation").textContent=`${rupiah(ticketFare)} + ${rupiah(serviceFee)} + ${rupiah(pricing.addonsTotal)} = ${rupiah(pricing.grandTotal)}`;
}
function openModal(){
  if(!$("#agreementCheck").checked){
    $("#agreementError").textContent="Centang konfirmasi sebelum melanjutkan.";
    return toast("Konfirmasi data terlebih dahulu.");
  }
  $("#agreementError").textContent="";
  $("#confirmModal").classList.remove("hidden");
  document.body.style.overflow="hidden";
}
function closeModal(){
  $("#confirmModal").classList.add("hidden");
  document.body.style.overflow="";
}
function generateOrderCode(){
  const d=new Date();
  const date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("");
  const suffix=crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
  return`LG-${date}-${suffix}`;
}
function normalizedAddonRows(){
  const rows=[];
  (addons?.baggage||[]).forEach(item=>rows.push({
    passengerIndex:Number(item.passengerIndex||0),
    addonType:"BAGGAGE",
    addonName:item.addonName||`Bagasi +${item.weightKg||0} kg`,
    airlineCode:addons?.airlineCode||null,
    weightKg:Number(item.weightKg||0)||null,
    quantity:1,
    unitPrice:Number(item.sellingPrice||0),
    totalPrice:Number(item.sellingPrice||0),
    supplierReference:String(item.addonId||"")||null,
    payload:item
  }));
  if(addons?.insurance)rows.push({
    passengerIndex:null,
    addonType:"INSURANCE",
    addonName:addons.insurance.addonName||"Asuransi perjalanan",
    airlineCode:addons?.airlineCode||null,
    weightKg:null,
    quantity:1,
    unitPrice:Number(addons.insurance.sellingPrice||0),
    totalPrice:Number(addons.insurance.sellingPrice||0),
    supplierReference:String(addons.insurance.addonId||"")||null,
    payload:addons.insurance
  });
  return rows;
}
function passengerRows(){
  return (passengerData?.passengers||[]).map((p,index)=>({
    passengerIndex:index,
    passengerType:p.type||"ADULT",
    title:p.title||null,
    fullName:p.fullName,
    phone:index===0?passengerData?.contact?.phone||null:null,
    email:index===0?passengerData?.contact?.email||null:null,
    identityType:p.identityType||null,
    identityNumber:p.identityNumber||null,
    birthDate:p.birthDate||null,
    gender:p.gender||null,
    nationality:p.nationality||"ID",
    passportCountry:p.passportCountry||null,
    passportExpiry:p.passportExpiry||null
  }));
}
async function submitOrder(orderCode){
  const {segs,first,last,destination}=resolveOutbound(flight,search);
  const payload={
    flightOfferId:readTextState("selected_offer_id")||flight?.offerId||"",
    flight,
    passengerDetails:passengerData,
    addons,
    pricing:{
      supplierPrice:Number(flightPricing?.supplierPrice||0),
      ticketFare:pricing.ticketFare,
      serviceFee:pricing.serviceFee,
      flightTotal:pricing.flightTotal,
      baggageTotal:pricing.baggage,
      insuranceTotal:pricing.insurance,
      addonsTotal:pricing.addonsTotal,
      grandTotal:pricing.grandTotal,
      currency:flightPricing?.currency||"IDR",
      source:flightPricing?.source||"LETSGO_ADMIN_PRICING",
      pricingUpdatedAt:flightPricing?.pricingUpdatedAt||null
    },
    status:"SUBMITTED",
    confirmedAt:new Date().toISOString()
  };

  const orderInput={
    orderCode,
    status:"SUBMITTED",
    origin:first.origin||flight?.origin||null,
    destination:destination||last.destination||flight?.destination||null,
    airlineCode:first.carrier||flight?.airlineCode||null,
    airlineName:first.carrierName||flight?.airlineName||null,
    flightNumber:first.flightNumber||flight?.flightNumber||null,
    departAt:first.departureLocalTime||first.departureTime||flight?.departureTime||null,
    arrivalAt:last.arrivalLocalTime||last.arrivalTime||flight?.arrivalTime||null,
    cabinClass:first.cabinClass||flight?.cabin||search.cabin||"Ekonomi",
    passengerCount:(passengerData?.passengers||[]).length||1,
    supplierPrice:Number(flightPricing?.supplierPrice||0),
    ticketPrice:pricing.ticketFare,
    serviceFee:pricing.serviceFee,
    addonsTotal:pricing.addonsTotal,
    grandTotal:pricing.grandTotal,
    currency:flightPricing?.currency||"IDR",
    sptPath:passengerData?.spt?.filePath||null,
    payload
  };

  const {data,error}=await supabase.rpc("submit_flight_order",{
    p_order:orderInput,
    p_passengers:passengerRows(),
    p_addons:normalizedAddonRows(),
    p_document_id:passengerData?.spt?.documentId||null
  });
  if(error){
    const msg=String(error?.message||"");
    if(/harga penerbangan tidak dapat diverifikasi|verifik/i.test(msg)){
      console.error("[LetsGo Trusted Quote]",{
        offerId: payload.flightOfferId,
        supplierPrice: payload.pricing.supplierPrice,
        origin: orderInput.origin,
        destination: orderInput.destination
      });
    }
    throw error;
  }
  return {result:data,payload};
}
async function finalConfirm(){
  if(bookingSubmitting)return;
  const btn=$("#finalConfirmBtn"),old=btn.innerHTML;
  bookingSubmitting=true;btn.disabled=true;btn.innerHTML="<span>Mengirim pengajuan...</span>";

  try{
    session=await requireAuth({redirect:"login.html",splash:"index.html"});
    if(!session)return;

    let orderCode=generateOrderCode();
    let result;
    try{
      result=await submitOrder(orderCode);
    }catch(error){
      // Retry once on rare duplicate order code.
      if(String(error?.code)==="23505"||/duplicate/i.test(String(error?.message||""))){
        orderCode=generateOrderCode();
        result=await submitOrder(orderCode);
      }else throw error;
    }

    writeState("flight_review",result.payload);
    writeState("last_order",{
      id:result.result?.order_id||result.result?.id||null,
      orderCode,
      status:"SUBMITTED",
      createdAt:new Date().toISOString()
    });

    closeModal();
    toast("Pengajuan perjalanan berhasil dikirim.");
    setTimeout(()=>location.href=`detail-pesanan.html?id=${encodeURIComponent(orderCode)}`,450);
  }catch(error){
    console.error("[LetsGo Submit Order]",error);
    toast(error?.message||"Pengajuan belum berhasil dikirim.");
  }finally{
    bookingSubmitting=false;btn.disabled=false;btn.innerHTML=old;
  }
}
function bind(){
  $("#backBtn").onclick=()=>history.back();
  $("#editFlightBtn").onclick=()=>location.href="search-flight.html";
  $("#editPassengersBtn").onclick=()=>location.href="passenger-details.html";
  $("#editSptBtn").onclick=()=>location.href="passenger-details.html";
  $("#editAddonsBtn").onclick=()=>location.href="flight-detail.html";
  $("#confirmBtn").onclick=openModal;
  $("#closeModalBtn").onclick=closeModal;
  $("#cancelModalBtn").onclick=closeModal;
  $("#finalConfirmBtn").onclick=finalConfirm;
  $("#confirmModal").addEventListener("click",e=>{if(e.target===$("#confirmModal"))closeModal()});
  $("#agreementCheck").addEventListener("change",()=>{if($("#agreementCheck").checked)$("#agreementError").textContent=""});
}
async function init(){
  try{
    session=await requireAuth({redirect:"login.html",splash:"index.html"});
    if(!session)return;
    validateState();
    renderFlight();renderPassengers();renderSpt();renderAddons();renderPricing();bind();
  }catch(error){
    console.error("[LetsGo Flight Review]",error);
    toast(error?.message||"Review belum dapat dimuat.");
    $("#confirmBtn").disabled=true;
  }
}
init();
