import { supabase } from "./supabase.js";
const $=s=>document.querySelector(s);let user=null,order=null,receivable=null;
const rupiah=v=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0);
const hm=v=>{const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"};
const dateLabel=v=>{if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)};
const deadlineLabel=v=>{if(!v)return"—";const raw=String(v);const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T00:00:00`):new Date(raw);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"long",year:"numeric"}).format(d)};
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
const orderCode=()=>new URLSearchParams(location.search).get("id")||"";
async function ensureAuth(){const {data,error}=await supabase.auth.getSession();if(error)throw error;user=data?.session?.user||null;if(!user){location.replace("login.html");return false}return true}
async function loadOrder(){
  const code=orderCode();
  if(!code)throw new Error("Nomor pesanan tidak ditemukan.");

  const {data,error}=await supabase
    .from("flight_orders")
    .select("*")
    .eq("order_code",code)
    .single();

  if(error)throw error;
  if(data.user_id&&data.user_id!==user.id)throw new Error("Pesanan ini bukan milik akun Anda.");

  order=data;

  const {data:receivableRows,error:receivableError}=await supabase
    .from("receivables")
    .select("id,flight_order_id,principal_amount,paid_amount,outstanding_amount,arrived_batam_at,due_date,effective_due_date,paid_at,status,booking_blocked")
    .eq("flight_order_id",order.id)
    .limit(1);

  if(receivableError)console.warn("[LetsGo Receivable]",receivableError);
  receivable=Array.isArray(receivableRows)&&receivableRows.length?receivableRows[0]:null;

  const status=String(order.status||"").toUpperCase();
  if(!["COMPLETED","PAID"].includes(status) && !receivable?.arrived_batam_at){
    throw new Error("Pembayaran belum tersedia untuk pesanan ini.");
  }
}
function resolveFlight(){const p=order.payload||{},f=p.flight||{},segs=Array.isArray(f.segments)?f.segments:[],first=segs[0]||{},search=f.searchSnapshot||p.search||{};const origin=String(search.origin||first.origin||f.origin||order.origin||"---").toUpperCase();const destination=String(search.destination||f.destination||order.destination||"---").toUpperCase();const last=segs.find(s=>String(s.destination||"").toUpperCase()===destination)||segs[segs.length-1]||first;return{first,last,origin,destination,depart:first.departureLocalTime||first.departureTime||order.depart_at,arrive:last.arrivalLocalTime||last.arrivalTime||order.arrival_at,airline:first.carrierName||f.airlineName||order.airline_name||"Maskapai",flightNo:first.flightNumber||f.flightNumber||order.flight_number||"—",trip:String(search.trip||"").toLowerCase()==="roundtrip"?"Pulang-pergi":"Sekali jalan"}}
function paymentSnapshot(){const p=order.payload||{},pricing=p.pricing||{};const flight=Number(order.flight_total??pricing.flightTotal??0),baggage=Number(pricing.baggageTotal||0),insurance=Number(pricing.insuranceTotal||0),serviceFee=Number(pricing.serviceFee||pricing.service_fee||0),grand=Number(order.grand_total??pricing.grandTotal??flight+baggage+insurance+serviceFee);return{flight,baggage,insurance,serviceFee,grand}}
function paymentState(){
  const rs=String(receivable?.status||"").toLowerCase();
  const outstanding=receivable?.outstanding_amount;
  if(
    rs==="paid" ||
    (
      outstanding!==null &&
      outstanding!==undefined &&
      Number.isFinite(Number(outstanding)) &&
      Number(outstanding)<=0
    )
  )return"paid";
  const p=order.payload?.payment||{};
  const state=String(p.transaction_status||p.status||order.payment_status||"").toLowerCase();
  if(["settlement","capture","paid","success"].includes(state)||String(order.status).toUpperCase()==="PAID")return"paid";
  return"waiting";
}
function render(){
  const f=resolveFlight(),price=paymentSnapshot();
  $("#orderCodeTop").textContent=order.order_code;
  $("#billOrder").textContent=order.order_code;

  ["#grandTotal","#billGrandTotal","#footerTotal"].forEach(s=>$(s).textContent=rupiah(price.grand));
  $("#flightTotal").textContent=rupiah(price.flight);
  $("#baggageTotal").textContent=rupiah(price.baggage);
  $("#insuranceTotal").textContent=rupiah(price.insurance);
  $("#baggageRow").classList.toggle("hidden",!price.baggage);
  $("#insuranceRow").classList.toggle("hidden",!price.insurance);

  if(price.serviceFee){
    $("#serviceFeeRow").classList.remove("hidden");
    $("#serviceFee").textContent=rupiah(price.serviceFee);
  }

  $("#airline").textContent=f.airline;
  $("#flightNumber").textContent=f.flightNo;
  $("#tripType").textContent=f.trip;
  $("#origin").textContent=f.origin;
  $("#destination").textContent=f.destination;
  $("#departAt").textContent=`${dateLabel(f.depart)} · ${hm(f.depart)}`;
  $("#arrivalAt").textContent=`${dateLabel(f.arrive)} · ${hm(f.arrive)}`;

  renderDeadline();
  applyPaymentState(paymentState());

  $("#loadingState").classList.add("hidden");
  $("#content").classList.remove("hidden");
  $("#actionBar").classList.remove("hidden");
  if(paymentState()!=="paid")startPaymentWatcher();
}
function applyPaymentState(state){
  const badge=$("#paymentStatusBadge"),btn=$("#payBtn");

  if(state==="paid"){
    badge.className="status-pill paid";
    badge.innerHTML="<i></i> PEMBAYARAN BERHASIL";
    $("#paidSection").classList.remove("hidden");
    $("#heroSub").textContent="Pembayaran telah dikonfirmasi oleh LetsGo.";
    $("#footerLabel").textContent="Status pembayaran";
    $("#footerTotal").textContent="Lunas";
    if(receivable?.paid_at)$("#paidAt").textContent=`Dikonfirmasi ${deadlineLabel(receivable.paid_at)}`;
    btn.textContent="Lihat Invoice";
    btn.dataset.mode="invoice";
    btn.disabled=false;
    document.body.classList.remove("overdue");
    return;
  }

  badge.className="status-pill waiting";
  badge.innerHTML="<i></i> MENUNGGU PEMBAYARAN";
  btn.textContent="Bayar Sekarang";
  btn.dataset.mode="pay";
  btn.disabled=false;
}

function renderDeadline(){
  const due=receivable?.effective_due_date||receivable?.due_date||null;
  const paid=paymentState()==="paid";
  const deadlineEl=$("#deadlineText");
  const badge=$("#deadlineBadge");

  if(paid){
    deadlineEl.textContent="Pembayaran selesai";
    badge.textContent="Lunas";
    document.body.classList.remove("overdue");
    return;
  }

  if(!receivable?.arrived_batam_at||!due){
    deadlineEl.textContent="Menunggu konfirmasi tiba di Batam";
    badge.textContent="Tempo 10 hari";
    document.body.classList.remove("overdue");
    return;
  }

  const overdue=new Date(`${due}T23:59:59`).getTime()<Date.now();
  deadlineEl.textContent=`Selesaikan sebelum ${deadlineLabel(due)}`;
  badge.textContent=overdue?"Perlu diselesaikan":"Tempo 10 hari";
  document.body.classList.toggle("overdue",overdue);

  if(overdue){
    $("#heroSub").textContent="Batas pembayaran telah terlewati. Selesaikan pembayaran untuk melanjutkan layanan LetsGo.";
  }else{
    $("#heroSub").textContent=`Selesaikan sebelum ${deadlineLabel(due)}.`;
  }
}

async function syncPaymentWithMidtrans(){
  if(!order?.order_code)return {ok:false,paid:false};
  const {data,error}=await supabase.functions.invoke("midtrans-sync-payment",{
    body:{orderCode:order.order_code}
  });
  if(error){
    console.warn("[LetsGo Midtrans Sync]",error);
    return {ok:false,paid:false};
  }
  return data||{ok:false,paid:false};
}

function validatePaymentEnvironment(environment){
  const env=String(environment||"").toLowerCase();
  if(!["production","sandbox"].includes(env)){
    throw new Error("Konfigurasi environment Midtrans tidak valid.");
  }

  // Testing mode: izinkan Midtrans Sandbox berjalan di domain letsgo.co.id.
  // Saat akun Midtrans production sudah aktif, backend cukup mengembalikan
  // environment="production" dan Snap otomatis memakai endpoint production.
  return env;
}
function loadSnapScript(clientKey,environment){return new Promise((resolve,reject)=>{
  try{
    if(!clientKey)throw new Error("Midtrans Client Key tidak tersedia.");
    const env=validatePaymentEnvironment(environment);
    if(window.snap)return resolve();
    const s=document.createElement("script");
    s.src=env==="production"?"https://app.midtrans.com/snap/snap.js":"https://app.sandbox.midtrans.com/snap/snap.js";
    s.dataset.clientKey=clientKey;
    s.onload=resolve;
    s.onerror=()=>reject(new Error("Gagal memuat Midtrans Snap."));
    document.head.appendChild(s);
  }catch(error){reject(error)}
})}
async function waitForVerifiedPayment(maxAttempts=8){
  for(let i=0;i<maxAttempts;i++){
    const result=await syncPaymentWithMidtrans();
    await reloadPaymentData();
    if(result?.paid||paymentState()==="paid")return true;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  return false;
}

async function createTransaction(){
  const btn=$("#payBtn"),old=btn.textContent;
  btn.disabled=true;btn.textContent="Menyiapkan Midtrans...";
  try{
    const {data,error}=await supabase.functions.invoke("midtrans-create-payment",{body:{orderCode:order.order_code}});
    if(error)throw error;
    if(!data?.ok)throw new Error(data?.message||"Gagal membuat transaksi.");
    await loadSnapScript(data.clientKey,data.environment);
    window.snap.pay(data.snapToken,{
      onSuccess:async()=>{
        toast("Pembayaran berhasil. Memverifikasi...");
        const verified=await waitForVerifiedPayment(10);
        if(verified){
          toast("Pembayaran dikonfirmasi. Mengarahkan ke Pesanan...");
          setTimeout(()=>location.replace("orders.html?payment=success"),700);
        }else{
          toast("Pembayaran diterima. Status sedang disinkronkan.");
          startPaymentWatcher();
        }
      },
      onPending:async()=>{
        toast("Pembayaran dibuat. Menunggu konfirmasi.");
        await syncPaymentWithMidtrans();
        await reloadPaymentData();
      },
      onError:()=>toast("Pembayaran gagal. Silakan coba metode lain."),
      onClose:async()=>{
        await syncPaymentWithMidtrans();
        await reloadPaymentData();
      }
    });
  }catch(e){
    console.error(e);toast(e.message||"Pembayaran belum dapat diproses.");
  }finally{
    btn.disabled=false;btn.textContent=old;
  }
}
let paymentWatchTimer=null;
function startPaymentWatcher(){
  if(paymentWatchTimer)clearInterval(paymentWatchTimer);
  paymentWatchTimer=setInterval(async()=>{
    try{
      await syncPaymentWithMidtrans();
      await reloadPaymentData();
      if(paymentState()==="paid"){
        clearInterval(paymentWatchTimer);paymentWatchTimer=null;
        toast("Pembayaran dikonfirmasi. Mengarahkan ke Pesanan...");
        setTimeout(()=>location.replace("orders.html?payment=success"),700);
      }
    }catch(e){console.warn("[LetsGo Payment Watcher]",e)}
  },2500);
}

async function reloadPaymentData(){
  const {data,error}=await supabase.from("flight_orders").select("*").eq("order_code",order.order_code).single();
  if(!error&&data)order=data;
  const {data:rows,error:receivableError}=await supabase.from("receivables")
    .select("id,flight_order_id,principal_amount,paid_amount,outstanding_amount,arrived_batam_at,due_date,effective_due_date,paid_at,status,booking_blocked")
    .eq("flight_order_id",order.id).limit(1);
  if(!receivableError&&Array.isArray(rows)&&rows.length)receivable=rows[0];
  renderDeadline();applyPaymentState(paymentState());
}
async function refreshPayment(){
  await syncPaymentWithMidtrans();
  await reloadPaymentData();
  if(paymentState()==="paid")toast("Pembayaran telah dikonfirmasi.");
}
window.addEventListener("focus",async()=>{
  if(!order)return;
  try{
    await refreshPayment();
    if(paymentState()==="paid")location.replace("orders.html?payment=success");
  }catch{}
});
document.addEventListener("visibilitychange",async()=>{
  if(document.visibilityState!=="visible"||!order)return;
  try{
    await refreshPayment();
    if(paymentState()==="paid")location.replace("orders.html?payment=success");
  }catch{}
});

$("#backBtn").onclick=()=>history.length>1?history.back():location.href=`detail-pesanan.html?id=${encodeURIComponent(orderCode())}`;$("#retryBtn").onclick=()=>location.reload();$("#helpBtn").onclick=()=>location.href="help.html";$("#payBtn").onclick=()=>{$("#payBtn").dataset.mode==="invoice"?location.href=`invoice.html?id=${encodeURIComponent(order.order_code)}`:createTransaction()};
(async()=>{try{if(!await ensureAuth())return;await loadOrder();render()}catch(e){console.error(e);$("#loadingState").classList.add("hidden");$("#errorState").classList.remove("hidden");$("#errorText").textContent=e.message||"Pembayaran belum dapat dimuat."}})();

window.addEventListener("pagehide",()=>{if(paymentWatchTimer){clearInterval(paymentWatchTimer);paymentWatchTimer=null}});
