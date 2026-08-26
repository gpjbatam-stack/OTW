import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);
let user=null,order=null,receivable=null;

const rupiah=v=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0);
const dateOnly=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)};
const dateTime=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)};
const hm=v=>{const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"—"};
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
const orderCode=()=>new URLSearchParams(location.search).get("id")||"";

async function ensureAuth(){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  user=data?.session?.user||null;
  if(!user){location.replace("login.html");return false}
  return true;
}

async function loadData(){
  const code=orderCode();
  if(!code)throw new Error("Nomor pesanan tidak ditemukan.");

  const {data,error}=await supabase.from("flight_orders").select("*").eq("order_code",code).single();
  if(error)throw error;
  if(data.user_id&&data.user_id!==user.id)throw new Error("Anda tidak memiliki akses ke invoice pesanan ini.");
  order=data;

  const {data:rows,error:re}=await supabase
    .from("receivables")
    .select("id,flight_order_id,principal_amount,paid_amount,outstanding_amount,paid_at,status,booking_blocked")
    .eq("flight_order_id",order.id)
    .limit(1);
  if(re)throw re;
  receivable=Array.isArray(rows)&&rows.length?rows[0]:null;

  if(!receivable)throw new Error("Tagihan perjalanan belum tersedia.");
}

function isPaid(){
  const status=String(receivable?.status||"").toLowerCase();
  return status==="paid"||Number(receivable?.outstanding_amount||0)<=0;
}

function getPricing(){
  const p=order.payload||{},pricing=p.pricing||{};
  const flight=Number(order.flight_total??pricing.flightTotal??order.ticket_price??0);
  const baggage=Number(pricing.baggageTotal??0);
  const insurance=Number(pricing.insuranceTotal??0);
  const serviceFee=Number(order.service_fee??pricing.serviceFee??pricing.service_fee??0);
  const addonsTotal=Number(order.addons_total??pricing.addonsTotal??(baggage+insurance));
  const grand=Number(order.grand_total??pricing.grandTotal??(flight+addonsTotal+serviceFee));
  return {flight,baggage,insurance,serviceFee,addonsTotal,grand};
}

function resolveFlight(){
  const p=order.payload||{},f=p.flight||{},segs=Array.isArray(f.segments)?f.segments:[],first=segs[0]||{},search=f.searchSnapshot||p.search||{};
  const origin=String(search.origin||first.origin||f.origin||order.origin||"---").toUpperCase();
  const destination=String(search.destination||f.destination||order.destination||"---").toUpperCase();
  const last=segs.find(s=>String(s.destination||"").toUpperCase()===destination)||segs[segs.length-1]||first;
  return {
    origin,destination,
    depart:first.departureLocalTime||first.departureTime||order.depart_at,
    arrive:last.arrivalLocalTime||last.arrivalTime||order.arrival_at,
    airline:first.carrierName||f.airlineName||order.airline_name||"Maskapai",
    flightNo:first.flightNumber||f.flightNumber||order.flight_number||"—",
    trip:String(search.trip||search.tripType||"").toLowerCase()==="roundtrip"?"Pulang-pergi":"Sekali jalan"
  };
}

function customerInfo(){
  const p=order.payload||{},pd=p.passengerDetails||{};
  const pax=Array.isArray(pd.passengers)?pd.passengers[0]:null;
  return {
    name:pax?.fullName||pax?.full_name||pax?.name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"Customer LetsGo",
    email:user?.email||pd.email||"—"
  };
}

