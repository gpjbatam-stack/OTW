import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);
const STATUS_LABEL={SUBMITTED:"Diajukan",PROCESSING:"Diproses",VERIFIED:"Verified",ISSUED:"Tiket terbit",COMPLETED:"Selesai",CANCELLED:"Dibatalkan"};
const STATUS_CLASS={SUBMITTED:"st-submitted",PROCESSING:"st-processing",VERIFIED:"st-verified",ISSUED:"st-issued",COMPLETED:"st-completed",CANCELLED:"st-cancelled"};

let sessionUser=null, orders=[], currentOrder=null, selectedStatus=null;

function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0)}
function dateTime(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d)? "—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}
function dateOnly(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d)? "—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"—"}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function ensureAdmin(){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  sessionUser=data?.session?.user;
  if(!sessionUser){location.replace("login.html");return false}

  const {data:admin,error:adminError}=await supabase
    .from("app_admins")
    .select("*")
    .eq("user_id",sessionUser.id)
    .maybeSingle();

  if(adminError)throw adminError;
  if(!admin){
    await supabase.auth.signOut();
    location.replace("login.html");
    return false;
  }
  return true;
}

async function loadOrders(){
  setLoading(true);
  const {data,error}=await supabase.from("flight_orders").select("*").order("created_at",{ascending:false});
  if(error)throw error;
  orders=data||[];
  updateMetrics();
  renderList();
  $("#lastSync").textContent=`Sync ${new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`;
  setLoading(false);
}

function setLoading(on){
  $("#loadingState").classList.toggle("hidden",!on);
  if(on){$("#ticketList").classList.add("hidden");$("#emptyState").classList.add("hidden");$("#errorState").classList.add("hidden")}
}

function updateMetrics(){
  const count=s=>orders.filter(o=>String(o.status).toUpperCase()===s).length;
  const today=new Date().toDateString();
  const todayRows=orders.filter(o=>new Date(o.created_at).toDateString()===today);
  const active=count("PROCESSING")+count("VERIFIED");

  $("#newCount").textContent=count("SUBMITTED");
  $("#processCount").textContent=count("PROCESSING");
  $("#verifiedCount").textContent=count("VERIFIED");
  $("#issuedCount").textContent=count("ISSUED");
  $("#completedCount").textContent=count("COMPLETED");
  $("#sideNewCount").textContent=count("SUBMITTED");
  $("#todayCount").textContent=todayRows.length;
  $("#todayValue").textContent=`${rupiah(todayRows.reduce((a,b)=>a+Number(b.grand_total||0),0))} nilai pengajuan`;
}

function filtered(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const status=$("#statusSelect").value;
  const sort=$("#sortSelect").value;
  let rows=orders.filter(o=>{
    const okStatus=status==="ALL"||String(o.status).toUpperCase()===status;
    const hay=[o.order_code,o.origin,o.destination,o.airline_name,o.flight_number].join(" ").toLowerCase();
    return okStatus&&(!q||hay.includes(q));
  });
  if(sort==="OLDEST")rows.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if(sort==="HIGHEST")rows.sort((a,b)=>Number(b.grand_total||0)-Number(a.grand_total||0));
  else if(sort==="DEPARTURE")rows.sort((a,b)=>new Date(a.depart_at||"2999-01-01")-new Date(b.depart_at||"2999-01-01"));
  else rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return rows;
}

