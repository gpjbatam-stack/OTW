import { supabase } from "./supabase.js";

const $ = s => document.querySelector(s);

const LOGOS = {
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};

const NAME_CODES = {
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};

const AIRPORTS = {
  BTH:"Hang Nadim",CGK:"Soekarno-Hatta",DPS:"I Gusti Ngurah Rai",SUB:"Juanda",
  KNO:"Kualanamu",PKU:"Sultan Syarif Kasim II",PLM:"Sultan Mahmud Badaruddin II",
  BPN:"Sultan Aji Muhammad Sulaiman",UPG:"Sultan Hasanuddin",SOC:"Adi Soemarmo",
  YIA:"Yogyakarta International"
};

const STATUS = {
  SUBMITTED:{
    badge:"Diajukan",klass:"status-submitted",kicker:"PENGAJUAN DITERIMA",
    title:"Perjalanan sedang diproses.",
    text:"OTW sedang memeriksa detail perjalanan, dokumen, harga, dan ketersediaan.",
    footer:"Diajukan",action:"Kembali ke Pesanan"
  },
  PROCESSING:{
    badge:"Diproses",klass:"status-processing",kicker:"SEDANG DIPROSES",
    title:"OTW sedang menyiapkan perjalanan.",
    text:"Harga dan ketersediaan sedang diverifikasi untuk proses fulfillment.",
    footer:"Sedang diproses",action:"Lihat Pesanan"
  },
  VERIFIED:{
    badge:"Terverifikasi",klass:"status-processing",kicker:"VERIFIKASI SELESAI",
    title:"Pengajuan sudah terverifikasi.",
    text:"Detail perjalanan telah diperiksa dan siap masuk tahap penerbitan.",
    footer:"Terverifikasi",action:"Lihat Pesanan"
  },
  ISSUED:{
    badge:"Tiket terbit",klass:"status-issued",kicker:"TIKET SIAP",
    title:"Perjalanan Anda siap.",
    text:"Tiket telah diterbitkan. Dokumen perjalanan dapat dibuka dari halaman ini.",
    footer:"Tiket terbit",action:"Buka Tiket"
  },
  COMPLETED:{
    badge:"Selesai",klass:"status-issued",kicker:"PERJALANAN SELESAI",
    title:"Perjalanan telah selesai.",
    text:"Pesanan ini telah menyelesaikan seluruh proses OTW.",
    footer:"Selesai",action:"Kembali ke Pesanan"
  },
  CANCELLED:{
    badge:"Dibatalkan",klass:"status-cancelled",kicker:"PESANAN DIBATALKAN",
    title:"Pengajuan tidak dilanjutkan.",
    text:"Lihat catatan OTW atau hubungi Pusat Bantuan untuk informasi lebih lanjut.",
    footer:"Dibatalkan",action:"Pusat Bantuan"
  }
};

let user=null;
let order=null;

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

function hm(v){
  const m=String(v||"").match(/T(\d{2}):(\d{2})/);
  return m?`${m[1]}:${m[2]}`:"--:--";
}

function dateLabel(v,long=false){
  if(!v)return"—";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return"—";
  return new Intl.DateTimeFormat("id-ID",long
    ? {day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}
    : {weekday:"short",day:"numeric",month:"short",year:"numeric"}
  ).format(d);
}

function duration(m){
  m=Number(m||0);
  return m?`${Math.floor(m/60)}j ${m%60}m`:"—";
}

function maskId(v){
  const s=String(v||"");
  if(!s)return"—";
  return s.length>4?`${"•".repeat(Math.min(8,s.length-4))}${s.slice(-4)}`:s;
}

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function orderCodeFromUrl(){
  return new URLSearchParams(location.search).get("id")||"";
}

function resolveAirlineCode(flight){
  const seg=flight?.segments?.[0]||{};
  const direct=String(seg.carrier||flight?.airlineCode||order?.airline_code||"").toUpperCase();
  if(LOGOS[direct])return direct;
  const name=String(seg.carrierName||flight?.airlineName||order?.airline_name||"").toLowerCase();
  return NAME_CODES[name]||direct||"FL";
}

