import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

const session=await requireAuth({redirect:"login.html",splash:"index.html"});
if(!session) await new Promise(()=>{});

let documents=[];
let activeFilter="all";
let query="";

function toast(message){
  const el=$("#toast");
  if(!el)return;
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2000);
}

function esc(value=""){
  return String(value).replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function dateLabel(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d);
}

function fileSize(bytes){
  const n=Number(bytes||0);
  if(!n)return"—";
  if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;
  return`${(n/(1024*1024)).toFixed(1)} MB`;
}

function typeLabel(type=""){
  const t=String(type).toUpperCase();
  if(t==="SPT")return"SPT";
  if(["TICKET","ETICKET","E-TICKET"].includes(t))return"E-ticket";
  if(t==="INVOICE")return"Invoice";
  return t||"Dokumen";
}

function renderStats(){
  $("#totalDocuments").textContent=documents.length;
  $("#totalSpt").textContent=documents.filter(x=>String(x.document_type).toUpperCase()==="SPT").length;
  $("#totalOther").textContent=documents.filter(x=>String(x.document_type).toUpperCase()!=="SPT").length;
}

function filtered(){
  return documents.filter(doc=>{
    const type=String(doc.document_type||"").toUpperCase();
    if(activeFilter!=="all"){
      if(activeFilter==="TICKET" && !["TICKET","ETICKET","E-TICKET"].includes(type))return false;
      if(activeFilter!=="TICKET" && type!==activeFilter)return false;
    }
    if(query){
      const hay=[doc.file_name,doc.document_type,doc.status,doc.order_id,doc.order_code].join(" ").toLowerCase();
      if(!hay.includes(query))return false;
    }
    return true;
  });
}

async function openDocument(doc){
  if(!doc.file_path)return toast("File dokumen belum tersedia.");

  const type=String(doc.document_type||"").toUpperCase();
  const explicitBucket=String(doc.storage_bucket||doc.bucket||"").trim();
  const candidates=[];

  if(explicitBucket)candidates.push(explicitBucket);
  if(type==="SPT")candidates.push("spt-documents");
  else if(["TICKET","ETICKET","E-TICKET"].includes(type))candidates.push("flight-tickets","tickets","documents");
  else if(type==="INVOICE")candidates.push("documents","invoices","flight-tickets");
  else candidates.push("documents","spt-documents","flight-tickets","tickets");

  const buckets=[...new Set(candidates.filter(Boolean))];
  try{
    for(const bucket of buckets){
      const {data,error}=await supabase.storage.from(bucket).createSignedUrl(doc.file_path,60);
      if(!error&&data?.signedUrl){
        window.open(data.signedUrl,"_blank","noopener,noreferrer");
        return;
      }
    }
    throw new Error("File dokumen tidak ditemukan pada penyimpanan yang tersedia.");
  }catch(error){
    console.error("[LetsGo Documents Open]",error);
    toast(error?.message||"Dokumen belum dapat dibuka.");
  }
}

function render(){
  const list=$("#documentList");
  const empty=$("#emptyState");
  const searchEmpty=$("#searchEmptyState");
  const data=filtered();

  $("#resultCount").textContent=`${data.length} dokumen`;
  list.innerHTML="";
  list.classList.toggle("hidden",!data.length);
  empty.classList.toggle("hidden",documents.length!==0);
  searchEmpty.classList.toggle("hidden",!(documents.length>0&&data.length===0));

  data.forEach(doc=>{
    const card=document.createElement("article");
    card.className="document-card";
    card.innerHTML=`
      <span class="doc-icon">
        <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>
      </span>
      <div class="doc-main">
        <strong>${esc(doc.file_name||typeLabel(doc.document_type))}</strong>
        <small>${typeLabel(doc.document_type)} · ${dateLabel(doc.uploaded_at||doc.created_at)}</small>
        <div class="doc-meta">
          <span>${esc(doc.status||"tersimpan")}</span>
          <span>${fileSize(doc.file_size)}</span>
        </div>
      </div>
      <div class="doc-actions">
        <button class="open-btn" type="button" data-open="${esc(doc.id||"")}">Buka</button>
        ${doc.order_code?`<button class="order-btn" type="button" data-order="${esc(doc.order_code)}">Pesanan</button>`:""}
      </div>
    `;
    list.appendChild(card);
  });

  $$("[data-open]",list).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const doc=documents.find(x=>String(x.id)===String(btn.dataset.open));
      if(doc)openDocument(doc);
    });
  });

  $$("[data-order]",list).forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.dataset.order;
      if(id)location.href=`detail-pesanan.html?id=${encodeURIComponent(id)}`;
    });
  });
}

async function loadDocuments(){
  $("#loadingState").classList.remove("hidden");
  $("#documentList").classList.add("hidden");
  $("#emptyState").classList.add("hidden");
  $("#searchEmptyState").classList.add("hidden");

  try{
    const {data,error}=await supabase
      .from("trip_documents")
      .select("id,user_id,order_id,document_type,file_name,file_path,file_size,mime_type,status,uploaded_at,created_at")
      .eq("user_id",session.user.id)
      .order("uploaded_at",{ascending:false});

    if(error)throw error;
    documents=data||[];

    const orderIds=[...new Set(documents.map(x=>x.order_id).filter(Boolean))];
    if(orderIds.length){
      const {data:orders,error:ordersError}=await supabase
        .from("flight_orders")
        .select("id,order_code,user_id")
        .eq("user_id",session.user.id)
        .in("id",orderIds);
      if(ordersError)throw ordersError;
      const orderMap=new Map((orders||[]).map(x=>[String(x.id),x.order_code]));
      documents=documents.map(doc=>({...doc,order_code:orderMap.get(String(doc.order_id))||null}));
    }

    renderStats();
    render();
  }catch(error){
    console.error("[LetsGo Documents]",error);
    documents=[];
    renderStats();
    render();
    toast(error?.message||"Dokumen belum dapat dimuat.");
  }finally{
    $("#loadingState").classList.add("hidden");
  }
}

$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():location.href="profile.html");
$("#refreshBtn")?.addEventListener("click",loadDocuments);
$("#ordersBtn")?.addEventListener("click",()=>location.href="orders.html");
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");

$$(".filter-btn,[data-filter].quick-card").forEach(btn=>{
  btn.addEventListener("click",()=>{
    activeFilter=btn.dataset.filter||"all";
    $$(".filter-btn").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeFilter));
    render();
  });
});

const search=$("#documentSearch");
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

loadDocuments();
