import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);
const STATUS_LABEL={SUBMITTED:"Diajukan",PROCESSING:"Processing",VERIFIED:"Verified",ISSUED:"Issued",COMPLETED:"Completed",CANCELLED:"Cancelled"};
const STATUS_CLASS={SUBMITTED:"submitted",PROCESSING:"processing",VERIFIED:"verified",ISSUED:"issued",COMPLETED:"completed",CANCELLED:"cancelled"};
const TICKET_BUCKET="flight-tickets";

let adminUser=null,orders=[],currentOrder=null,selectedStatus="SUBMITTED",officialTicketRef=null,generatedDoc=false;

function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0)}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function dt(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}
function dateOnly(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"—"}
function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}

async function ensureAdmin(){
  const {data,error}=await supabase.auth.getSession(); if(error)throw error;
  adminUser=data?.session?.user;
  if(!adminUser){location.replace("admin-login.html");return false}
  const {data:admin,error:ae}=await supabase.from("app_admins").select("role,is_active").eq("user_id",adminUser.id).eq("is_active",true).maybeSingle();
  if(ae)throw ae;
  if(!admin){location.replace("admin-login.html");return false}
  $("#adminIdentity").textContent=`${adminUser.email} · ${admin.role}`;
  return true;
}

async function loadOrders(){
  setLoading(true);
  const {data,error}=await supabase.from("flight_orders").select("*").order("created_at",{ascending:false});
  if(error)throw error;
  orders=data||[]; updateMetrics(); renderOrders(); setLoading(false);
  $("#syncLabel").textContent=`Sync ${new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`;
}

function setLoading(on){
  $("#loadingState").classList.toggle("hidden",!on);
  if(on){$("#orderList").classList.add("hidden");$("#emptyState").classList.add("hidden");$("#errorState").classList.add("hidden")}
}
function count(s){return orders.filter(o=>String(o.status).toUpperCase()===s).length}
function updateMetrics(){
  $("#metricSubmitted").textContent=count("SUBMITTED");$("#metricProcessing").textContent=count("PROCESSING");$("#metricVerified").textContent=count("VERIFIED");$("#metricIssued").textContent=count("ISSUED");$("#metricCompleted").textContent=count("COMPLETED");
  $("#navQueueCount").textContent=count("SUBMITTED")+count("PROCESSING")+count("VERIFIED");
  const today=orders.filter(o=>new Date(o.created_at).toDateString()===new Date().toDateString());
  $("#todayOrders").textContent=today.length; $("#todayAmount").textContent=rupiah(today.reduce((s,o)=>s+Number(o.grand_total||0),0));
}
function filtered(){
  const q=$("#searchInput").value.trim().toLowerCase(),status=$("#statusFilter").value,sort=$("#sortFilter").value;
  let rows=orders.filter(o=>{
    const ops=o.payload?.ticketing||{};
    const hay=[o.order_code,o.origin,o.destination,o.airline_name,o.flight_number,ops.pnr,ops.ticketNumber].join(" ").toLowerCase();
    return (status==="ALL"||String(o.status).toUpperCase()===status)&&(!q||hay.includes(q));
  });
  if(sort==="OLDEST")rows.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if(sort==="HIGHEST")rows.sort((a,b)=>Number(b.grand_total||0)-Number(a.grand_total||0));
  else if(sort==="DEPARTURE")rows.sort((a,b)=>new Date(a.depart_at||"2999-01-01")-new Date(b.depart_at||"2999-01-01"));
  else rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return rows;
}
function renderOrders(){
  const rows=filtered(),list=$("#orderList"); $("#queueLabel").textContent=`${rows.length} order`;
  if(!rows.length){list.classList.add("hidden");$("#emptyState").classList.remove("hidden");return}
  $("#emptyState").classList.add("hidden");list.classList.remove("hidden");
  list.innerHTML=rows.map(o=>{
    const s=String(o.status||"SUBMITTED").toUpperCase(),ops=o.payload?.ticketing||{};
    const readiness=computeReadiness(o,ops).percent;
    return `<article class="order-card" data-code="${esc(o.order_code)}">
      <div class="order-code"><small>ORDER</small><strong>${esc(o.order_code)}</strong><span>${dt(o.created_at)}</span></div>
      <div class="route-mini"><div><strong>${esc(o.origin||"---")}</strong><small>${hm(o.depart_at)}</small></div><div class="route-bridge"><i></i><svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg><i></i></div><div class="right"><strong>${esc(o.destination||"---")}</strong><small>${dateOnly(o.depart_at)}</small></div></div>
      <div class="cell airline-cell"><small>MASKAPAI</small><strong>${esc(o.airline_name||"—")} · ${esc(o.flight_number||"—")}</strong></div>
      <div class="cell money"><small>TOTAL</small><strong>${rupiah(o.grand_total)}</strong></div>
      <div class="status-wrap"><span class="status-pill ${STATUS_CLASS[s]||"submitted"}"><i></i>${STATUS_LABEL[s]||s}</span><small style="display:block;margin-top:5px;color:#8b9aac;font-size:5.5px">${readiness}% ready</small></div>
      <span class="arrow"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>
    </article>`;
  }).join("");
  list.querySelectorAll(".order-card").forEach(c=>c.onclick=()=>openOrder(c.dataset.code));
}