function render(){
  const paid=isPaid();
  const price=getPricing();
  const f=resolveFlight();
  const customer=customerInfo();
  const ops=order.payload?.ticketing||{};
  const payment=order.payload?.payment||{};

  $("#topOrder").textContent=order.order_code;
  $("#invoiceNumber").textContent=`INV-${order.order_code}`;
  $("#invoiceDate").textContent=dateOnly(receivable?.paid_at||order.updated_at||order.created_at);
  $("#orderCode").textContent=order.order_code;
  $("#customerName").textContent=String(customer.name).toUpperCase();
  $("#customerEmail").textContent=customer.email;

  $("#paymentRef").textContent=payment.midtrans_order_id||order.order_code;
  $("#paymentMethod").textContent=payment.payment_type?`Midtrans · ${String(payment.payment_type).replaceAll("_"," ")}`:"Midtrans";

  $("#airlineName").textContent=f.airline;
  $("#tripType").textContent=f.trip;
  $("#origin").textContent=f.origin;
  $("#destination").textContent=f.destination;
  $("#departAt").textContent=`${dateOnly(f.depart)} · ${hm(f.depart)}`;
  $("#arrivalAt").textContent=`${dateOnly(f.arrive)} · ${hm(f.arrive)}`;
  $("#flightNumber").textContent=f.flightNo;
  $("#pnr").textContent=ops.pnr||"—";
  $("#ticketNumber").textContent=ops.ticketNumber||"—";
  $("#passengerCount").textContent=`${order.payload?.passengerDetails?.passengers?.length||order.passenger_count||1} orang`;

  $("#flightTotal").textContent=rupiah(price.flight);

  const baggageShown=price.baggage>0;
  const insuranceShown=price.insurance>0;
  const combinedAddon=!baggageShown&&!insuranceShown&&price.addonsTotal>0;

  $("#baggageRow").classList.toggle("hidden",!(baggageShown||combinedAddon));
  if(baggageShown)$("#baggageTotal").textContent=rupiah(price.baggage);
  else if(combinedAddon){
    $("#baggageRow span").textContent="Layanan tambahan";
    $("#baggageTotal").textContent=rupiah(price.addonsTotal);
  }

  $("#insuranceRow").classList.toggle("hidden",!insuranceShown);
  if(insuranceShown)$("#insuranceTotal").textContent=rupiah(price.insurance);

  $("#serviceFeeRow").classList.toggle("hidden",!price.serviceFee);
  if(price.serviceFee)$("#serviceFee").textContent=rupiah(price.serviceFee);

  $("#grandTotal").textContent=rupiah(price.grand);
  $("#paidAt").textContent=receivable?.paid_at?`Dibayar ${dateTime(receivable.paid_at)}`:"Status pembayaran terkonfirmasi";

  const badge=$("#paymentBadge");
  const paidMini=document.querySelector(".paid-mini");
  if(paid){
    badge.innerHTML="<i>✓</i> LUNAS";
    badge.classList.remove("unpaid");
    paidMini.textContent="PAID";
  }else{
    badge.innerHTML="<i>!</i> BELUM LUNAS";
    badge.classList.add("unpaid");
    paidMini.textContent="UNPAID";
    document.querySelector(".secure-note strong").textContent="Pembayaran belum selesai";
    document.querySelector(".secure-note small").textContent="Invoice ini belum berstatus lunas.";
  }

  $("#ticketBtn").disabled=!(ops.officialTicketPath||ops.officialTicketUrl||order.ticket_url);

  $("#loadingState").classList.add("hidden");
  $("#invoicePaper").classList.remove("hidden");
  $("#actionPanel").classList.remove("hidden");
}

async function openStorageRef(ref,buckets=["flight-tickets","tickets","documents"]){
  if(!ref)return false;
  if(/^https?:\/\//i.test(ref)){window.open(ref,"_blank","noopener,noreferrer");return true}
  for(const bucket of buckets){
    try{
      const {data,error}=await supabase.storage.from(bucket).createSignedUrl(ref,600);
      if(!error&&data?.signedUrl){window.open(data.signedUrl,"_blank","noopener,noreferrer");return true}
    }catch{}
  }
  return false;
}

async function openTicket(){
  const ops=order?.payload?.ticketing||{};
  const ref=ops.officialTicketPath||ops.officialTicketUrl||order?.ticket_url||"";
  if(!ref)return toast("E-ticket resmi belum tersedia.");
  if(!await openStorageRef(ref))toast("E-ticket belum dapat dibuka.");
}

$("#backBtn").onclick=()=>history.length>1?history.back():location.href=`orders.html`;
$("#printTopBtn").onclick=()=>window.print();
$("#printBtn").onclick=()=>window.print();
$("#ticketBtn").onclick=()=>openTicket().catch(e=>toast(e.message||"E-ticket belum dapat dibuka."));
$("#retryBtn").onclick=()=>location.reload();

(async()=>{
  try{
    if(!await ensureAuth())return;
    await loadData();
    render();
  }catch(e){
    console.error("[LetsGo Invoice]",e);
    $("#loadingState").classList.add("hidden");
    $("#errorState").classList.remove("hidden");
    $("#errorText").textContent=e?.message||"Invoice belum dapat dimuat.";
  }
})();
