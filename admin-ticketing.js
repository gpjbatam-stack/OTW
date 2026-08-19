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
  const t=currentOrder?resolveTravelData(currentOrder):null;
  $("#travelDocRoute").textContent=`${t?.origin||"---"} → ${t?.destination||"---"}`;
  $("#travelDocReference").textContent=`Booking Reference: ${$("#pnrInput").value.trim()||"—"}`;
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


const AIRPORT_NAMES={
  BTH:"Hang Nadim International Airport",
  CGK:"Soekarno-Hatta International Airport",
  HLP:"Halim Perdanakusuma International Airport",
  DPS:"I Gusti Ngurah Rai International Airport",
  SUB:"Juanda International Airport",
  KNO:"Kualanamu International Airport",
  PKU:"Sultan Syarif Kasim II International Airport",
  PLM:"Sultan Mahmud Badaruddin II International Airport",
  BPN:"Sultan Aji Muhammad Sulaiman Sepinggan Airport",
  UPG:"Sultan Hasanuddin International Airport",
  SOC:"Adi Soemarmo International Airport",
  YIA:"Yogyakarta International Airport",
  JOG:"Adisutjipto Airport",
  SRG:"Jenderal Ahmad Yani International Airport",
  BDJ:"Syamsudin Noor International Airport",
  PNK:"Supadio International Airport",
  PDG:"Minangkabau International Airport",
  MDC:"Sam Ratulangi International Airport",
  DJJ:"Sentani Airport",
  AMQ:"Pattimura Airport"
};

function maskIdentity(value){
  const raw=String(value||"").replace(/\s+/g,"");
  if(!raw||raw==="Onfile")return"On file";
  if(raw.length<=4)return`••${raw}`;
  return`${"•".repeat(Math.min(8,raw.length-4))}${raw.slice(-4)}`;
}

function minutesBetween(a,b){
  const aa=new Date(a||0),bb=new Date(b||0);
  if(Number.isNaN(aa.getTime())||Number.isNaN(bb.getTime()))return 0;
  return Math.max(0,Math.round((bb-aa)/60000));
}

function durationLabel(minutes){
  const m=Number(minutes||0);
  if(!m)return"—";
  const h=Math.floor(m/60),r=m%60;
  return [h?`${h}j`:"",r?`${r}m`:""].filter(Boolean).join(" ");
}

function resolveTravelData(order){
  const payload=order?.payload||{};
  const flight=payload.flight||{};
  const search=flight.searchSnapshot||payload.search||payload.searchSnapshot||{};
  const allSegments=Array.isArray(flight.segments)?flight.segments:[];

  const origin=String(search.origin||allSegments[0]?.origin||flight.origin||order.origin||"---").toUpperCase();

  let destination=String(search.destination||flight.destination||order.destination||"").toUpperCase();
  if(!destination||destination===origin){
    destination=String(allSegments.find(s=>String(s.destination||"").toUpperCase()!==origin)?.destination||"---").toUpperCase();
  }

  let outbound=[];
  for(const seg of allSegments){
    outbound.push(seg);
    if(String(seg.destination||"").toUpperCase()===destination)break;
  }
  if(!outbound.length&&allSegments.length)outbound=[allSegments[0]];

  const first=outbound[0]||{};
  const last=outbound[outbound.length-1]||first;

  const departAt=first.departureLocalTime||first.departureTime||order.depart_at;
  const arriveAt=last.arrivalLocalTime||last.arrivalTime||order.arrival_at;
  const durationMinutes=outbound.reduce((sum,s)=>sum+Number(s.duration||s.durationMinutes||0),0)
    || Number(flight.totalDuration||flight.durationMinutes||0)
    || minutesBetween(departAt,arriveAt);

  const tripRaw=String(search.trip||search.tripType||payload.tripType||"oneway").toLowerCase();
  const tripType=/round|return|pp/.test(tripRaw)?"Pulang-pergi":"Sekali jalan";

  return {payload,flight,search,allSegments,outbound,first,last,origin,destination,departAt,arriveAt,durationMinutes,tripType};
}

function renderQr(orderCode){
  const box=$("#docQr");
  if(!box)return;
  box.innerHTML="";
  const verifyUrl=`${location.origin}${location.pathname.replace(/admin-ticketing\.html$/,"detail-pesanan.html")}?id=${encodeURIComponent(orderCode||"")}`;
  if(window.QRCode){
    new QRCode(box,{
      text:verifyUrl,
      width:48,
      height:48,
      colorDark:"#071d40",
      colorLight:"#ffffff",
      correctLevel:QRCode.CorrectLevel.M
    });
  }else{
    box.textContent="OTW";
  }
}

