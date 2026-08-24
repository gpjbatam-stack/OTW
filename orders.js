import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);

const STATUS_LABEL={
  SUBMITTED:"Diajukan",
  PROCESSING:"Diproses",
  VERIFIED:"Terverifikasi",
  ISSUED:"Tiket terbit",
  COMPLETED:"Selesai",
  CANCELLED:"Dibatalkan"
};

const STATUS_CLASS={
  SUBMITTED:"st-submitted",
  PROCESSING:"st-processing",
  VERIFIED:"st-processing",
  ISSUED:"st-issued",
  COMPLETED:"st-completed",
  CANCELLED:"st-cancelled"
};

let user=null;
let orders=[];
let activeStatus="ALL";
let sortMode="NEWEST";
let query="";

function rupiah(v){
  return new Intl.NumberFormat("id-ID",{
    style:"currency",currency:"IDR",maximumFractionDigits:0
  }).format(Number(v)||0);
}

function dateLabel(v){
  if(!v)return"—";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return"—";
  return new Intl.DateTimeFormat("id-ID",{
    day:"numeric",month:"short",year:"numeric"
  }).format(d);
}

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

async function ensureAuth(){
  // Validate the account against Supabase Auth server.
  // A stale browser session must never be treated as an active LetsGo user.
  const {data,error}=await supabase.auth.getUser();

  if(error || !data?.user){
    try { await supabase.auth.signOut({ scope:"local" }); } catch {}
    user=null;
    location.replace("login.html?next=orders.html");
    return false;
  }

  user=data.user;
  return true;
}

async function loadOrders(){
  $("#loadingState").classList.remove("hidden");
  $("#errorState").classList.add("hidden");
  $("#emptyState").classList.add("hidden");
  $("#orderList").classList.add("hidden");
  $("#resultLabel").textContent="Memuat pesanan...";

  const {data,error}=await supabase
    .from("flight_orders")
    .select("*")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false});

  if(error)throw error;

  orders=data||[];

  $("#loadingState").classList.add("hidden");
  updateSummary();
  render();
}

function updateSummary(){
  const active=orders.filter(x=>["SUBMITTED","PROCESSING","VERIFIED"].includes(String(x.status).toUpperCase())).length;
  const issued=orders.filter(x=>String(x.status).toUpperCase()==="ISSUED").length;
  const completed=orders.filter(x=>String(x.status).toUpperCase()==="COMPLETED").length;

  $("#heroTotalOrders").textContent=orders.length;
  $("#heroActiveOrders").textContent=`${active} sedang diproses`;
  $("#activeCount").textContent=active;
  $("#issuedCount").textContent=issued;
  $("#completedCount").textContent=completed;
}

function filteredOrders(){
  let rows=[...orders];

  if(activeStatus==="ACTIVE"){
    rows=rows.filter(x=>["SUBMITTED","PROCESSING","VERIFIED"].includes(String(x.status).toUpperCase()));
  }else if(activeStatus!=="ALL"){
    rows=rows.filter(x=>String(x.status).toUpperCase()===activeStatus);
  }

  const q=query.trim().toLowerCase();

  if(q){
    rows=rows.filter(x=>
      String(x.order_code||"").toLowerCase().includes(q)||
      String(x.origin||"").toLowerCase().includes(q)||
      String(x.destination||"").toLowerCase().includes(q)||
      String(x.airline_name||"").toLowerCase().includes(q)||
      String(x.flight_number||"").toLowerCase().includes(q)
    );
  }

  if(sortMode==="OLDEST"){
    rows.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  }else if(sortMode==="HIGHEST"){
    rows.sort((a,b)=>Number(b.grand_total||0)-Number(a.grand_total||0));
  }else{
    rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  }

  return rows;
}