async function ensureAuth(){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  user=data?.session?.user||null;
  if(!user){
    location.replace("login.html");
    return false;
  }
  return true;
}

async function loadOrder(){
  const code=orderCodeFromUrl();

  if(!code)throw new Error("Nomor pesanan tidak ditemukan pada URL.");

  const {data,error}=await supabase
    .from("flight_orders")
    .select("*")
    .eq("order_code",code)
    .single();

  if(error)throw error;
  order=data;
}

function renderStatus(){
  const state=STATUS[String(order.status||"SUBMITTED").toUpperCase()]||STATUS.SUBMITTED;

  $("#statusBadge").className=`status-badge ${state.klass}`;
  $("#statusBadge").innerHTML=`<i></i>${state.badge}`;
  $("#statusKicker").textContent=state.kicker;
  $("#statusTitle").textContent=state.title;
  $("#statusText").textContent=state.text;
  $("#footerStatus").textContent=state.footer;
  $("#primaryActionBtn").textContent=state.action;

  $("#ticketSection").classList.toggle("hidden",String(order.status).toUpperCase()!=="ISSUED");

  if(order.admin_notes){
    $("#adminNoteSection").classList.remove("hidden");
    $("#adminNote").textContent=order.admin_notes;
  }
}

function renderFlight(){
  const payload=order.payload||{};
  const flight=payload.flight||{};
  const segs=flight.segments||[];
  const first=segs[0]||{};
  const last=segs[segs.length-1]||first;
  const name=first.carrierName||flight.airlineName||order.airline_name||"Maskapai";
  const code=resolveAirlineCode(flight);

  $("#airlineLogo").innerHTML=LOGOS[code]
    ? `<img src="./${LOGOS[code]}?v=20260819" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`
    : `<span>${esc(code)}</span>`;

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
  $("#cabin").textContent=first.cabinClass||flight.cabin||"Ekonomi";
  $("#baggage").textContent=`Bagasi ${first.baggageAllowance||flight.baggage||"sesuai fare"}`;

  const stops=Number(flight.stops??Math.max(0,segs.length-1));
  $("#stops").textContent=stops?`${stops} transit`:"Langsung";

  const search=flight.searchSnapshot||{};
  $("#tripTypePill").textContent=search.trip==="roundtrip"?"Pulang-pergi":"Sekali jalan";
}

function renderTimeline(){
  const status=String(order.status||"SUBMITTED").toUpperCase();
  const rank={
    SUBMITTED:1,PROCESSING:2,VERIFIED:3,ISSUED:4,COMPLETED:5,CANCELLED:2
  }[status]||1;

  const steps=[
    {key:"SUBMITTED",title:"Pengajuan diterima",text:"Data perjalanan berhasil masuk ke OTW.",time:dateLabel(order.created_at,true)},
    {key:"PROCESSING",title:"Verifikasi OTW",text:"Harga, ketersediaan, add-on, dan dokumen diperiksa.",time:""},
    {key:"VERIFIED",title:"Pengajuan terverifikasi",text:"Pesanan siap diproses ke supplier.",time:""},
    {key:"ISSUED",title:"Tiket diterbitkan",text:"E-ticket tersedia untuk perjalanan Anda.",time:""},
    {key:"COMPLETED",title:"Perjalanan selesai",text:"Seluruh proses perjalanan telah selesai.",time:""}
  ];

  const card=$("#timelineCard");
  card.innerHTML="";

  steps.forEach((s,index)=>{
    const stepRank=index+1;
    const klass=stepRank<rank?"done":stepRank===rank?"current":"";
    const row=document.createElement("div");
    row.className=`timeline-step ${klass}`;
    row.innerHTML=`
      <div class="timeline-node">
        <span class="timeline-dot">${stepRank<rank?"✓":stepRank}</span>
        ${index<steps.length-1?'<i class="timeline-line"></i>':""}
      </div>
      <div class="timeline-copy">
        <strong>${esc(s.title)}</strong>
        <small>${esc(s.text)}</small>
      </div>
      <span class="timeline-time">${esc(s.time)}</span>
    `;
    card.appendChild(row);
  });
}