function sptRef(o){
  return o.spt_url||o.spt_path||o.payload?.passengerDetails?.spt?.publicUrl||o.payload?.passengerDetails?.spt?.url||o.payload?.passengerDetails?.spt?.path||o.payload?.sptUrl||o.payload?.spt_path||"";
}
function passengerCount(o){return o.payload?.passengerDetails?.passengers?.length||o.passenger_count||0}
function computeReadiness(o=currentOrder,ops=buildOps(false)){
  const checks={
    flight:Boolean(o?.origin&&o?.destination&&o?.flight_number&&o?.depart_at),
    passenger:passengerCount(o)>0,
    spt:Boolean(sptRef(o)),
    supplier:Boolean(ops.supplier&&Number(ops.supplierCost)>0),
    pnr:Boolean(ops.pnr),
    ticketNumber:Boolean(ops.ticketNumber),
    officialTicket:Boolean(ops.officialTicketPath||ops.officialTicketUrl)
  };
  const vals=Object.values(checks),ok=vals.filter(Boolean).length;
  return {checks,percent:Math.round(ok/vals.length*100),ready:ok===vals.length};
}

function openOrder(code){
  currentOrder=orders.find(o=>o.order_code===code); if(!currentOrder)return;
  const ops=currentOrder.payload?.ticketing||{};
  selectedStatus=String(currentOrder.status||"SUBMITTED").toUpperCase();
  officialTicketRef=ops.officialTicketPath||ops.officialTicketUrl||currentOrder.ticket_url||"";
  generatedDoc=Boolean(ops.travelDocumentGeneratedAt);

  $("#drawerCode").textContent=currentOrder.order_code;$("#drawerCreated").textContent=`Diajukan ${dt(currentOrder.created_at)}`;
  $("#drawerStatusText").textContent=STATUS_LABEL[selectedStatus]||selectedStatus;$("#drawerStatusBadge").className=`status-pill ${STATUS_CLASS[selectedStatus]||"submitted"}`;$("#drawerStatusBadge").innerHTML=`<i></i>${STATUS_LABEL[selectedStatus]||selectedStatus}`;
  $("#airlineCodeBadge").textContent=String(currentOrder.airline_code||"FL").toUpperCase();$("#drawerAirline").textContent=currentOrder.airline_name||"Maskapai";$("#drawerFlightNo").textContent=currentOrder.flight_number||"—";$("#drawerDepartureDate").textContent=dateOnly(currentOrder.depart_at);
  $("#drawerOrigin").textContent=currentOrder.origin||"---";$("#drawerDestination").textContent=currentOrder.destination||"---";$("#drawerDepartTime").textContent=hm(currentOrder.depart_at);$("#drawerArrivalTime").textContent=hm(currentOrder.arrival_at);
  $("#drawerPax").textContent=`${passengerCount(currentOrder)||1} orang`;$("#drawerTotal").textContent=rupiah(currentOrder.grand_total);
  const addons=currentOrder.payload?.addons||{},bags=Array.isArray(addons.baggage)?addons.baggage.length:0;$("#drawerAddon").textContent=bags||addons.insurance?`${bags} bagasi${addons.insurance?" + asuransi":""}`:"Tidak ada";
  $("#drawerSptState").textContent=sptRef(currentOrder)?"Tersimpan":"Belum ada";$("#viewSptBtn").disabled=!sptRef(currentOrder);

  $("#supplierInput").value=ops.supplier||"";$("#supplierCostInput").value=ops.supplierCost||"";$("#pnrInput").value=ops.pnr||"";$("#ticketNumberInput").value=ops.ticketNumber||"";$("#internalNoteInput").value=ops.internalNote||"";$("#customerNoteInput").value=currentOrder.admin_notes||"";
  syncOfficialTicketUI();syncMargin();syncTravelDoc();syncStatusFlow();syncReadiness();
  $("#drawerBackdrop").classList.remove("hidden");document.body.style.overflow="hidden";
}
function closeDrawer(){$("#drawerBackdrop").classList.add("hidden");document.body.style.overflow="";currentOrder=null}