function renderList(){
  const rows=filtered();
  $("#resultLabel").textContent=`${rows.length} order`;
  const list=$("#ticketList");

  if(!rows.length){
    list.classList.add("hidden");
    $("#emptyState").classList.remove("hidden");
    return;
  }
  $("#emptyState").classList.add("hidden");
  list.classList.remove("hidden");

  list.innerHTML=rows.map(o=>{
    const s=String(o.status||"SUBMITTED").toUpperCase();
    return `<article class="ticket-card" data-code="${esc(o.order_code)}">
      <div class="order-id">
        <span>ORDER</span>
        <strong>${esc(o.order_code)}</strong>
        <small>${dateTime(o.created_at)}</small>
      </div>
      <div class="route-cell">
        <div class="airport"><strong>${esc(o.origin||"---")}</strong><small>${hm(o.depart_at)}</small></div>
        <div class="route-track"><i></i><svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg><i></i></div>
        <div class="airport right"><strong>${esc(o.destination||"---")}</strong><small>${dateOnly(o.depart_at)}</small></div>
      </div>
      <div class="cell"><small>MASKAPAI</small><strong>${esc(o.airline_name||"—")} · ${esc(o.flight_number||"—")}</strong></div>
      <div class="cell value-cell"><small>TOTAL</small><strong>${rupiah(o.grand_total)}</strong></div>
      <div class="status-wrap"><span class="status-badge ${STATUS_CLASS[s]||"st-submitted"}"><i></i>${STATUS_LABEL[s]||s}</span></div>
      <span class="chevron"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>
    </article>`;
  }).join("");

  list.querySelectorAll(".ticket-card").forEach(c=>c.addEventListener("click",()=>openOrder(c.dataset.code)));
}

function openOrder(code){
  currentOrder=orders.find(o=>o.order_code===code);
  if(!currentOrder)return;
  selectedStatus=String(currentOrder.status||"SUBMITTED").toUpperCase();

  $("#drawerOrderCode").textContent=currentOrder.order_code;
  $("#drawerCreated").textContent=`Diajukan ${dateTime(currentOrder.created_at)}`;
  $("#drawerStatus").textContent=STATUS_LABEL[selectedStatus]||selectedStatus;
  $("#drawerStatusBadge").className=`status-badge ${STATUS_CLASS[selectedStatus]||"st-submitted"}`;
  $("#drawerStatusBadge").innerHTML=`<i></i>${STATUS_LABEL[selectedStatus]||selectedStatus}`;
  $("#drawerAirlineCode").textContent=String(currentOrder.airline_code||"FL").toUpperCase();
  $("#drawerAirline").textContent=currentOrder.airline_name||"Maskapai";
  $("#drawerFlightNumber").textContent=currentOrder.flight_number||"—";
  $("#drawerOrigin").textContent=currentOrder.origin||"---";
  $("#drawerDestination").textContent=currentOrder.destination||"---";
  $("#drawerDepart").textContent=`${dateOnly(currentOrder.depart_at)} · ${hm(currentOrder.depart_at)}`;
  $("#drawerArrival").textContent=hm(currentOrder.arrival_at);
  $("#drawerPax").textContent=`${currentOrder.passenger_count||1} orang`;
  $("#drawerTotal").textContent=rupiah(currentOrder.grand_total);
  $("#drawerSpt").textContent=currentOrder.spt_path?"Tersimpan":"Cek detail";

  const addons=currentOrder.payload?.addons||{};
  const baggage=Array.isArray(addons.baggage)?addons.baggage.length:0;
  $("#drawerAddon").textContent=baggage||addons.insurance?`${baggage} bagasi${addons.insurance?" + asuransi":""}`:"Tidak ada";

  const ops=currentOrder.payload?.ticketing||{};
  $("#supplierInput").value=ops.supplier||"";
  $("#pnrInput").value=ops.pnr||"";
  $("#ticketUrlInput").value=currentOrder.ticket_url||ops.ticketUrl||currentOrder.payload?.ticketUrl||"";
  $("#adminNotesInput").value=currentOrder.admin_notes||"";

  document.querySelectorAll("#statusFlow button").forEach(b=>b.classList.toggle("selected",b.dataset.status===selectedStatus));
  $("#drawerBackdrop").classList.remove("hidden");
  document.body.style.overflow="hidden";
}

function closeDrawer(){
  $("#drawerBackdrop").classList.add("hidden");
  document.body.style.overflow="";
  currentOrder=null;
}

