import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);

const STATUS_LABEL={
  SUBMITTED:"Diajukan", PROCESSING:"Diproses", VERIFIED:"Terverifikasi",
  ISSUED:"Tiket terbit", COMPLETED:"Selesai", PAID:"Lunas", CANCELLED:"Dibatalkan"
};
const STATUS_CLASS={
  SUBMITTED:"st-submitted", PROCESSING:"st-processing", VERIFIED:"st-processing",
  ISSUED:"st-issued", COMPLETED:"st-completed", PAID:"st-paid", CANCELLED:"st-cancelled"
};

let user=null,orders=[],receivablesByOrderId=new Map(),activeStatus="ALL",sortMode="NEWEST",query="";
let ordersChannel=null,receivablesChannel=null,reloadTimer=null;

function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0)}
function dateLabel(v){if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2200)}
function receivableFor(order){return receivablesByOrderId.get(order.id)||null}
function isPaid(order){
  const r=receivableFor(order);
  if(r){
    const status=String(r.status||"").toLowerCase();
    if(status==="paid")return true;
    if(r.outstanding_amount!==null&&r.outstanding_amount!==undefined&&Number(r.outstanding_amount)<=0)return true;
  }
  return String(order.status||"").toUpperCase()==="PAID";
}
function effectiveStatus(order){return isPaid(order)?"PAID":String(order.status||"SUBMITTED").toUpperCase()}

async function ensureAuth(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data?.user){
    try{await supabase.auth.signOut({scope:"local"})}catch{}
    user=null;location.replace("login.html?next=orders.html");return false;
  }
  user=data.user;return true;
}

async function loadOrders(){
  $("#loadingState").classList.remove("hidden");$("#errorState").classList.add("hidden");
  $("#emptyState").classList.add("hidden");$("#orderList").classList.add("hidden");
  $("#resultLabel").textContent="Memuat pesanan...";
  const {data,error}=await supabase.from("flight_orders").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
  if(error)throw error;
  orders=data||[];
  receivablesByOrderId=new Map();
  const orderIds=orders.map(x=>x.id).filter(Boolean);
  if(orderIds.length){
    const fetchReceivables=()=>supabase.from("receivables")
      .select("flight_order_id,effective_due_date,due_date,status,outstanding_amount,paid_amount,paid_at")
      .in("flight_order_id",orderIds);

    let {data:receivables,error:receivableError}=await fetchReceivables();
    if(receivableError){
      console.warn("[LetsGo Receivables] first attempt failed:",receivableError);
      await new Promise(resolve=>setTimeout(resolve,450));
      const retry=await fetchReceivables();
      receivables=retry.data;
      receivableError=retry.error;
    }

    if(receivableError){
      console.warn("[LetsGo Receivables] retry failed:",receivableError);
      toast("Status pembayaran sedang disinkronkan. Tarik untuk memperbarui.");
    }else{
      (receivables||[]).forEach(r=>receivablesByOrderId.set(r.flight_order_id,r));
    }
  }
  $("#loadingState").classList.add("hidden");updateSummary();render();
}