function buildOps(fromForm=true){
  const old=currentOrder?.payload?.ticketing||{};
  if(!fromForm)return old;
  return {...old,supplier:$("#supplierInput").value.trim(),supplierCost:Number($("#supplierCostInput").value||0),pnr:$("#pnrInput").value.trim().toUpperCase(),ticketNumber:$("#ticketNumberInput").value.trim(),officialTicketPath:officialTicketRef&&!/^https?:/i.test(officialTicketRef)?officialTicketRef:(old.officialTicketPath||""),officialTicketUrl:/^https?:/i.test(officialTicketRef)?officialTicketRef:(old.officialTicketUrl||""),internalNote:$("#internalNoteInput").value.trim(),travelDocumentGeneratedAt:generatedDoc?(old.travelDocumentGeneratedAt||new Date().toISOString()):null,updatedAt:new Date().toISOString()};
}
function buildPayload(){return {...(currentOrder.payload||{}),ticketing:buildOps(true)}}

function syncMargin(){
  const customer=Number(currentOrder?.grand_total||0),supplier=Number($("#supplierCostInput").value||0);
  $("#customerAmount").textContent=rupiah(customer);$("#supplierAmount").textContent=rupiah(supplier);$("#marginAmount").textContent=rupiah(customer-supplier);
}
function syncStatusFlow(){document.querySelectorAll("#statusFlow button").forEach(b=>b.classList.toggle("active",b.dataset.status===selectedStatus))}
function syncReadiness(){
  const r=computeReadiness(currentOrder,buildOps(true));$("#readinessPercent").textContent=`${r.percent}%`;$("#readinessBar").style.width=`${r.percent}%`;
  Object.entries(r.checks).forEach(([k,v])=>document.querySelector(`[data-check="${k}"]`)?.classList.toggle("ok",v));
  $("#issueBtn").disabled=!r.ready;$("#issueBtn").style.opacity=r.ready?"1":".45";
  return r;
}
function syncTravelDoc(){
  $("#travelDocRoute").textContent=`${currentOrder?.origin||"---"} → ${currentOrder?.destination||"---"}`;$("#travelDocReference").textContent=`Booking Reference: ${$("#pnrInput").value.trim()||"—"}`;
  $("#printTravelDocBtn").disabled=!generatedDoc;
}
function syncOfficialTicketUI(){
  const has=Boolean(officialTicketRef);$("#officialTicketName").textContent=has?"Official e-ticket tersimpan":"Belum ada e-ticket resmi";$("#officialTicketMeta").textContent=has?(officialTicketRef.split("/").pop()||"Dokumen supplier"):"Upload PDF/JPG/PNG dari supplier atau maskapai.";$("#openOfficialTicketBtn").disabled=!has;$("#removeOfficialTicketBtn").disabled=!has;
}
async function openStorageRef(ref,buckets=[TICKET_BUCKET,"tickets","documents"]){
  if(!ref)return false;if(/^https?:\/\//i.test(ref)){window.open(ref,"_blank","noopener,noreferrer");return true}
  for(const bucket of [...new Set(buckets)]){try{const {data,error}=await supabase.storage.from(bucket).createSignedUrl(ref,600);if(!error&&data?.signedUrl){window.open(data.signedUrl,"_blank","noopener,noreferrer");return true}}catch{}}
  return false;
}
async function openSpt(){if(!await openStorageRef(sptRef(currentOrder),[currentOrder.payload?.passengerDetails?.spt?.bucket,"spt","documents","flight-documents"].filter(Boolean)))toast("SPT ditemukan, tetapi bucket Storage belum cocok.")}
async function uploadOfficialTicket(file){
  if(!currentOrder||!file)return;
  const ext=(file.name.split(".").pop()||"pdf").toLowerCase(),safe=`${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`,path=`${currentOrder.user_id}/${currentOrder.order_code}/${safe}`;
  $("#officialTicketName").textContent="Mengupload e-ticket…";
  const {error}=await supabase.storage.from(TICKET_BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});if(error)throw error;
  officialTicketRef=path;syncOfficialTicketUI();syncReadiness();toast("E-ticket resmi berhasil di-upload.");
}