function buildPayload(){
  return {
    ...(currentOrder.payload||{}),
    ticketing:{
      ...(currentOrder.payload?.ticketing||{}),
      supplier:$("#supplierInput").value.trim(),
      pnr:$("#pnrInput").value.trim(),
      ticketUrl:$("#ticketUrlInput").value.trim(),
      updatedAt:new Date().toISOString()
    }
  };
}

async function saveOrder(updateStatus=true){
  if(!currentOrder)return;
  const patch={
    payload:buildPayload(),
    admin_notes:$("#adminNotesInput").value.trim()
  };
  if(updateStatus)patch.status=selectedStatus;

  // ticket_url may exist if optional extension SQL has been run.
  // Keep URL inside payload regardless, so the workflow still works without that column.
  const {error}=await supabase.from("flight_orders").update(patch).eq("id",currentOrder.id);
  if(error)throw error;

  toast(updateStatus?"Ticketing berhasil diperbarui.":"Data fulfillment tersimpan.");
  closeDrawer();
  await loadOrders();
}

async function cancelOrder(){
  if(!currentOrder)return;
  const {error}=await supabase.from("flight_orders").update({
    status:"CANCELLED",
    admin_notes:$("#adminNotesInput").value.trim(),
    payload:buildPayload()
  }).eq("id",currentOrder.id);
  if(error)throw error;
  $("#confirmBackdrop").classList.add("hidden");
  toast("Pengajuan dibatalkan.");
  closeDrawer();
  await loadOrders();
}

$("#searchInput").addEventListener("input",renderList);
$("#statusSelect").addEventListener("change",renderList);
$("#sortSelect").addEventListener("change",renderList);
$("#refreshBtn").addEventListener("click",()=>loadOrders().then(()=>toast("Data ticketing diperbarui.")));
$("#mobileRefreshBtn").addEventListener("click",()=>loadOrders().then(()=>toast("Data ticketing diperbarui.")));
$("#retryBtn").addEventListener("click",()=>location.reload());
$("#newestBtn").addEventListener("click",()=>{ $("#statusSelect").value="SUBMITTED"; $("#sortSelect").value="NEWEST"; renderList(); window.scrollTo({top:document.body.scrollHeight*.28,behavior:"smooth"}); });
$("#closeDrawerBtn").addEventListener("click",closeDrawer);
$("#drawerBackdrop").addEventListener("click",e=>{if(e.target===$("#drawerBackdrop"))closeDrawer()});
$("#openCustomerDetailBtn").addEventListener("click",()=>{if(currentOrder)window.open(`detail-pesanan.html?id=${encodeURIComponent(currentOrder.order_code)}`,"_blank")});
document.querySelectorAll("#statusFlow button").forEach(b=>b.addEventListener("click",()=>{selectedStatus=b.dataset.status;document.querySelectorAll("#statusFlow button").forEach(x=>x.classList.toggle("selected",x===b))}));
$("#saveDraftBtn").addEventListener("click",()=>saveOrder(false).catch(e=>toast(e.message)));
$("#saveStatusBtn").addEventListener("click",()=>saveOrder(true).catch(e=>toast(e.message)));
$("#cancelOrderBtn").addEventListener("click",()=>$("#confirmBackdrop").classList.remove("hidden"));
$("#cancelConfirmBtn").addEventListener("click",()=>$("#confirmBackdrop").classList.add("hidden"));
$("#confirmCancelBtn").addEventListener("click",()=>cancelOrder().catch(e=>toast(e.message)));
$("#mobileMenuBtn").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
$("#logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();location.replace("login.html")});

(async function init(){
  try{
    if(!await ensureAdmin())return;
    await loadOrders();
  }catch(e){
    console.error("[Admin Ticketing]",e);
    setLoading(false);
    $("#errorState").classList.remove("hidden");
    $("#errorMessage").textContent=e.message||"Gagal memuat data ticketing.";
  }
})();