function render(){
  const rows=filteredOrders();
  const list=$("#orderList");

  $("#resultLabel").textContent=`${rows.length} pesanan`;

  if(!rows.length){
    list.classList.add("hidden");
    $("#emptyState").classList.remove("hidden");

    if(orders.length){
      $("#emptyTitle").textContent="Pesanan tidak ditemukan";
      $("#emptyText").textContent="Coba ubah filter atau kata pencarian.";
    }else{
      $("#emptyTitle").textContent="Belum ada pesanan";
      $("#emptyText").textContent="Pengajuan perjalanan yang Anda buat akan muncul di sini.";
    }
    return;
  }

  $("#emptyState").classList.add("hidden");
  list.classList.remove("hidden");

  list.innerHTML=rows.map(order=>{
    const status=String(order.status||"SUBMITTED").toUpperCase();
    const statusLabel=STATUS_LABEL[status]||status;
    const statusClass=STATUS_CLASS[status]||"st-submitted";

    return `
      <article class="order-card" data-code="${order.order_code}">
        <div class="order-main">
          <div class="order-head">
            <div class="order-code">
              <span>NOMOR PESANAN</span>
              <strong>${order.order_code}</strong>
            </div>

            <span class="status-badge ${statusClass}">
              <i></i>${statusLabel}
            </span>
          </div>

          <div class="route-row">
            <div class="route-code">
              <strong>${order.origin||"---"}</strong>
              <small>Asal</small>
            </div>

            <div class="route-line">
              <i></i>
              <svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg>
              <i></i>
            </div>

            <div class="route-code right">
              <strong>${order.destination||"---"}</strong>
              <small>Tujuan</small>
            </div>
          </div>

          <div class="order-meta">
            <span>${order.airline_name||"Maskapai"}</span>
            <b>•</b>
            <span>${order.flight_number||"—"}</span>
            <b>•</b>
            <span>${dateLabel(order.depart_at)}</span>
            <b>•</b>
            <span>${order.passenger_count||1} pax</span>
          </div>
        </div>

        <div class="order-bottom">
          <div class="price-copy">
            <small>Total perjalanan</small>
            <strong>${rupiah(order.grand_total)}</strong>
          </div>

          <span class="open-order">
            Lihat detail
            <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".order-card").forEach(card=>{
    card.addEventListener("click",()=>{
      location.href=`detail-pesanan.html?id=${encodeURIComponent(card.dataset.code)}`;
    });
  });
}

function openFilter(){
  $("#filterSheet").classList.remove("hidden");
  document.body.style.overflow="hidden";
}

function closeFilter(){
  $("#filterSheet").classList.add("hidden");
  document.body.style.overflow="";
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#newTripBtn")?.addEventListener("click",()=>location.href="home.html");
$("#retryBtn")?.addEventListener("click",()=>location.reload());
$("#refreshBtn")?.addEventListener("click",async()=>{
  try{
    await loadOrders();
    toast("Pesanan diperbarui.");
  }catch(error){
    toast("Gagal memperbarui pesanan.");
  }
});

$("#searchInput")?.addEventListener("input",e=>{
  query=e.target.value;
  render();
});

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    activeStatus=btn.dataset.status;
    render();
  });
});

$("#filterBtn")?.addEventListener("click",openFilter);
$("#closeFilterBtn")?.addEventListener("click",closeFilter);
$("#filterSheet")?.addEventListener("click",e=>{
  if(e.target===$("#filterSheet"))closeFilter();
});

document.querySelectorAll(".filter-option").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".filter-option").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    sortMode=btn.dataset.sort;
  });
});

$("#applyFilterBtn")?.addEventListener("click",()=>{
  render();
  closeFilter();
});

async function init(){
  try{
    if(!await ensureAuth())return;
    await loadOrders();
  }catch(error){
    console.error("[LetsGo Orders]",error);
    $("#loadingState").classList.add("hidden");
    $("#errorState").classList.remove("hidden");
    $("#errorMessage").textContent=error?.message||"Pesanan belum dapat dimuat.";
  }
}

init();