function fillTravelDoc(){
  $("#docOrderCode").textContent=currentOrder.order_code;$("#docPnr").textContent=$("#pnrInput").value.trim()||"—";$("#docOrigin").textContent=currentOrder.origin||"---";$("#docDestination").textContent=currentOrder.destination||"---";$("#docDepart").textContent=`${dateOnly(currentOrder.depart_at)} · ${hm(currentOrder.depart_at)}`;$("#docArrival").textContent=hm(currentOrder.arrival_at);$("#docAirline").textContent=currentOrder.airline_name||"—";$("#docFlight").textContent=currentOrder.flight_number||"—";$("#docPax").textContent=`${passengerCount(currentOrder)||1} orang`;$("#docTicketNumber").textContent=$("#ticketNumberInput").value.trim()||"—";
  const p=currentOrder?.payload||{};
  const pd=p.passengerDetails||p.passengers||{};
  const first=Array.isArray(pd)?pd[0]:(pd.passengers?.[0]||pd.adults?.[0]||pd.primaryPassenger||pd);
  const passengerName=[first?.title,first?.full_name||first?.fullName||first?.name].filter(Boolean).join(" ").trim();
  $("#docPassengerName").textContent=passengerName||currentOrder?.passenger_name||"Passenger";
  const baggage=p?.addons?.baggage?.label||p?.addons?.baggage||p?.selectedAddons?.baggage||p?.flight?.baggage;
  $("#docBaggage").textContent=typeof baggage==="string"?baggage:(baggage?.label||"According to booking");
}
function previewTravelDoc(){fillTravelDoc();$("#travelDocModal").classList.remove("hidden")}
function generateTravelDoc(){const r=syncReadiness();if(!r.ready){toast("Lengkapi seluruh Issue Readiness terlebih dahulu.");return}generatedDoc=true;syncTravelDoc();previewTravelDoc();toast("OTW Travel Document siap dicetak.");}

async function saveOrder({status=selectedStatus,close=true}={}){
  const payload=buildPayload();const patch={payload,admin_notes:$("#customerNoteInput").value.trim(),status};
  const {error}=await supabase.from("flight_orders").update(patch).eq("id",currentOrder.id);if(error)throw error;
  toast("Data ticketing berhasil disimpan.");if(close)closeDrawer();await loadOrders();
}
async function issueOrder(){
  const r=syncReadiness();if(!r.ready){toast("Belum siap issue. Lengkapi checklist terlebih dahulu.");return}
  if(!generatedDoc)generateTravelDoc();
  selectedStatus="ISSUED";
  const payload=buildPayload();payload.ticketing={...payload.ticketing,issuedAt:new Date().toISOString(),travelDocumentGeneratedAt:payload.ticketing.travelDocumentGeneratedAt||new Date().toISOString()};
  const {error}=await supabase.from("flight_orders").update({status:"ISSUED",payload,admin_notes:$("#customerNoteInput").value.trim()}).eq("id",currentOrder.id);if(error)throw error;
  toast("Tiket berhasil di-issue.");$("#travelDocModal").classList.add("hidden");closeDrawer();await loadOrders();
}
async function cancelOrder(){const {error}=await supabase.from("flight_orders").update({status:"CANCELLED",payload:buildPayload(),admin_notes:$("#customerNoteInput").value.trim()}).eq("id",currentOrder.id);if(error)throw error;$("#cancelModal").classList.add("hidden");toast("Pesanan dibatalkan.");closeDrawer();await loadOrders()}

