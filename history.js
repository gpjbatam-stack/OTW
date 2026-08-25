import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

const $ = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];

const LOGOS = {
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};

const NAME_CODES = {
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};

let orders = [];
let activeFilter = "all";
let query = "";

const session = await requireAuth({ redirect:"login.html", splash:"index.html" });
if(!session) await new Promise(()=>{});

function toast(message){
  const el=$("#toast");
  if(!el) return;
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2000);
}

function rupiah(value){
  return new Intl.NumberFormat("id-ID",{
    style:"currency",currency:"IDR",maximumFractionDigits:0
  }).format(Number(value)||0);
}

function dateLabel(value){
  if(!value) return "—";
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID",{
    day:"numeric",month:"short",year:"numeric"
  }).format(d);
}

function hm(value){
  if(!value) return "--:--";
  const m=String(value).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "--:--";
}

function esc(value=""){
  return String(value).replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function airlineCode(order){
  const direct=String(order.airline_code||"").toUpperCase();
  if(LOGOS[direct]) return direct;
  return NAME_CODES[String(order.airline_name||"").toLowerCase()]||direct||"FL";
}

function normalizeStatus(status=""){
  const s=String(status).toUpperCase();
  if(["COMPLETED","PAID","DONE","FINISHED"].includes(s)) return "completed";
  if(["CANCELLED","CANCELED","REJECTED","VOID"].includes(s)) return "cancelled";
  return "other";
}

function statusLabel(status=""){
  const s=String(status).toUpperCase();
  const type=normalizeStatus(s);
  if(s==="PAID") return "Lunas";
  if(type==="completed") return "Selesai";
  if(type==="cancelled") return "Dibatalkan";
  if(s==="ISSUED") return "Tiket terbit";
  return String(status||"Diproses").replaceAll("_"," ");
}

function isHistory(order){
  return ["completed","cancelled"].includes(normalizeStatus(order.status));
}

function renderSummary(){
  const history=orders.filter(isHistory);
  $("#totalHistory").textContent=history.length;
  $("#totalCompleted").textContent=history.filter(x=>normalizeStatus(x.status)==="completed").length;
  $("#totalCancelled").textContent=history.filter(x=>normalizeStatus(x.status)==="cancelled").length;
}

function filteredOrders(){
  return orders.filter(isHistory).filter(order=>{
    const type=normalizeStatus(order.status);
    if(activeFilter!=="all" && type!==activeFilter) return false;

    if(query){
      const haystack=[
        order.order_code,
        order.origin,
        order.destination,
        order.airline_name,
        order.flight_number,
        order.status
      ].join(" ").toLowerCase();
      if(!haystack.includes(query)) return false;
    }

    return true;
  });
}

function render(){
  const list=$("#historyList");
  const empty=$("#emptyState");
  const searchEmpty=$("#searchEmptyState");
  const data=filteredOrders();

  $("#resultCount").textContent=`${data.length} perjalanan`;

  list.innerHTML="";
  list.classList.toggle("hidden",!data.length);

  const totalHistory=orders.filter(isHistory).length;
  empty.classList.toggle("hidden", totalHistory!==0);
  searchEmpty.classList.toggle("hidden", !(totalHistory>0 && data.length===0));

  data.forEach(order=>{
    const code=airlineCode(order);
    const statusType=normalizeStatus(order.status);
    const card=document.createElement("article");
    card.className="history-card";

    card.innerHTML=`
      <div class="card-head">
        <div class="airline-wrap">
          <div class="airline-logo">
            ${LOGOS[code] ? `<img src="./${LOGOS[code]}" alt="${esc(order.airline_name||code)}">` : `<span>${esc(code)}</span>`}
          </div>
          <div>
            <strong>${esc(order.airline_name||"Maskapai")}</strong>
            <small>${esc(order.flight_number||"—")} · ${esc(order.order_code||"—")}</small>
          </div>
        </div>
        <span class="status ${statusType}">${esc(statusLabel(order.status))}</span>
      </div>

      <div class="route">
        <div class="route-point">
          <strong>${esc(order.origin||"---")}</strong>
          <small>${hm(order.depart_at)}</small>
        </div>
        <div class="route-line">
          <div><i></i><svg viewBox="0 0 24 24"><path d="m3 11 18-7-7 18-3-8-8-3Z"/></svg><i></i></div>
          <small>${dateLabel(order.depart_at)}</small>
        </div>
        <div class="route-point right">
          <strong>${esc(order.destination||"---")}</strong>
          <small>${hm(order.arrival_at)}</small>
        </div>
      </div>

      <div class="card-meta">
        <div>
          <span>Penumpang</span>
          <strong>${Number(order.passenger_count||1)} orang</strong>
        </div>
        <div>
          <span>Total perjalanan</span>
          <strong>${rupiah(order.grand_total||order.flight_total||0)}</strong>
        </div>
        <strong>${esc(order.currency||"IDR")}</strong>
      </div>

      <div class="history-actions">
        <button class="detail-btn" type="button" data-order="${esc(order.order_code||"")}">Lihat detail</button>
      </div>
    `;

    list.appendChild(card);
  });

  $$("[data-order]",list).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.dataset.order;
      if(id) location.href=`detail-pesanan.html?id=${encodeURIComponent(id)}`;
    });
  });
}

async function loadHistory(){
  $("#loadingState").classList.remove("hidden");
  $("#historyList").classList.add("hidden");
  $("#emptyState").classList.add("hidden");
  $("#searchEmptyState").classList.add("hidden");

  try{
    const {data,error}=await supabase
      .from("flight_orders")
      .select("id,order_code,status,origin,destination,airline_code,airline_name,flight_number,depart_at,arrival_at,passenger_count,flight_total,grand_total,currency,created_at")
      .eq("user_id",session.user.id)
      .order("created_at",{ascending:false});

    if(error) throw error;

    orders=data||[];
    renderSummary();
    render();
  }catch(error){
    console.error("[LetsGo History]",error);
    orders=[];
    renderSummary();
    render();
    toast(error?.message||"Riwayat belum dapat dimuat.");
  }finally{
    $("#loadingState").classList.add("hidden");
  }
}

$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():location.href="profile.html");
$("#refreshBtn")?.addEventListener("click",loadHistory);
$("#exploreBtn")?.addEventListener("click",()=>location.href="home.html");
$("#helpBtn")?.addEventListener("click",()=>location.href="help.html");

$$(".filter-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    activeFilter=btn.dataset.filter||"all";
    $$(".filter-btn").forEach(x=>x.classList.toggle("active",x===btn));
    render();
  });
});

const search=$("#historySearch");
const clear=$("#clearSearchBtn");

search?.addEventListener("input",()=>{
  query=search.value.trim().toLowerCase();
  clear.classList.toggle("hidden",!query);
  render();
});

clear?.addEventListener("click",()=>{
  search.value="";
  query="";
  clear.classList.add("hidden");
  render();
  search.focus();
});

$("#resetFilterBtn")?.addEventListener("click",()=>{
  activeFilter="all";
  query="";
  search.value="";
  clear.classList.add("hidden");
  $$(".filter-btn").forEach(x=>x.classList.toggle("active",x.dataset.filter==="all"));
  render();
});

loadHistory();
