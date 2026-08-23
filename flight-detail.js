import { requireAuth } from "./guard.js";
import { supabase } from "./supabase.js";
try{await requireAuth({redirect:"login.html"});}catch(e){console.warn("[LetsGo] auth guard",e)}
const $=s=>document.querySelector(s);
const PRICING_RPC="calculate_public_flight_price";
const LOGOS={GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png","8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"};
const read=k=>{try{return JSON.parse(sessionStorage.getItem(k)||localStorage.getItem(k)||"null")}catch{return null}};
const rupiah=v=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0);
const hm=v=>{const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"};
const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d)};
const dur=m=>{m=Number(m||0);return m?`${Math.floor(m/60)}j ${m%60}m`:"—"};
const toast=m=>{const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)};
let selected=read("otw_selected_flight"), search=read("otw_search")||{}, pricing=null, catalog=[], bag=null, insurance=null;

function code(){const s=selected?.segments?.[0]||{};return String(s.carrier||selected?.airlineCode||"").toUpperCase()}
function paxCount(){const p=search?.passengers||{};return Number(p.adult??search.adults??1)+Number(p.child??search.children??0)+Number(p.infant??search.infants??0)||1}
function renderFlight(){
 if(!selected){$("#verifyTitle").textContent="Data penerbangan tidak ditemukan";$("#continueBtn").disabled=true;return}
 const segs=selected.segments||[],a=segs[0]||{},z=segs.at(-1)||a,c=code(),name=a.carrierName||selected.airlineName||"Maskapai";
 $("#airlineLogo").innerHTML=LOGOS[c]?`<img src="./${LOGOS[c]}" alt="${name}">`:c||"FL";$("#airlineName").textContent=name;$("#flightNumber").textContent=a.flightNumber||"—";
 $("#departureTime").textContent=hm(a.departureLocalTime||a.departureTime);$("#arrivalTime").textContent=hm(z.arrivalLocalTime||z.arrivalTime);
 $("#originCode").textContent=a.origin||selected.origin||search.origin||"---";$("#destinationCode").textContent=z.destination||selected.destination||search.destination||"---";
 const stops=Number(selected.stops??Math.max(0,segs.length-1));$("#stopBadge").textContent=stops?`${stops} Transit`:"Langsung";$("#routeType").textContent=stops?`${stops} transit`:"Langsung";
 $("#durationLabel").textContent=dur(selected.totalDuration||a.duration);$("#flightDate").textContent=date(a.departureLocalTime||a.departureTime||search.departDate);
 $("#cabinClass").textContent=a.cabinClass||selected.cabin||"Ekonomi";$("#baggage").textContent=`Bagasi ${a.baggageAllowance||selected.baggage||"sesuai fare"}`;$("#paxNote").textContent=`${paxCount()} penumpang`;
}
async function loadPricing(){
 const supplier=Number(selected?.supplierTotalPrice??selected?.totalPrice??selected?.displayPrice??0);
 if(!supplier){toast("Harga penerbangan tidak tersedia.");return}
 const {data,error}=await supabase.rpc(PRICING_RPC,{p_supplier_price:supplier});
 if(error){console.error(error);toast("Konfigurasi harga belum dapat dimuat.");return}
 const r=Array.isArray(data)?data[0]:data;if(!r)return;
 const serviceFee=Number(r.service_fee)||150000;
 const ticketPrice=Number(r.ticket_price)||0;
 pricing={supplierPrice:supplier,ticketPrice,serviceFee,totalPrice:ticketPrice+serviceFee,currency:r.currency||"IDR",pricingUpdatedAt:r.pricing_updated_at||null,source:"LETSGO_ADMIN_PRICING"};
 selected={...selected,displayPrice:pricing.totalPrice,letsgoPricing:pricing};
 sessionStorage.setItem("otw_selected_flight",JSON.stringify(selected));sessionStorage.setItem("otw_flight_pricing",JSON.stringify(pricing));
 $("#flightPrice").textContent=rupiah(pricing.ticketPrice);$("#serviceFeePrice").textContent=rupiah(pricing.serviceFee);updateTotal();$("#continueBtn").disabled=false;$("#verifyTitle").textContent="Harga & detail siap";$("#verifyText").textContent="Silakan pilih layanan tambahan bila diperlukan.";
}
async function loadAddons(){
 const c=code();if(!c){renderOptions();return}
 const {data,error}=await supabase.rpc("get_public_addon_catalog",{p_airline_code:c});
 if(error){console.warn("[LetsGo] add-on",error);catalog=[]}else catalog=data||[];
 renderOptions();
}
function renderOptions(){
 const bags=catalog.filter(x=>x.addon_type==="BAGGAGE"&&(x.airline_code==="ALL"||x.airline_code===code()));
 const ins=catalog.filter(x=>x.addon_type==="INSURANCE"&&(x.airline_code==="ALL"||x.airline_code===code()));
 $("#baggageOptions").innerHTML=`<button class="option ${!bag?"active":""}" data-bag=""><b>Tanpa tambahan</b><small>Gunakan bagasi fare</small><strong>Rp0</strong></button>`+bags.map(x=>`<button class="option ${bag?.id===x.id?"active":""}" data-bag="${x.id}"><b>${x.addon_name}</b><small>${x.weight_kg?`Tambahan ${x.weight_kg} kg`:"Bagasi tambahan"}</small><strong>${rupiah(x.selling_price)}</strong></button>`).join("");
 $("#insuranceOptions").innerHTML=`<button class="option ${!insurance?"active":""}" data-ins=""><b>Tanpa asuransi</b><small>Tidak dipilih</small><strong>Rp0</strong></button>`+ins.map(x=>`<button class="option ${insurance?.id===x.id?"active":""}" data-ins="${x.id}"><b>${x.addon_name}</b><small>Perlindungan perjalanan</small><strong>${rupiah(x.selling_price)}</strong></button>`).join("");
 document.querySelectorAll("[data-bag]").forEach(b=>b.onclick=()=>{bag=catalog.find(x=>String(x.id)===b.dataset.bag)||null;renderOptions();updateTotal()});
 document.querySelectorAll("[data-ins]").forEach(b=>b.onclick=()=>{insurance=catalog.find(x=>String(x.id)===b.dataset.ins)||null;renderOptions();updateTotal()});
}
function addonPayload(){
 const baggage=bag?[{passengerIndex:0,addonId:bag.id,addonName:bag.addon_name,weightKg:bag.weight_kg,sellingPrice:Number(bag.selling_price||0)}]:[];
 const ins=insurance?{addonId:insurance.id,addonName:insurance.addon_name,sellingPrice:Number(insurance.selling_price||0)}:null;
 return {airlineCode:code(),baggage,insurance:ins,total:baggage.reduce((a,x)=>a+x.sellingPrice,0)+(ins?.sellingPrice||0),currency:"IDR",savedAt:new Date().toISOString()};
}
function updateTotal(){const a=addonPayload();$("#addonPrice").textContent=rupiah(a.total);const total=Number(pricing?.totalPrice||0)+a.total;$("#grandPrice").textContent=$("#stickyPrice").textContent=rupiah(total)}
$("#continueBtn").onclick=()=>{if(!pricing)return toast("Tunggu harga selesai dimuat.");sessionStorage.setItem("otw_flight_addons",JSON.stringify(addonPayload()));location.href="passenger-details.html"};
$("#backBtn").onclick=()=>history.back();
renderFlight();await Promise.all([loadPricing(),loadAddons()]);