$("#searchInput").oninput=renderOrders;$("#statusFilter").onchange=renderOrders;$("#sortFilter").onchange=renderOrders;
$("#refreshBtn").onclick=()=>loadOrders().then(()=>toast("Ticketing diperbarui."));$("#mobileRefreshBtn").onclick=$("#refreshBtn").onclick;$("#retryBtn").onclick=()=>location.reload();
$("#focusNewBtn").onclick=()=>{$("#statusFilter").value="SUBMITTED";$("#sortFilter").value="NEWEST";renderOrders()};
$("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open");$("#logoutBtn").onclick=async()=>{await supabase.auth.signOut();location.replace("admin-login.html")};
$("#closeDrawerBtn").onclick=closeDrawer;$("#drawerBackdrop").onclick=e=>{if(e.target===$("#drawerBackdrop"))closeDrawer()};
$("#viewSptBtn").onclick=()=>openSpt().catch(e=>toast(e.message));$("#openCustomerBtn").onclick=()=>currentOrder&&window.open(`detail-pesanan.html?id=${encodeURIComponent(currentOrder.order_code)}`,"_blank");
$("#supplierCostInput").oninput=()=>{syncMargin();syncReadiness()};["supplierInput","pnrInput","ticketNumberInput"].forEach(id=>$("#"+id).oninput=()=>{syncReadiness();syncTravelDoc()});
$("#officialTicketInput").onchange=e=>uploadOfficialTicket(e.target.files?.[0]).catch(err=>toast(err.message));
$("#openOfficialTicketBtn").onclick=()=>openStorageRef(officialTicketRef).then(ok=>!ok&&toast("Dokumen belum dapat dibuka."));
$("#removeOfficialTicketBtn").onclick=()=>{officialTicketRef=null;syncOfficialTicketUI();syncReadiness();toast("Referensi e-ticket dihapus dari draft.")};
document.querySelectorAll("#statusFlow button").forEach(b=>b.onclick=()=>{selectedStatus=b.dataset.status;syncStatusFlow()});
$("#saveDraftBtn").onclick=()=>saveOrder({status:String(currentOrder.status||"SUBMITTED").toUpperCase()}).catch(e=>toast(e.message));
$("#saveStatusBtn").onclick=()=>saveOrder().catch(e=>toast(e.message));$("#issueBtn").onclick=()=>issueOrder().catch(e=>toast(e.message));
$("#cancelBtn").onclick=()=>$("#cancelModal").classList.remove("hidden");$("#closeCancelBtn").onclick=()=>$("#cancelModal").classList.add("hidden");$("#confirmCancelBtn").onclick=()=>cancelOrder().catch(e=>toast(e.message));
$("#previewTravelDocBtn").onclick=previewTravelDoc;$("#generateTravelDocBtn").onclick=generateTravelDoc;$("#printTravelDocBtn").onclick=()=>{previewTravelDoc();setTimeout(()=>window.print(),180)};
$("#closeTravelDocBtn").onclick=()=>$("#travelDocModal").classList.add("hidden");$("#modalPrintBtn").onclick=()=>window.print();

(async()=>{try{if(!await ensureAdmin())return;await loadOrders()}catch(e){console.error(e);setLoading(false);$("#errorState").classList.remove("hidden");$("#errorText").textContent=e.message||"Gagal memuat ticketing."}})();

$("#modalCloseBtn")?.addEventListener("click",()=>$("#travelDocModal").classList.add("hidden"));