function updateSummary(){
  const active=orders.filter(x=>["SUBMITTED","PROCESSING","VERIFIED"].includes(effectiveStatus(x))).length;
  const issued=orders.filter(x=>effectiveStatus(x)==="ISSUED").length;
  const completed=orders.filter(x=>["COMPLETED","PAID"].includes(effectiveStatus(x))).length;
  $("#heroTotalOrders").textContent=orders.length;$("#heroActiveOrders").textContent=`${active} sedang diproses`;
  $("#activeCount").textContent=active;$("#issuedCount").textContent=issued;$("#completedCount").textContent=completed;
}
function filteredOrders(){
  let rows=[...orders];
  if(activeStatus==="ACTIVE")rows=rows.filter(x=>["SUBMITTED","PROCESSING","VERIFIED"].includes(effectiveStatus(x)));
  else if(activeStatus!=="ALL"){
    if(activeStatus==="COMPLETED")rows=rows.filter(x=>["COMPLETED","PAID"].includes(effectiveStatus(x)));
    else rows=rows.filter(x=>effectiveStatus(x)===activeStatus);
  }
  const q=query.trim().toLowerCase();
  if(q)rows=rows.filter(x=>String(x.order_code||"").toLowerCase().includes(q)||String(x.origin||"").toLowerCase().includes(q)||String(x.destination||"").toLowerCase().includes(q)||String(x.airline_name||"").toLowerCase().includes(q)||String(x.flight_number||"").toLowerCase().includes(q));
  if(sortMode==="OLDEST")rows.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if(sortMode==="HIGHEST")rows.sort((a,b)=>Number(b.grand_total||0)-Number(a.grand_total||0));
  else rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return rows;
}
function reminderBadge(order){
  const r=receivableFor(order);if(!r||isPaid(order))return"";
  const deadline=r.effective_due_date||r.due_date;if(!deadline)return"";
  return `<span class="payment-reminder"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>Selesaikan sebelum ${dateLabel(deadline)}</span>`;
}
function render(){
  const rows=filteredOrders(),list=$("#orderList");$("#resultLabel").textContent=`${rows.length} pesanan`;
  if(!rows.length){list.classList.add("hidden");$("#emptyState").classList.remove("hidden");
    if(orders.length){$("#emptyTitle").textContent="Pesanan tidak ditemukan";$("#emptyText").textContent="Coba ubah filter atau kata pencarian."}
    else{$("#emptyTitle").textContent="Belum ada pesanan";$("#emptyText").textContent="Pengajuan perjalanan yang Anda buat akan muncul di sini."}return}
  $("#emptyState").classList.add("hidden");list.classList.remove("hidden");
  list.innerHTML=rows.map(order=>{
    const status=effectiveStatus(order),statusLabel=STATUS_LABEL[status]||status,statusClass=STATUS_CLASS[status]||"st-submitted";
    return `<article class="order-card" data-code="${order.order_code}">
      <div class="order-main"><div class="order-head"><div class="order-code"><span>NOMOR PESANAN</span><strong>${order.order_code}</strong></div>
      <div class="order-badges"><span class="status-badge ${statusClass}"><i></i>${statusLabel}</span>${reminderBadge(order)}</div></div>
      <div class="route-row"><div class="route-code"><strong>${order.origin||"---"}</strong><small>Asal</small></div>
      <div class="route-line"><i></i><svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg><i></i></div>
      <div class="route-code right"><strong>${order.destination||"---"}</strong><small>Tujuan</small></div></div>
      <div class="order-meta"><span>${order.airline_name||"Maskapai"}</span><b>•</b><span>${order.flight_number||"—"}</span><b>•</b><span>${dateLabel(order.depart_at)}</span><b>•</b><span>${order.passenger_count||1} pax</span></div></div>
      <div class="order-bottom"><div class="price-copy"><small>Total perjalanan</small><strong>${rupiah(order.grand_total)}</strong></div>
      <span class="open-order">Lihat detail<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span></div></article>`;
  }).join("");
  list.querySelectorAll(".order-card").forEach(card=>card.addEventListener("click",()=>location.href=`detail-pesanan.html?id=${encodeURIComponent(card.dataset.code)}`));
}
function openFilter(){$("#filterSheet").classList.remove("hidden");document.body.style.overflow="hidden"}
function closeFilter(){$("#filterSheet").classList.add("hidden");document.body.style.overflow=""}
$("#backBtn")?.addEventListener("click",()=>history.back());$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#newTripBtn")?.addEventListener("click",()=>location.href="home.html");$("#retryBtn")?.addEventListener("click",()=>location.reload());
$("#refreshBtn")?.addEventListener("click",async()=>{try{await loadOrders();toast("Pesanan diperbarui.")}catch{toast("Gagal memperbarui pesanan.")}});
$("#searchInput")?.addEventListener("input",e=>{query=e.target.value;render()});
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");activeStatus=btn.dataset.status;render()}));
$("#filterBtn")?.addEventListener("click",openFilter);$("#closeFilterBtn")?.addEventListener("click",closeFilter);
$("#filterSheet")?.addEventListener("click",e=>{if(e.target===$("#filterSheet"))closeFilter()});
document.querySelectorAll(".filter-option").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".filter-option").forEach(x=>x.classList.remove("active"));btn.classList.add("active");sortMode=btn.dataset.sort}));
$("#applyFilterBtn")?.addEventListener("click",()=>{render();closeFilter()});

function scheduleReload(delay=180){
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(()=>loadOrders().catch(error=>console.warn("[LetsGo Orders Realtime]",error)),delay);
}
async function startRealtime(){
  if(!user?.id)return;
  if(ordersChannel)await supabase.removeChannel(ordersChannel);
  if(receivablesChannel)await supabase.removeChannel(receivablesChannel);

  ordersChannel=supabase
    .channel(`orders-flight-orders-${user.id}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"flight_orders",filter:`user_id=eq.${user.id}`},()=>scheduleReload())
    .subscribe();

  // RLS remains the security boundary. Any receivable change visible to this user
  // triggers a debounced refresh so settlement is reflected without manual reload.
  receivablesChannel=supabase.channel(`orders-receivables-${user.id}`);
  for(const item of orders){
    if(!item?.id)continue;
    receivablesChannel.on(
      "postgres_changes",
      {event:"*",schema:"public",table:"receivables",filter:`flight_order_id=eq.${item.id}`},
      ()=>scheduleReload(250)
    );
  }
  receivablesChannel.subscribe();
}
function handlePaymentReturn(){
  const params=new URLSearchParams(location.search);
  if(params.get("payment")==="success"){
    toast("Pembayaran berhasil dan status pesanan telah diperbarui.");
    params.delete("payment");
    const next=`${location.pathname}${params.toString()?`?${params}`:""}${location.hash||""}`;
    history.replaceState({},document.title,next);
  }
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&user)scheduleReload(0)});
window.addEventListener("focus",()=>{if(user)scheduleReload(0)});
window.addEventListener("pagehide",()=>{
  if(ordersChannel)supabase.removeChannel(ordersChannel);
  if(receivablesChannel)supabase.removeChannel(receivablesChannel);
});

async function init(){try{if(!await ensureAuth())return;await loadOrders();handlePaymentReturn();await startRealtime()}catch(error){console.error("[LetsGo Orders]",error);$("#loadingState").classList.add("hidden");$("#errorState").classList.remove("hidden");$("#errorMessage").textContent=error?.message||"Pesanan belum dapat dimuat."}}
init();
