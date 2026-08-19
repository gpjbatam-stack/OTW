(() => {
"use strict";

const $=(s,r=document)=>r.querySelector(s);

const LOGOS={
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};

const NAME_CODES={
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};

let flight=read("otw_selected_flight");
let passengerData=read("otw_passenger_details");
let search=read("otw_search")||flight?.searchSnapshot||{};
let flightPricing=read("otw_flight_pricing")||passengerData?.pricing||flight?.otwPricing||null;
let addons=read("otw_flight_addons")||{
  baggage:[],insurance:null,total:0,currency:"IDR"
};

let pricing={
  ticketFare:0,
  serviceFee:0,
  baggage:0,
  insurance:0,
  addonsTotal:0,
  grandTotal:0
};

function read(k){
  try{
    return JSON.parse(sessionStorage.getItem(k)||localStorage.getItem(k)||"null");
  }catch{
    return null;
  }
}

function rupiah(v){
  return new Intl.NumberFormat("id-ID",{
    style:"currency",currency:"IDR",maximumFractionDigits:0
  }).format(Number(v||0));
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

function dateLabel(v){
  const d=new Date(v);
  return Number.isNaN(d.getTime())
    ?"—"
    :new Intl.DateTimeFormat("id-ID",{
      weekday:"long",day:"numeric",month:"long",year:"numeric"
    }).format(d);
}

function duration(min){
  min=Number(min||0);
  return min?`${Math.floor(min/60)}j ${min%60}m`:"—";
}

function toast(m){
  const e=$("#toast");
  e.textContent=m;
  e.classList.add("show");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>e.classList.remove("show"),2200);
}

function codeFor(c,n){
  c=String(c||"").toUpperCase();
  return LOGOS[c]?c:(NAME_CODES[String(n||"").toLowerCase()]||c||"FL");
}

function renderFlight(){
  if(!flight){
    toast("Data penerbangan tidak ditemukan.");
    return;
  }

  const segs=flight.segments||[];
  const a=segs[0]||{};
  const z=segs[segs.length-1]||a;

  const name=a.carrierName||flight.airlineName||"Maskapai";
  const code=codeFor(a.carrier||flight.airlineCode,name);
  const logo=LOGOS[code];

  $("#airlineLogo").innerHTML=logo
    ?`<img src="./${logo}?v=20260819" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`
    :`<span>${esc(code)}</span>`;

  $("#airlineName").textContent=name;
  $("#flightNumber").textContent=a.flightNumber||flight.flightNumber||"—";

  $("#origin").textContent=a.origin||flight.origin||search.origin||"---";
  $("#destination").textContent=z.destination||flight.destination||search.destination||"---";

  $("#departTime").textContent=hm(a.departureLocalTime||a.departureTime||flight.departureTime);
  $("#arriveTime").textContent=hm(z.arrivalLocalTime||z.arrivalTime||flight.arrivalTime);

  $("#flightDate").textContent=dateLabel(
    a.departureLocalTime||a.departureTime||flight.departureTime||search.departDate
  );

  $("#duration").textContent=duration(flight.totalDuration||a.duration);

  const stops=Number(flight.stops??Math.max(0,segs.length-1));
  $("#stopBadge").textContent=stops?`${stops} transit`:"Langsung";
  $("#routeType").textContent=stops?`${stops} kali transit`:"Penerbangan langsung";

  $("#baggage").textContent=`Bagasi ${a.baggageAllowance||flight.baggage||"sesuai fare"}`;
  $("#cabin").textContent=a.cabinClass||flight.cabin||search.cabinClass||"Ekonomi";

  $("#modalRoute").textContent=`${$("#origin").textContent} → ${$("#destination").textContent}`;
}

function renderPassengers(){
  const list=$("#passengerList");
  const pax=passengerData?.passengers||[];
  list.innerHTML="";

  if(!pax.length){
    list.innerHTML='<div class="pax-card"><div class="pax-main"><strong>Data penumpang belum tersedia</strong></div></div>';
    return;
  }

  pax.forEach((p,i)=>{
    const el=document.createElement("article");
    el.className="pax-card";

    const id=String(p.identityNumber||"");
    const masked=id.length>4
      ?`${"•".repeat(Math.min(8,id.length-4))}${id.slice(-4)}`
      :id||"—";

    el.innerHTML=`
      <span class="pax-num">${i+1}</span>
      <div class="pax-main">
        <strong>${esc([p.title,p.fullName].filter(Boolean).join(" "))}</strong>
        <small>${esc(p.label||p.type||"Penumpang")} · ${esc(p.gender==="M"?"Laki-laki":p.gender==="F"?"Perempuan":p.gender||"—")}</small>
      </div>
      <div class="pax-id">
        <strong>${esc(p.identityType||"Identitas")}</strong>
        <small>${esc(masked)}</small>
      </div>
    `;

    list.appendChild(el);
  });

  $("#paxPriceNote").textContent=`${pax.length} penumpang · harga penerbangan OTW`;
}

function renderSpt(){
  const s=passengerData?.spt||read("otw_uploaded_spt");

  if(!s){
    $("#sptName").textContent="SPT belum ditemukan";
    $("#sptMeta").textContent="Kembali dan upload dokumen";
    $(".verified").textContent="Belum ada";
    return;
  }

  $("#sptName").textContent=s.fileName||s.file_name||"Surat Perintah Tugas";

  const size=Number(s.fileSize||s.file_size||0);
  $("#sptMeta").textContent=size
    ?`${(size/1024/1024).toFixed(2)} MB · tersimpan aman`
    :"Dokumen tersimpan aman";
}

function renderAddons(){
  const list=$("#addonsList");
  const empty=$("#addonsEmpty");
  list.innerHTML="";

  const baggage=Array.isArray(addons?.baggage)?addons.baggage:[];
  const insurance=addons?.insurance||null;

  if(!baggage.length && !insurance){
    empty.classList.remove("hidden");
  }else{
    empty.classList.add("hidden");
  }

  baggage.forEach((item,index)=>{
    const passenger=passengerData?.passengers?.[item.passengerIndex];
    const row=document.createElement("div");
    row.className="addon-review-row";
    row.innerHTML=`
      <div class="addon-review-main">
        <span class="addon-review-icon">
          <svg viewBox="0 0 24 24">
            <path d="M8 7V5a4 4 0 0 1 8 0v2"/>
            <rect x="4" y="7" width="16" height="13" rx="3"/>
          </svg>
        </span>
        <div class="addon-review-copy">
          <strong>${esc(item.addonName||`Bagasi +${item.weightKg||0} kg`)}</strong>
          <small>${esc(passenger?.fullName||`Penumpang ${item.passengerIndex+1}`)}</small>
        </div>
      </div>
      <b>${rupiah(item.sellingPrice)}</b>
    `;
    list.appendChild(row);
  });

  if(insurance){
    const row=document.createElement("div");
    row.className="addon-review-row";
    row.innerHTML=`
      <div class="addon-review-main">
        <span class="addon-review-icon">
          <svg viewBox="0 0 24 24">
            <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </span>
        <div class="addon-review-copy">
          <strong>${esc(insurance.addonName||"Asuransi perjalanan")}</strong>
          <small>Perlindungan perjalanan</small>
        </div>
      </div>
      <b>${rupiah(insurance.sellingPrice)}</b>
    `;
    list.appendChild(row);
  }

  pricing.baggage=baggage.reduce((s,x)=>s+Number(x.sellingPrice||0),0);
  pricing.insurance=Number(insurance?.sellingPrice||0);
  pricing.addonsTotal=pricing.baggage+pricing.insurance;

  $("#addonsTotal").textContent=rupiah(pricing.addonsTotal);
  $("#reviewBaggageTotal").textContent=rupiah(pricing.baggage);
  $("#reviewInsuranceTotal").textContent=rupiah(pricing.insurance);
}

function renderPricing(){
  if(!flightPricing){
    toast("Pricing OTW tidak ditemukan. Kembali ke detail penerbangan.");
    $("#confirmBtn").disabled=true;
    return;
  }

  pricing.ticketFare=Number(
    flightPricing.ticketPrice ??
    flight?.otwTicketPrice ??
    0
  );

  pricing.serviceFee=Number(
    flightPricing.serviceFee ??
    flight?.otwServiceFee ??
    0
  );

  pricing.grandTotal=
    pricing.ticketFare+
    pricing.serviceFee+
    pricing.addonsTotal;

  $("#ticketPrice").textContent=rupiah(pricing.ticketFare);
  $("#ticketFare").textContent=rupiah(pricing.ticketFare);
  $("#serviceFee").textContent=rupiah(pricing.serviceFee);
  $("#grandTotal").textContent=rupiah(pricing.grandTotal);
  $("#stickyTotal").textContent=rupiah(pricing.grandTotal);
  $("#modalTotal").textContent=rupiah(pricing.grandTotal);
}

function openModal(){
  if(!$("#agreementCheck").checked){
    $("#agreementError").textContent="Centang konfirmasi sebelum melanjutkan.";
    toast("Konfirmasi data terlebih dahulu.");
    return;
  }

  if(!flightPricing){
    toast("Harga OTW belum tersedia.");
    return;
  }

  $("#agreementError").textContent="";
  $("#confirmModal").classList.remove("hidden");
  document.body.style.overflow="hidden";
}

function closeModal(){
  $("#confirmModal").classList.add("hidden");
  document.body.style.overflow="";
}

function finalConfirm(){
  const payload={
    flightOfferId:sessionStorage.getItem("otw_selected_offer_id")||flight?.offerId||"",
    flight,
    passengerDetails:passengerData,
    addons,
    pricing:{
      ticketFare:pricing.ticketFare,
      serviceFee:pricing.serviceFee,
      baggageTotal:pricing.baggage,
      insuranceTotal:pricing.insurance,
      addonsTotal:pricing.addonsTotal,
      grandTotal:pricing.grandTotal,
      currency:flightPricing?.currency||"IDR",
      source:flightPricing?.source||"OTW_ADMIN_PRICING",
      pricingUpdatedAt:flightPricing?.pricingUpdatedAt||null
    },
    status:"REVIEW_CONFIRMED",
    confirmedAt:new Date().toISOString()
  };

  sessionStorage.setItem("otw_flight_review",JSON.stringify(payload));

  closeModal();
  toast("Review perjalanan berhasil dikonfirmasi.");

  setTimeout(()=>{
    location.href="flight-booking.html";
  },450);
}

function bind(){
  $("#backBtn").onclick=()=>history.back();
  $("#editFlightBtn").onclick=()=>location.href="search-flight.html";
  $("#editPassengersBtn").onclick=()=>location.href="passenger-details.html";
  $("#editSptBtn").onclick=()=>location.href="passenger-details.html";
  $("#editAddonsBtn").onclick=()=>location.href="flight-addons.html";

  $("#confirmBtn").onclick=openModal;
  $("#closeModalBtn").onclick=closeModal;
  $("#cancelModalBtn").onclick=closeModal;
  $("#finalConfirmBtn").onclick=finalConfirm;

  $("#confirmModal").addEventListener("click",e=>{
    if(e.target===$("#confirmModal")) closeModal();
  });

  $("#agreementCheck").addEventListener("change",()=>{
    if($("#agreementCheck").checked){
      $("#agreementError").textContent="";
    }
  });
}

function init(){
  renderFlight();
  renderPassengers();
  renderSpt();
  renderAddons();
  renderPricing();
  bind();

  console.info("[OTW] Flight Review Premium V2 Add-ons + Admin Pricing ready");
}

document.addEventListener("DOMContentLoaded",init);
})();