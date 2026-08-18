(() => {
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const LOGOS={GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png","8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"};
const NAME_CODES={"garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID","super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP","wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"};
const SERVICE_FEE=150000;

let flight=read("otw_selected_flight");
let passengerData=read("otw_passenger_details");
let search=read("otw_search")||flight?.searchSnapshot||{};
let pricing={ticket:0,base:0,tax:0,total:0};

function read(k){try{return JSON.parse(sessionStorage.getItem(k)||localStorage.getItem(k)||"null")}catch{return null}}
function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"}
function dateLabel(v){const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d)}
function duration(min){min=Number(min||0);return min?`${Math.floor(min/60)}j ${min%60}m`:"—"}
function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function codeFor(c,n){c=String(c||"").toUpperCase();return LOGOS[c]?c:(NAME_CODES[String(n||"").toLowerCase()]||c||"FL")}

function renderFlight(){
 if(!flight){toast("Data penerbangan tidak ditemukan.");return}
 const segs=flight.segments||[],a=segs[0]||{},z=segs[segs.length-1]||a;
 const name=a.carrierName||flight.airlineName||"Maskapai",code=codeFor(a.carrier||flight.airlineCode,name),logo=LOGOS[code];
 $("#airlineLogo").innerHTML=logo?`<img src="./${logo}?v=20260819" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`:`<span>${esc(code)}</span>`;
 $("#airlineName").textContent=name;$("#flightNumber").textContent=a.flightNumber||flight.flightNumber||"—";
 $("#origin").textContent=a.origin||flight.origin||search.origin||"---";$("#destination").textContent=z.destination||flight.destination||search.destination||"---";
 $("#departTime").textContent=hm(a.departureLocalTime||a.departureTime||flight.departureTime);$("#arriveTime").textContent=hm(z.arrivalLocalTime||z.arrivalTime||flight.arrivalTime);
 $("#flightDate").textContent=dateLabel(a.departureLocalTime||a.departureTime||flight.departureTime||search.departDate);
 $("#duration").textContent=duration(flight.totalDuration||a.duration);
 const stops=Number(flight.stops??Math.max(0,segs.length-1));$("#stopBadge").textContent=stops?`${stops} transit`:"Langsung";$("#routeType").textContent=stops?`${stops} kali transit`:"Penerbangan langsung";
 $("#baggage").textContent=`Bagasi ${a.baggageAllowance||flight.baggage||"sesuai fare"}`;$("#cabin").textContent=a.cabinClass||flight.cabin||search.cabinClass||"Ekonomi";
 $("#modalRoute").textContent=`${$("#origin").textContent} → ${$("#destination").textContent}`;
}

function renderPassengers(){
 const list=$("#passengerList"),pax=passengerData?.passengers||[];list.innerHTML="";
 if(!pax.length){list.innerHTML='<div class="pax-card"><div class="pax-main"><strong>Data penumpang belum tersedia</strong></div></div>';return}
 pax.forEach((p,i)=>{
  const el=document.createElement("article");el.className="pax-card";
  const id=String(p.identityNumber||"");const masked=id.length>4?`${"•".repeat(Math.min(8,id.length-4))}${id.slice(-4)}`:id||"—";
  el.innerHTML=`<span class="pax-num">${i+1}</span><div class="pax-main"><strong>${esc([p.title,p.fullName].filter(Boolean).join(" "))}</strong><small>${esc(p.label||p.type||"Penumpang")} · ${esc(p.gender==="M"?"Laki-laki":p.gender==="F"?"Perempuan":p.gender||"—")}</small></div><div class="pax-id"><strong>${esc(p.identityType||"Identitas")}</strong><small>${esc(masked)}</small></div>`;
  list.appendChild(el);
 });
 $("#paxPriceNote").textContent=`${pax.length} penumpang · harga penerbangan terpilih`;
}

function renderSpt(){
 const s=passengerData?.spt||read("otw_uploaded_spt");
 if(!s){$("#sptName").textContent="SPT belum ditemukan";$("#sptMeta").textContent="Kembali dan upload dokumen";$(".verified").textContent="Belum ada";return}
 $("#sptName").textContent=s.fileName||s.file_name||"Surat Perintah Tugas";
 const size=Number(s.fileSize||s.file_size||0);$("#sptMeta").textContent=size?`${(size/1024/1024).toFixed(2)} MB · tersimpan aman`:"Dokumen tersimpan aman";
}

function renderPricing(){
 pricing.base=Number(flight?.basePrice||0);pricing.tax=Number(flight?.tax||0);pricing.ticket=Number(flight?.supplierTotalPrice||flight?.totalPrice||pricing.base+pricing.tax||0);
 // IMPORTANT: no invented 5% markup here. Markup will come from admin/server pricing configuration later.
 pricing.total=pricing.ticket+SERVICE_FEE;
 $("#ticketPrice").textContent=rupiah(pricing.ticket);$("#basePrice").textContent=rupiah(pricing.base);$("#taxPrice").textContent=rupiah(pricing.tax);
 $("#serviceFee").textContent=rupiah(SERVICE_FEE);$("#grandTotal").textContent=rupiah(pricing.total);$("#stickyTotal").textContent=rupiah(pricing.total);$("#modalTotal").textContent=rupiah(pricing.total);
}

function openModal(){
 if(!$("#agreementCheck").checked){$("#agreementError").textContent="Centang konfirmasi sebelum melanjutkan.";toast("Konfirmasi data terlebih dahulu.");return}
 $("#agreementError").textContent="";$("#confirmModal").classList.remove("hidden");document.body.style.overflow="hidden";
}
function closeModal(){$("#confirmModal").classList.add("hidden");document.body.style.overflow=""}
function finalConfirm(){
 const payload={
   flightOfferId:sessionStorage.getItem("otw_selected_offer_id")||flight?.offerId||"",
   flight,passengerDetails:passengerData,
   pricing:{supplierTotal:pricing.ticket,serviceFee:SERVICE_FEE,displayTotal:pricing.total,currency:flight?.currency||"IDR",markupStatus:"pending_admin_pricing"},
   status:"REVIEW_CONFIRMED",confirmedAt:new Date().toISOString()
 };
 sessionStorage.setItem("otw_flight_review",JSON.stringify(payload));
 closeModal();
 /*
   Deliberately NOT issuing a JetWize ticket here.
   Next integration step should point this to OTW's secure server booking endpoint.
 */
 toast("Review perjalanan berhasil dikonfirmasi.");
 setTimeout(()=>{location.href="flight-booking.html"},450);
}

function bind(){
 $("#backBtn").onclick=()=>history.back();
 $("#editFlightBtn").onclick=()=>location.href="search-flight.html";
 $("#editPassengersBtn").onclick=()=>location.href="passenger-details.html";
 $("#editSptBtn").onclick=()=>location.href="passenger-details.html";
 $("#confirmBtn").onclick=openModal;$("#closeModalBtn").onclick=closeModal;$("#cancelModalBtn").onclick=closeModal;$("#finalConfirmBtn").onclick=finalConfirm;
 $("#confirmModal").addEventListener("click",e=>{if(e.target===$("#confirmModal"))closeModal()});
 $("#agreementCheck").addEventListener("change",()=>{if($("#agreementCheck").checked)$("#agreementError").textContent=""});
}
function init(){renderFlight();renderPassengers();renderSpt();renderPricing();bind();console.info("[OTW] Flight Review Premium V1 ready")}
document.addEventListener("DOMContentLoaded",init);
})();