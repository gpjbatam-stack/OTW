import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

const $=s=>document.querySelector(s);

const LOGOS={
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};
const NAME_CODES={
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};
const AIRPORTS={
  BTH:"Hang Nadim",CGK:"Soekarno-Hatta",DPS:"I Gusti Ngurah Rai",SUB:"Juanda",
  KNO:"Kualanamu",PKU:"Sultan Syarif Kasim II",PLM:"Sultan Mahmud Badaruddin II",
  BPN:"Sultan Aji Muhammad Sulaiman",UPG:"Sultan Hasanuddin",SOC:"Adi Soemarmo",
  YIA:"Yogyakarta International"
};
const STATUS={
  SUBMITTED:{badge:"Diajukan",klass:"status-submitted",kicker:"PENGAJUAN DITERIMA",title:"Perjalanan sedang diproses.",text:"LetsGo sedang memeriksa detail perjalanan, dokumen, harga, dan ketersediaan.",footer:"Diajukan",action:"Kembali ke Pesanan"},
  PROCESSING:{badge:"Diproses",klass:"status-processing",kicker:"SEDANG DIPROSES",title:"LetsGo sedang menyiapkan perjalanan.",text:"Harga dan ketersediaan sedang diverifikasi untuk proses berikutnya.",footer:"Sedang diproses",action:"Lihat Pesanan"},
  VERIFIED:{badge:"Terverifikasi",klass:"status-processing",kicker:"VERIFIKASI SELESAI",title:"Pengajuan sudah terverifikasi.",text:"Detail perjalanan telah diperiksa dan siap masuk tahap penerbitan.",footer:"Terverifikasi",action:"Lihat Pesanan"},
  ISSUED:{badge:"Tiket terbit",klass:"status-issued",kicker:"TIKET SIAP",title:"Perjalanan Anda siap.",text:"Tiket telah diterbitkan. Dokumen perjalanan dapat dibuka dari halaman ini.",footer:"Tiket terbit",action:"Buka Tiket"},
  COMPLETED:{badge:"Selesai",klass:"status-issued",kicker:"PERJALANAN SELESAI",title:"Perjalanan selesai. Pembayaran tersedia.",text:"Invoice telah diterbitkan. Selesaikan pembayaran dalam tempo 14 hari sejak pesanan ditandai selesai.",footer:"Menunggu pembayaran",action:"Bayar Sekarang"},
  CANCELLED:{badge:"Dibatalkan",klass:"status-cancelled",kicker:"PESANAN DIBATALKAN",title:"Pengajuan tidak dilanjutkan.",text:"Lihat catatan LetsGo atau hubungi Pusat Bantuan untuk informasi lebih lanjut.",footer:"Dibatalkan",action:"Pusat Bantuan"}
};

let session=null,order=null,passengers=[],addons=[],documents=[],paymentTimerId=null;

