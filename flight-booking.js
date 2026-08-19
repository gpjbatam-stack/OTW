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

let user = null;
let review = null;
let orderCode = null;
let submitting = false;

function read(key){
  try{
    return JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||"null");
  }catch{
    return null;
  }
}

function rupiah(v){
  return new Intl.NumberFormat("id-ID",{
    style:"currency",currency:"IDR",maximumFractionDigits:0
  }).format(Number(v)||0);
}

function hm(v){
  const m=String(v||"").match(/T(\d{2}):(\d{2})/);
  return m?`${m[1]}:${m[2]}`:"--:--";
}

function dateLabel(v){
  if(!v)return"—";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return"—";
  return new Intl.DateTimeFormat("id-ID",{
    weekday:"short",day:"numeric",month:"short",year:"numeric"
  }).format(d);
}

function duration(m){
  m=Number(m||0);
  return m?`${Math.floor(m/60)}j ${m%60}m`:"—";
}

function esc(v=""){
  return String(v).replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function airlineCode(flight){
  const seg=flight?.segments?.[0]||{};
  const direct=String(seg.carrier||flight?.airlineCode||"").toUpperCase();
  if(LOGOS[direct])return direct;
  return NAME_CODES[String(seg.carrierName||flight?.airlineName||"").toLowerCase()]||direct||"FL";
}

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function generateOrderCode(){
  const d=new Date();
  const date=[
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("");
  const rand=String(Math.floor(1000+Math.random()*9000));
  return `OTW-${date}-${rand}`;
}

function render(){
  const flight=review.flight||{};
  const pax=review.passengerDetails?.passengers||[];
  const spt=review.passengerDetails?.spt||{};
  const addons=review.addons||{};
  const pricing=review.pricing||{};
  const segs=flight.segments||[];
  const first=segs[0]||{};
  const last=segs[segs.length-1]||first;

  const name=first.carrierName||flight.airlineName||"Maskapai";
  const code=airlineCode(flight);

  $("#airlineLogo").innerHTML=LOGOS[code]
    ? `<img src="./${LOGOS[code]}?v=20260819" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`
    : `<span>${esc(code)}</span>`;

  $("#airlineName").textContent=name;
  $("#flightNumber").textContent=first.flightNumber||flight.flightNumber||"—";
  $("#departTime").textContent=hm(first.departureLocalTime||first.departureTime||flight.departureTime);
  $("#arriveTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime||flight.arrivalTime);
  $("#origin").textContent=first.origin||flight.origin||"---";
  $("#destination").textContent=last.destination||flight.destination||"---";
  $("#duration").textContent=duration(flight.totalDuration||flight.durationMinutes||first.duration);
  $("#flightDate").textContent=dateLabel(first.departureLocalTime||first.departureTime||flight.departureTime);
  $("#cabin").textContent=first.cabinClass||flight.cabin||"Ekonomi";
  $("#baggage").textContent=`Bagasi ${first.baggageAllowance||flight.baggage||"sesuai fare"}`;

  $("#passengerCount").textContent=`${pax.length||1} orang`;
  $("#sptStatus").textContent=spt?.fileName||spt?.file_name ? "SPT siap" : "SPT tersimpan";

  const baggageCount=Array.isArray(addons.baggage)?addons.baggage.length:0;
  $("#addonStatus").textContent=
    baggageCount || addons.insurance
      ? `${baggageCount} bagasi${addons.insurance?" + asuransi":""}`
      : "Tidak ada";

  const flightTotal=Number(pricing.flightTotal ?? review.flight?.otwPricing?.totalPrice ?? review.flight?.displayPrice ?? 0);
  const baggageTotal=Number(pricing.baggageTotal||0);
  const insuranceTotal=Number(pricing.insuranceTotal||0);
  const grandTotal=Number(pricing.grandTotal || flightTotal+baggageTotal+insuranceTotal);

  $("#flightTotal").textContent=rupiah(flightTotal);
  $("#baggageTotal").textContent=rupiah(baggageTotal);
  $("#insuranceTotal").textContent=rupiah(insuranceTotal);
  $("#grandTotal").textContent=rupiah(grandTotal);
  $("#priceEquation").textContent=`${rupiah(flightTotal)} + ${rupiah(baggageTotal+insuranceTotal)}`;

  $("#loadingCard").classList.add("hidden");
  $("#content").classList.remove("hidden");
}

async function ensureSession(){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  user=data?.session?.user||null;

  if(!user){
    location.replace("login.html");
    return false;
  }
  return true;
}

function buildOrderRow(){
  const flight=review.flight||{};
  const segs=flight.segments||[];
  const first=segs[0]||{};
  const last=segs[segs.length-1]||first;
  const pricing=review.pricing||{};
  const addons=review.addons||{};
  const spt=review.passengerDetails?.spt||{};

  return {
    user_id:user.id,
    order_code:orderCode,
    status:"SUBMITTED",
    origin:first.origin||flight.origin||null,
    destination:last.destination||flight.destination||null,
    airline_code:first.carrier||flight.airlineCode||null,
    airline_name:first.carrierName||flight.airlineName||null,
    flight_number:first.flightNumber||flight.flightNumber||null,
    depart_at:first.departureLocalTime||first.departureTime||flight.departureTime||null,
    arrival_at:last.arrivalLocalTime||last.arrivalTime||flight.arrivalTime||null,
    passenger_count:(review.passengerDetails?.passengers||[]).length||1,
    flight_total:Number(pricing.flightTotal ?? flight?.otwPricing?.totalPrice ?? flight?.displayPrice ?? 0),
    service_fee:Number(pricing.serviceFee||0),
    addons_total:Number(pricing.addonsTotal||addons.total||0),
    grand_total:Number(pricing.grandTotal||0),
    currency:pricing.currency||"IDR",
    spt_path:spt.path||spt.storagePath||spt.filePath||null,
    payload:review
  };
}

async function submitBooking(){
  if(submitting)return;

  if(!$("#agreeCheck").checked){
    $("#agreementError").textContent="Centang persetujuan sebelum mengirim pengajuan.";
    toast("Konfirmasi pengajuan terlebih dahulu.");
    return;
  }

  $("#agreementError").textContent="";
  submitting=true;

  const btn=$("#submitBookingBtn");
  const old=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML=`<span><small>MOHON TUNGGU</small><strong>Mengirim pengajuan...</strong></span>`;

  try{
    orderCode=generateOrderCode();
    const row=buildOrderRow();

    const {data,error}=await supabase
      .from("flight_orders")
      .insert(row)
      .select("id,order_code,status")
      .single();

    if(error)throw error;

    orderCode=data.order_code;

    sessionStorage.setItem("otw_last_order",JSON.stringify({
      id:data.id,
      orderCode:data.order_code,
      status:data.status,
      createdAt:new Date().toISOString()
    }));

    $("#successOrderCode").textContent=orderCode;
    $("#successModal").classList.remove("hidden");
    document.body.style.overflow="hidden";

  }catch(error){
    console.error("[OTW Booking]",error);
    $("#submitErrorText").textContent=
      error?.message||"Pengajuan belum berhasil disimpan.";
    $("#errorModal").classList.remove("hidden");
    document.body.style.overflow="hidden";
  }finally{
    submitting=false;
    btn.disabled=false;
    btn.innerHTML=old;
  }
}

async function init(){
  try{
    if(!await ensureSession())return;

    review=read("otw_flight_review");

    if(!review){
      $("#loadingCard").innerHTML=`
        <div>
          <strong>Data review tidak ditemukan.</strong>
          <small>Kembali ke Flight Review dan konfirmasi perjalanan terlebih dahulu.</small>
        </div>
      `;
      return;
    }

    render();
  }catch(error){
    console.error("[OTW Booking Init]",error);
    $("#loadingCard").innerHTML=`
      <div>
        <strong>Halaman belum dapat dimuat.</strong>
        <small>${esc(error?.message||"Silakan coba lagi.")}</small>
      </div>
    `;
  }
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#editFlightBtn")?.addEventListener("click",()=>location.href="flight-detail.html");
$("#agreeCheck")?.addEventListener("change",()=>{
  if($("#agreeCheck").checked)$("#agreementError").textContent="";
});
$("#submitBookingBtn")?.addEventListener("click",submitBooking);
$("#retrySubmitBtn")?.addEventListener("click",()=>{
  $("#errorModal").classList.add("hidden");
  document.body.style.overflow="";
  submitBooking();
});
$("#closeErrorBtn")?.addEventListener("click",()=>{
  $("#errorModal").classList.add("hidden");
  document.body.style.overflow="";
});
$("#copyCodeBtn")?.addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText(orderCode||"");
    toast("Nomor pengajuan disalin.");
  }catch{
    toast("Tidak dapat menyalin nomor pengajuan.");
  }
});
$("#viewOrderBtn")?.addEventListener("click",()=>{
  location.href=`detail-pesanan.html?id=${encodeURIComponent(orderCode||"")}`;
});
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");

init();