function renderPassengers(){
  const p=order.payload?.passengerDetails?.passengers||[];
  $("#passengerCount").textContent=`${p.length||order.passenger_count||1} orang`;
  const list=$("#passengerList");
  list.innerHTML="";

  if(!p.length){
    list.innerHTML=`
      <div class="passenger-row">
        <div class="passenger-main">
          <span class="passenger-avatar">1</span>
          <div class="passenger-copy"><strong>Data penumpang tersimpan</strong><small>${order.passenger_count||1} penumpang</small></div>
        </div>
      </div>
    `;
    return;
  }

  p.forEach((x,i)=>{
    const row=document.createElement("div");
    row.className="passenger-row";
    row.innerHTML=`
      <div class="passenger-main">
        <span class="passenger-avatar">${i+1}</span>
        <div class="passenger-copy">
          <strong>${esc([x.title,x.fullName].filter(Boolean).join(" ")||`Penumpang ${i+1}`)}</strong>
          <small>${esc(x.label||x.type||"Penumpang")}</small>
        </div>
      </div>
      <div class="passenger-id">
        <strong>${esc(x.identityType||"IDENTITAS")}</strong>
        <small>${esc(maskId(x.identityNumber))}</small>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderAddons(){
  const addons=order.payload?.addons||{};
  const baggage=Array.isArray(addons.baggage)?addons.baggage:[];
  const insurance=addons.insurance||null;
  const list=$("#addonList");
  list.innerHTML="";

  $("#addonState").textContent=
    baggage.length||insurance
      ? `${baggage.length} bagasi${insurance?" + asuransi":""}`
      : "Tidak ada";

  if(!baggage.length&&!insurance){
    $("#addonEmpty").classList.remove("hidden");
    return;
  }

  $("#addonEmpty").classList.add("hidden");

  baggage.forEach(item=>{
    const p=order.payload?.passengerDetails?.passengers?.[item.passengerIndex];
    const row=document.createElement("div");
    row.className="addon-row";
    row.innerHTML=`
      <div class="addon-main">
        <span class="addon-icon">
          <svg viewBox="0 0 24 24"><path d="M8 7V5a4 4 0 0 1 8 0v2"/><rect x="4" y="7" width="16" height="13" rx="3"/></svg>
        </span>
        <div class="addon-copy">
          <strong>${esc(item.addonName||item.name||`Bagasi +${item.weightKg||0} kg`)}</strong>
          <small>${esc(p?.fullName||`Penumpang ${Number(item.passengerIndex)+1}`)}</small>
        </div>
      </div>
      <strong class="addon-price">${rupiah(item.sellingPrice??item.price)}</strong>
    `;
    list.appendChild(row);
  });

  if(insurance){
    const row=document.createElement("div");
    row.className="addon-row";
    row.innerHTML=`
      <div class="addon-main">
        <span class="addon-icon">
          <svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg>
        </span>
        <div class="addon-copy">
          <strong>${esc(insurance.addonName||insurance.name||"Asuransi perjalanan")}</strong>
          <small>Perlindungan perjalanan</small>
        </div>
      </div>
      <strong class="addon-price">${rupiah(insurance.sellingPrice??insurance.price)}</strong>
    `;
    list.appendChild(row);
  }
}

function renderSpt(){
  const spt=order.payload?.passengerDetails?.spt||{};
  $("#sptName").textContent=spt.fileName||spt.file_name||"Surat Perintah Tugas";
  const size=Number(spt.fileSize||spt.file_size||0);
  $("#sptMeta").textContent=size
    ? `${(size/1024/1024).toFixed(2)} MB · tersimpan aman`
    : order.spt_path
      ? "Tersimpan di OTW"
      : "Dokumen perjalanan tersimpan";
  $("#sptState").textContent=spt.fileName||order.spt_path?"Tersimpan":"Tercatat";
}

function renderPricing(){
  const p=order.payload?.pricing||{};
  const flightTotal=Number(order.flight_total ?? p.flightTotal ?? 0);
  const baggageTotal=Number(p.baggageTotal||0);
  const insuranceTotal=Number(p.insuranceTotal||0);
  const grand=Number(order.grand_total || p.grandTotal || flightTotal+baggageTotal+insuranceTotal);

  $("#flightTotal").textContent=rupiah(flightTotal);
  $("#baggageTotal").textContent=rupiah(baggageTotal);
  $("#insuranceTotal").textContent=rupiah(insuranceTotal);
  $("#grandTotal").textContent=rupiah(grand);
  $("#priceEquation").textContent=`${rupiah(flightTotal)} + ${rupiah(baggageTotal+insuranceTotal)}`;
}

function renderHeader(){
  $("#orderCodeTop").textContent=order.order_code;
  $("#orderCodeHero").textContent=order.order_code;
  $("#createdAtTop").textContent=`Diajukan ${dateLabel(order.created_at,true)}`;
}

function renderAll(){
  renderHeader();
  renderStatus();
  renderFlight();
  renderTimeline();
  renderPassengers();
  renderAddons();
  renderSpt();
  renderPricing();

  $("#loadingState").classList.add("hidden");
  $("#errorState").classList.add("hidden");
  $("#content").classList.remove("hidden");
  $("#actionBar").classList.remove("hidden");
}

async function init(){
  try{
    if(!await ensureAuth())return;
    await loadOrder();
    renderAll();
  }catch(error){
    console.error("[OTW Detail Pesanan]",error);
    $("#loadingState").classList.add("hidden");
    $("#errorState").classList.remove("hidden");
    $("#errorMessage").textContent=error?.message||"Pesanan belum dapat dimuat.";
  }
}

async function copyCode(){
  try{
    await navigator.clipboard.writeText(order?.order_code||"");
    toast("Nomor pengajuan disalin.");
  }catch{
    toast("Tidak dapat menyalin nomor pengajuan.");
  }
}

function openSheet(){
  $("#menuSheet").classList.remove("hidden");
  document.body.style.overflow="hidden";
}
function closeSheet(){
  $("#menuSheet").classList.add("hidden");
  document.body.style.overflow="";
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#copyOrderBtn")?.addEventListener("click",copyCode);
$("#copySheetBtn")?.addEventListener("click",()=>{copyCode();closeSheet()});
$("#closeSheetBtn")?.addEventListener("click",closeSheet);
$("#menuSheet")?.addEventListener("click",e=>{if(e.target===$("#menuSheet"))closeSheet()});
$("#retryBtn")?.addEventListener("click",()=>location.reload());
$("#helpBtn")?.addEventListener("click",()=>location.href="help.html");
$("#helpSheetBtn")?.addEventListener("click",()=>location.href="help.html");
$("#primaryActionBtn")?.addEventListener("click",()=>{
  const status=String(order?.status||"").toUpperCase();

  if(status==="ISSUED"){
    const ticketUrl=order?.ticket_url||order?.payload?.ticketUrl||order?.payload?.ticket_url||null;
    if(ticketUrl){
      location.href=ticketUrl;
      return;
    }
    $("#ticketSection")?.scrollIntoView({behavior:"smooth",block:"center"});
    toast("E-ticket tersedia di bagian tiket.");
    return;
  }

  if(status==="CANCELLED"){
    location.href="help.html";
    return;
  }

  // Default action for SUBMITTED / PROCESSING / VERIFIED / COMPLETED:
  // return to the user's order list instead of doing nothing.
  location.href="orders.html";
});

$("#openTicketBtn")?.addEventListener("click",()=>{
  const ticketUrl=order?.payload?.ticketUrl||order?.payload?.ticket_url||null;
  if(ticketUrl){
    location.href=ticketUrl;
  }else{
    toast("E-ticket belum memiliki file yang dapat dibuka.");
  }
});

init();