function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0)}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"}
function dateLabel(v,long=false){
  if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";
  return new Intl.DateTimeFormat("id-ID",long?{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}:{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d);
}
function duration(m){m=Number(m||0);return m?`${Math.floor(m/60)}j ${m%60}m`:"—"}
function maskId(v){const s=String(v||"");return !s?"—":s.length>4?`${"•".repeat(Math.min(8,s.length-4))}${s.slice(-4)}`:s}
function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2200)}
function orderCodeFromUrl(){return new URLSearchParams(location.search).get("id")||""}
function resolveAirlineCode(flight){
  const seg=flight?.segments?.[0]||{};
  const direct=String(seg.carrier||flight?.airlineCode||order?.airline_code||"").toUpperCase();
  if(LOGOS[direct])return direct;
  const name=String(seg.carrierName||flight?.airlineName||order?.airline_name||"").toLowerCase();
  return NAME_CODES[name]||direct||"FL";
}
async function loadData(){
  const code=orderCodeFromUrl();
  if(!code)throw new Error("Nomor pesanan tidak ditemukan pada URL.");

  const {data,error}=await supabase.from("flight_orders").select("*").eq("order_code",code).single();
  if(error)throw error;order=data;

  const [paxRes,addonRes,docRes]=await Promise.all([
    supabase.from("flight_passengers").select("*").eq("order_id",order.id).order("passenger_index"),
    supabase.from("flight_order_addons").select("*").eq("order_id",order.id).order("created_at"),
    supabase.from("trip_documents").select("*").eq("order_id",order.id).order("uploaded_at")
  ]);

  if(paxRes.error)console.warn("[LetsGo Passengers]",paxRes.error);
  if(addonRes.error)console.warn("[LetsGo Add-ons]",addonRes.error);
  if(docRes.error)console.warn("[LetsGo Documents]",docRes.error);

  passengers=paxRes.data||[];
  addons=addonRes.data||[];
  documents=docRes.data||[];
}
function renderStatus(){
  const state=STATUS[String(order.status||"SUBMITTED").toUpperCase()]||STATUS.SUBMITTED;
  $("#statusBadge").className=`status-badge ${state.klass}`;
  $("#statusBadge").innerHTML=`<i></i>${state.badge}`;
  $("#statusKicker").textContent=state.kicker;$("#statusTitle").textContent=state.title;$("#statusText").textContent=state.text;
  $("#footerStatus").textContent=state.footer;$("#primaryActionBtn").textContent=state.action;

  const status=String(order.status||"").toUpperCase();
  $("#paymentSection")?.classList.toggle("hidden",status!=="COMPLETED");

  const note=order.payload?.adminNotes||order.payload?.admin_notes||"";
  if(note){$("#adminNoteSection").classList.remove("hidden");$("#adminNote").textContent=note}
}
function renderFlight(){
  const payload=order.payload||{},flight=payload.flight||{},segs=flight.segments||[],first=segs[0]||{},last=segs.at(-1)||first;
  const name=first.carrierName||flight.airlineName||order.airline_name||"Maskapai",code=resolveAirlineCode(flight);

  $("#airlineLogo").innerHTML=LOGOS[code]?`<img src="./${LOGOS[code]}?v=20260824" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`:`<span>${esc(code)}</span>`;
  $("#airlineName").textContent=name;
  $("#flightNumber").textContent=first.flightNumber||flight.flightNumber||order.flight_number||"—";
  $("#departTime").textContent=hm(first.departureLocalTime||first.departureTime||order.depart_at);
  $("#arriveTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime||order.arrival_at);
  $("#origin").textContent=first.origin||flight.origin||order.origin||"---";
  $("#destination").textContent=last.destination||flight.destination||order.destination||"---";
  $("#originName").textContent=AIRPORTS[$("#origin").textContent]||"Bandara asal";
  $("#destinationName").textContent=AIRPORTS[$("#destination").textContent]||"Bandara tujuan";
  $("#flightDate").textContent=dateLabel(first.departureLocalTime||first.departureTime||order.depart_at);
  $("#duration").textContent=duration(flight.totalDuration||flight.durationMinutes||first.duration);
  $("#cabin").textContent=first.cabinClass||flight.cabin||order.cabin_class||"Ekonomi";
  $("#baggage").textContent=`Bagasi ${first.baggageAllowance||flight.baggage||"sesuai fare"}`;
  const stops=Number(flight.stops??Math.max(0,segs.length-1));
  $("#stops").textContent=stops?`${stops} transit`:"Langsung";
  $("#tripTypePill").textContent=(flight.searchSnapshot||{}).trip==="roundtrip"?"Pulang-pergi":"Sekali jalan";
}
function renderTimeline(){
  const status=String(order.status||"SUBMITTED").toUpperCase();
  const rank={SUBMITTED:1,PROCESSING:2,VERIFIED:3,ISSUED:4,COMPLETED:5,CANCELLED:2}[status]||1;
  const steps=[
    {title:"Pengajuan diterima",text:"Data perjalanan berhasil masuk ke LetsGo.",time:dateLabel(order.created_at,true)},
    {title:"Verifikasi LetsGo",text:"Harga, ketersediaan, add-on, dan dokumen diperiksa.",time:""},
    {title:"Pengajuan terverifikasi",text:"Pesanan siap diproses ke supplier.",time:""},
    {title:"Tiket diterbitkan",text:"E-ticket tersedia untuk perjalanan Anda.",time:""},
    {title:"Perjalanan selesai",text:"Seluruh proses perjalanan telah selesai.",time:""}
  ];
  const card=$("#timelineCard");card.innerHTML="";
  steps.forEach((s,index)=>{
    const stepRank=index+1,klass=stepRank<rank?"done":stepRank===rank?"current":"";
    const row=document.createElement("div");row.className=`timeline-step ${klass}`;
    row.innerHTML=`<div class="timeline-node"><span class="timeline-dot">${stepRank<rank?"✓":stepRank}</span>${index<steps.length-1?'<i class="timeline-line"></i>':""}</div><div class="timeline-copy"><strong>${esc(s.title)}</strong><small>${esc(s.text)}</small></div><span class="timeline-time">${esc(s.time)}</span>`;
    card.appendChild(row);
  });
}
function renderPassengers(){
  const fallback=order.payload?.passengerDetails?.passengers||[];
  const data=passengers.length?passengers:fallback;
  $("#passengerCount").textContent=`${data.length||order.passenger_count||1} orang`;
  const list=$("#passengerList");list.innerHTML="";

  data.forEach((x,i)=>{
    const fullName=x.full_name||x.fullName||`Penumpang ${i+1}`;
    const title=x.title||"";
    const type=x.passenger_type||x.type||x.label||"Penumpang";
    const identityType=x.identity_type||x.identityType||"IDENTITAS";
    const identityNumber=x.identity_number||x.identityNumber||"";
    const row=document.createElement("div");row.className="passenger-row";
    row.innerHTML=`<div class="passenger-main"><span class="passenger-avatar">${i+1}</span><div class="passenger-copy"><strong>${esc([title,fullName].filter(Boolean).join(" "))}</strong><small>${esc(type)}</small></div></div><div class="passenger-id"><strong>${esc(identityType)}</strong><small>${esc(maskId(identityNumber))}</small></div>`;
    list.appendChild(row);
  });
}
function renderAddons(){
  const list=$("#addonList");list.innerHTML="";
  const relational=addons.length?addons:null;
  let baggage=[],insurance=[];

  if(relational){
    baggage=relational.filter(x=>x.addon_type==="BAGGAGE");
    insurance=relational.filter(x=>x.addon_type==="INSURANCE");
  }else{
    const legacy=order.payload?.addons||{};
    baggage=(legacy.baggage||[]).map(x=>({addon_name:x.addonName,total_price:x.sellingPrice,passenger_index:x.passengerIndex,weight_kg:x.weightKg}));
    insurance=legacy.insurance?[{addon_name:legacy.insurance.addonName,total_price:legacy.insurance.sellingPrice}]:[];
  }

  $("#addonState").textContent=baggage.length||insurance.length?`${baggage.length} bagasi${insurance.length?" + asuransi":""}`:"Tidak ada";
  $("#addonEmpty").classList.toggle("hidden",Boolean(baggage.length||insurance.length));

  [...baggage,...insurance].forEach(item=>{
    const isBag=item.addon_type==="BAGGAGE"||item.weight_kg!=null;
    const paxIndex=Number(item.passenger_index??0);
    const pax=passengers[paxIndex]||order.payload?.passengerDetails?.passengers?.[paxIndex];
    const row=document.createElement("div");row.className="addon-row";
    row.innerHTML=`<div class="addon-main"><span class="addon-icon"><svg viewBox="0 0 24 24">${isBag?'<path d="M8 7V5a4 4 0 0 1 8 0v2"/><rect x="4" y="7" width="16" height="13" rx="3"/>':'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>'}</svg></span><div class="addon-copy"><strong>${esc(item.addon_name||"Layanan tambahan")}</strong><small>${esc(isBag?(pax?.full_name||pax?.fullName||`Penumpang ${paxIndex+1}`):"Perlindungan perjalanan")}</small></div></div><strong class="addon-price">${rupiah(item.total_price||0)}</strong>`;
    list.appendChild(row);
  });
}
function sptDocument(){
  return documents.find(x=>String(x.document_type).toUpperCase()==="SPT")||null;
}
function renderSpt(){
  const doc=sptDocument();
  const fallback=order.payload?.passengerDetails?.spt||{};
  $("#sptName").textContent=doc?.file_name||fallback.fileName||fallback.file_name||"Surat Perintah Tugas";
  const size=Number(doc?.file_size||fallback.fileSize||fallback.file_size||0);
  $("#sptMeta").textContent=size?`${(size/1024/1024).toFixed(2)} MB · tersimpan aman`:order.spt_path?"Tersimpan di LetsGo":"Dokumen perjalanan tersimpan";
  $("#sptState").textContent=doc||order.spt_path?"Tersimpan":"Tercatat";
  $("#openSptBtn").disabled=!(doc?.file_path||order.spt_path);
}
function renderPricing(){
  const p=order.payload?.pricing||{};
  const ticket=Number(order.ticket_price??p.ticketFare??0);
  const service=Number(order.service_fee??p.serviceFee??150000);
  const baggageTotal=addons.length
    ? addons.filter(x=>x.addon_type==="BAGGAGE").reduce((s,x)=>s+Number(x.total_price||0),0)
    : Number(p.baggageTotal||0);
  const insuranceTotal=addons.length
    ? addons.filter(x=>x.addon_type==="INSURANCE").reduce((s,x)=>s+Number(x.total_price||0),0)
    : Number(p.insuranceTotal||0);
  const grand=Number(order.grand_total??p.grandTotal??ticket+service+baggageTotal+insuranceTotal);

  $("#ticketPrice").textContent=rupiah(ticket);
  $("#serviceFee").textContent=rupiah(service);
  $("#baggageTotal").textContent=rupiah(baggageTotal);
  $("#insuranceTotal").textContent=rupiah(insuranceTotal);
  $("#grandTotal").textContent=rupiah(grand);
  $("#priceEquation").textContent=`${rupiah(ticket)} + ${rupiah(service)} + ${rupiah(baggageTotal+insuranceTotal)}`;
}
function ticketPageUrl(){return`e-ticket.html?id=${encodeURIComponent(order?.order_code||orderCodeFromUrl())}`}
function paymentPageUrl(){return`payment.html?id=${encodeURIComponent(order?.order_code||orderCodeFromUrl())}`}
function invoicePageUrl(){return`invoice.html?id=${encodeURIComponent(order?.order_code||orderCodeFromUrl())}`}
function completedAt(){const p=order?.payload||{};return order?.completed_at||p?.ticketing?.completedAt||p?.completedAt||order?.updated_at||new Date().toISOString()}
function formatDeadline(v){const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}
function renderPaymentCountdown(){
  const section=$("#paymentSection");
  if(!section||String(order?.status||"").toUpperCase()!=="COMPLETED"){
    if(paymentTimerId){clearInterval(paymentTimerId);paymentTimerId=null}return;
  }
  const start=new Date(completedAt()),deadline=new Date(start.getTime()+14*24*60*60*1000);
  $("#paymentAmount").textContent=$("#grandTotal").textContent||rupiah(order?.grand_total||0);
  $("#paymentOrderCode").textContent=order?.order_code||"LG-—";
  $("#paymentDeadlineText").textContent=`s.d. ${formatDeadline(deadline)}`;

  const tick=()=>{
    const diff=deadline.getTime()-Date.now(),overdue=diff<=0,safe=Math.max(0,diff);
    const days=Math.floor(safe/(24*60*60*1000)),hours=Math.floor((safe%(24*60*60*1000))/(60*60*1000));
    $("#paymentCountdown").textContent=overdue?"Tempo berakhir":`${days}d ${String(hours).padStart(2,"0")}h`;
    $("#paymentDuePill").textContent=overdue?"Jatuh tempo":`${days}d ${String(hours).padStart(2,"0")}h`;
    section.classList.toggle("payment-overdue",overdue);
  };
  tick();if(paymentTimerId)clearInterval(paymentTimerId);paymentTimerId=setInterval(tick,60*1000);
}
function renderHeader(){
  $("#orderCodeTop").textContent=order.order_code;$("#orderCodeHero").textContent=order.order_code;
  $("#createdAtTop").textContent=`Diajukan ${dateLabel(order.created_at,true)}`;
}
function renderAll(){
  renderHeader();renderStatus();renderFlight();renderTimeline();renderPassengers();renderAddons();renderSpt();renderPricing();renderPaymentCountdown();
  $("#loadingState").classList.add("hidden");$("#errorState").classList.add("hidden");$("#content").classList.remove("hidden");$("#actionBar").classList.remove("hidden");
}
async function openSpt(){
  const doc=sptDocument(),path=doc?.file_path||order?.spt_path;
  if(!path)return toast("SPT belum tersedia.");
  const {data,error}=await supabase.storage.from("spt-documents").createSignedUrl(path,60);
  if(error)return toast(error.message||"SPT belum dapat dibuka.");
  if(data?.signedUrl)window.open(data.signedUrl,"_blank","noopener,noreferrer");
}
async function init(){
  try{
    session=await requireAuth({redirect:"login.html",splash:"index.html"});
    if(!session)return;
    await loadData();renderAll();
  }catch(error){
    console.error("[LetsGo Detail Pesanan]",error);
    $("#loadingState").classList.add("hidden");$("#errorState").classList.remove("hidden");
    $("#errorMessage").textContent=error?.message||"Pesanan belum dapat dimuat.";
  }
}
async function copyCode(){try{await navigator.clipboard.writeText(order?.order_code||"");toast("Nomor pengajuan disalin.")}catch{toast("Tidak dapat menyalin nomor pengajuan.")}}
function closeSheet(){$("#menuSheet").classList.add("hidden");document.body.style.overflow=""}
$("#backBtn")?.addEventListener("click",()=>history.back());
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#copyOrderBtn")?.addEventListener("click",copyCode);
$("#copySheetBtn")?.addEventListener("click",()=>{copyCode();closeSheet()});
$("#closeSheetBtn")?.addEventListener("click",closeSheet);
$("#menuSheet")?.addEventListener("click",e=>{if(e.target===$("#menuSheet"))closeSheet()});
$("#retryBtn")?.addEventListener("click",()=>location.reload());
$("#helpBtn")?.addEventListener("click",()=>location.href="help.html");
$("#helpSheetBtn")?.addEventListener("click",()=>location.href="help.html");
$("#payNowBtn")?.addEventListener("click",()=>location.href=paymentPageUrl());
$("#invoiceBtn")?.addEventListener("click",()=>location.href=invoicePageUrl());
$("#openSptBtn")?.addEventListener("click",openSpt);
$("#primaryActionBtn")?.addEventListener("click",()=>{
  const status=String(order?.status||"").toUpperCase();
  if(status==="ISSUED")return location.href=ticketPageUrl();
  if(status==="COMPLETED")return location.href=paymentPageUrl();
  if(status==="CANCELLED")return location.href="help.html";
  location.href="orders.html";
});
init();