function fillTravelDoc(){
  if(!currentOrder)return;

  const t=resolveTravelData(currentOrder);
  const payload=t.payload;
  const pd=payload.passengerDetails||{};
  const paxList=Array.isArray(pd.passengers)?pd.passengers:(Array.isArray(payload.passengers)?payload.passengers:[]);
  const ops=buildOps(true);
  const addons=payload.addons||{};
  const baggageItems=Array.isArray(addons.baggage)?addons.baggage:[];
  const insurance=addons.insurance||null;

  const pnr=$("#pnrInput").value.trim().toUpperCase()||ops.pnr||"—";
  const ticketNumber=$("#ticketNumberInput").value.trim()||ops.ticketNumber||"—";
  const airline=currentOrder.airline_name||t.first.carrierName||t.flight.airlineName||"—";
  const flightNo=currentOrder.flight_number||t.first.flightNumber||t.flight.flightNumber||"—";
  const cabin=t.first.cabinClass||t.flight.cabin||t.search.cabin||"Economy";
  const fareClass=t.first.bookingClass||t.first.fareClass||t.first.fareBasis||t.flight.bookingClass||"—";
  const stops=Math.max(0,t.outbound.length-1);
  const routeType=stops?`${stops} transit`:"Direct / Non-stop";

  const originName=t.first.originName||AIRPORT_NAMES[t.origin]||"Airport asal";
  const destinationName=t.last.destinationName||AIRPORT_NAMES[t.destination]||"Airport tujuan";
  const originTerminal=t.first.departureTerminal||t.first.originTerminal||t.first.terminal||"—";
  const destinationTerminal=t.last.arrivalTerminal||t.last.destinationTerminal||"—";

  const cabinBaggage=t.first.cabinBaggage||t.first.carryOn||t.flight.cabinBaggage||"According to booking";
  const checkedBaggage=t.first.baggageAllowance||t.first.checkedBaggage||t.flight.baggage||"According to booking";

  const extraKg=baggageItems.reduce((sum,x)=>sum+Number(x.weightKg||x.weight_kg||0),0);
  const extraBaggage=extraKg?`${extraKg} kg`:baggageItems.length?`${baggageItems.length} add-on`:"Tidak ada";

  $("#docOrderCode").textContent=currentOrder.order_code||"—";
  $("#docPnr").textContent=pnr;
  $("#docPnrSide").textContent=pnr;
  $("#docOrigin").textContent=t.origin;
  $("#docDestination").textContent=t.destination;
  $("#docOriginName").textContent=originName;
  $("#docDestinationName").textContent=destinationName;
  $("#docDepart").textContent=`${dateOnly(t.departAt)} · ${hm(t.departAt)}`;
  $("#docArrival").textContent=`${dateOnly(t.arriveAt)} · ${hm(t.arriveAt)}`;
  $("#docOriginTerminal").textContent=`Terminal ${originTerminal}`;
  $("#docDestinationTerminal").textContent=`Terminal ${destinationTerminal}`;
  $("#docDuration").textContent=durationLabel(t.durationMinutes)||"—";
  $("#docFlightType").textContent=routeType;
  $("#docAirline").textContent=airline;
  $("#docAirlineFact").textContent=airline;
  $("#docFlight").textContent=flightNo;
  $("#docFlightFact").textContent=flightNo;
  $("#docPax").textContent=`${paxList.length||passengerCount(currentOrder)||1} orang`;
  $("#docCabin").textContent=cabin;
  $("#docFareClass").textContent=fareClass;
  $("#docRouteType").textContent=routeType;
  $("#docTicketNumber").textContent=ticketNumber;
  $("#docStatus").textContent=selectedStatus==="ISSUED"?"ISSUED":"READY TO ISSUE";
  $("#docTripType").textContent=t.tripType;
  $("#docCabinBaggage").textContent=String(cabinBaggage);
  $("#docCheckedBaggage").textContent=String(checkedBaggage);
  $("#docExtraBaggage").textContent=extraBaggage;

  const issuedAt=payload.ticketing?.issuedAt||new Date().toISOString();
  $("#docIssuedAt").textContent=dt(issuedAt);

  // Itinerary segments — use all available segments so round-trip / connecting bookings remain complete.
  const segList=$("#docSegmentList");
  const segments=t.allSegments.length?t.allSegments:t.outbound;
  $("#docSegmentCount").textContent=`${segments.length||1} segment`;
  segList.innerHTML=(segments.length?segments:[t.first]).map((seg,index)=>{
    const segOrigin=String(seg.origin||"---").toUpperCase();
    const segDest=String(seg.destination||"---").toUpperCase();
    const dep=seg.departureLocalTime||seg.departureTime||"";
    const arr=seg.arrivalLocalTime||seg.arrivalTime||"";
    const segAirline=seg.carrierName||airline;
    const segFlight=seg.flightNumber||flightNo;
    const segClass=seg.bookingClass||seg.fareClass||seg.cabinClass||fareClass||cabin;
    return `<div class="otwdoc-segment-row">
      <div class="otwdoc-segment-airline">
        <small>SEGMENT ${index+1}</small>
        <strong>${esc(segAirline)}</strong>
        <small>${esc(segFlight)}</small>
      </div>
      <div class="otwdoc-segment-airport">
        <small>DEPART</small>
        <strong>${esc(segOrigin)} · ${esc(hm(dep))}</strong>
        <b>${esc(dateOnly(dep))}</b>
      </div>
      <div class="otwdoc-segment-line"><i></i><span>✈</span><i></i></div>
      <div class="otwdoc-segment-airport">
        <small>ARRIVE</small>
        <strong>${esc(segDest)} · ${esc(hm(arr))}</strong>
        <b>${esc(dateOnly(arr))}</b>
      </div>
      <div class="otwdoc-segment-meta">
        <small>CLASS / FARE</small>
        <strong>${esc(String(segClass||"—"))}</strong>
      </div>
    </div>`;
  }).join("");

  // Passenger list with masked identity.
  const effectivePax=paxList.length?paxList:[pd.primaryPassenger||{}];
  $("#docPassengerCount").textContent=`${effectivePax.length||1} PAX`;
  $("#docPassengerList").innerHTML=effectivePax.map((p,index)=>{
    const name=[p.title,p.fullName||p.full_name||p.name].filter(Boolean).join(" ").trim()||`Penumpang ${index+1}`;
    const type=p.type||p.label||"ADULT";
    const identity=p.identityNumber||p.identity_number||p.documentNumber||p.ktpNumber||"";
    const nationality=p.nationality||"Indonesia";
    const ticketForPax=p.ticketNumber||p.eTicketNumber||ticketNumber;
    return `<div class="otwdoc-passenger-item">
      <span class="otwdoc-pax-index">${index+1}</span>
      <div class="otwdoc-passenger-main">
        <strong>${esc(name.toUpperCase())}</strong>
        <small>${esc(String(type).toUpperCase())} · ${esc(String(cabin).toUpperCase())}</small>
      </div>
      <div class="otwdoc-passenger-data">
        <small>IDENTITY</small>
        <strong>${esc(maskIdentity(identity))}</strong>
      </div>
      <div class="otwdoc-passenger-data">
        <small>NATIONALITY</small>
        <strong>${esc(nationality)}</strong>
      </div>
      <div class="otwdoc-passenger-data">
        <small>E-TICKET</small>
        <strong>${esc(ticketForPax||"—")}</strong>
      </div>
    </div>`;
  }).join("");

  // Dynamic travel services.
  const services=[
    {name:`Cabin baggage · ${cabinBaggage}`,state:"Included",ok:true},
    {name:`Checked baggage · ${checkedBaggage}`,state:"Included",ok:true}
  ];
  if(baggageItems.length)services.push({name:`Extra baggage · ${extraBaggage}`,state:"Selected",ok:true});
  if(insurance)services.push({name:insurance.addonName||insurance.name||"Asuransi perjalanan",state:"Selected",ok:true});
  if(!insurance)services.push({name:"Asuransi perjalanan",state:"Not selected",ok:false});

  $("#docServiceList").innerHTML=services.map(s=>`<div class="${s.ok?"":"none"}">
    <span>${s.ok?"✓":"—"}</span>
    <strong>${esc(s.name)}</strong>
    <em>${esc(s.state)}</em>
  </div>`).join("");

  renderQr(currentOrder.order_code);
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
$("#closeTravelDocBtn").onclick=()=>$("#travelDocModal").classList.add("hidden");$("#modalPrintBtn").onclick=()=>{fillTravelDoc();setTimeout(()=>window.print(),120)};

(async()=>{try{if(!await ensureAdmin())return;await loadOrders()}catch(e){console.error(e);setLoading(false);$("#errorState").classList.remove("hidden");$("#errorText").textContent=e.message||"Gagal memuat ticketing."}})();

$("#modalCloseBtn")?.addEventListener("click",()=>$("#travelDocModal").classList.add("hidden"));

console.info("[OTW] Admin Ticketing V6 Executive Ticket loaded");
