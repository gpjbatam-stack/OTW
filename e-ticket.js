import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);
const AIRPORTS={
  BTH:"Hang Nadim International Airport",CGK:"Soekarno-Hatta International Airport",
  HLP:"Halim Perdanakusuma International Airport",DPS:"I Gusti Ngurah Rai International Airport",
  SUB:"Juanda International Airport",KNO:"Kualanamu International Airport",
  PKU:"Sultan Syarif Kasim II International Airport",PLM:"Sultan Mahmud Badaruddin II International Airport",
  BPN:"Sultan Aji Muhammad Sulaiman Sepinggan Airport",UPG:"Sultan Hasanuddin International Airport",
  SOC:"Adi Soemarmo International Airport",YIA:"Yogyakarta International Airport",
  JOG:"Adisutjipto Airport",SRG:"Jenderal Ahmad Yani International Airport",
  BDJ:"Syamsudin Noor International Airport",PNK:"Supadio International Airport",
  PDG:"Minangkabau International Airport",MDC:"Sam Ratulangi International Airport",
  DJJ:"Sentani Airport",AMQ:"Pattimura Airport"
};

let order=null,user=null;
let outboundOfficialRef="",returnOfficialRef="",sharedOfficialRef="";

function esc(v=""){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function dateOnly(v){if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)}
function dateTime(v){if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"}
function durationLabel(m){m=Number(m||0);if(!m)return"—";const h=Math.floor(m/60),r=m%60;return[h?`${h}j`:"",r?`${r}m`:""].filter(Boolean).join(" ")}
function toast(msg){const t=$("#toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
function orderCode(){return new URLSearchParams(location.search).get("id")||""}
function segmentMinutes(seg){
  const explicit=Number(seg?.duration||seg?.durationMinutes||0);
  if(explicit)return explicit;
  const a=new Date(seg?.departureLocalTime||seg?.departureTime||0),b=new Date(seg?.arrivalLocalTime||seg?.arrivalTime||0);
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return 0;
  return Math.max(0,Math.round((b-a)/60000));
}
function legDuration(segments){return segments.reduce((sum,s)=>sum+segmentMinutes(s),0)}
function legStops(segments){return Math.max(0,(segments?.length||1)-1)}
function flightTypeText(segments){const stops=legStops(segments);return stops?`${stops} transit`:"Langsung / Non-stop"}

async function auth(){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  user=data?.session?.user||null;
  if(!user){location.replace(`login.html?next=${encodeURIComponent(`e-ticket.html?id=${orderCode()}`)}`);return false}
  return true;
}

async function load(){
  const id=orderCode();
  if(!id)throw new Error("Nomor pesanan tidak ditemukan.");
  const {data,error}=await supabase.from("flight_orders").select("*").eq("order_code",id).single();
  if(error)throw error;
  order=data;
  if(order.user_id&&order.user_id!==user.id)throw new Error("E-ticket ini bukan milik akun Anda.");
  if(!["ISSUED","COMPLETED","PAID"].includes(String(order.status||"").toUpperCase()))throw new Error("E-ticket belum diterbitkan.");
}

function resolveTrip(){
  const payload=order?.payload||{};
  const flight=payload.flight||{};
  const search=flight.searchSnapshot||payload.search||payload.searchSnapshot||{};
  const all=Array.isArray(flight.segments)?flight.segments:[];

  const origin=String(search.origin||order.origin||all[0]?.origin||flight.origin||"---").toUpperCase();
  let destination=String(search.destination||order.destination||flight.destination||"").toUpperCase();
  if(!destination||destination===origin){
    destination=String(all.find(s=>String(s.destination||"").toUpperCase()!==origin)?.destination||"---").toUpperCase();
  }

  let outbound=[];
  for(const seg of all){
    outbound.push(seg);
    if(String(seg.destination||"").toUpperCase()===destination)break;
  }
  if(!outbound.length&&all.length)outbound=[all[0]];

  let returnSegments=[];
  const returnStart=all.findIndex((seg,idx)=>idx>=outbound.length&&String(seg.origin||"").toUpperCase()===destination);
  if(returnStart>=0){
    for(let i=returnStart;i<all.length;i++){
      returnSegments.push(all[i]);
      if(String(all[i].destination||"").toUpperCase()===origin)break;
    }
  }

  if(!returnSegments.length){
    const directReturn=all.find(seg=>String(seg.origin||"").toUpperCase()===destination&&String(seg.destination||"").toUpperCase()===origin);
    if(directReturn)returnSegments=[directReturn];
  }

  const tripRaw=String(search.trip||search.tripType||payload.tripType||"").toLowerCase();
  const roundtrip=/round|return|pp/.test(tripRaw)||Boolean(search.returnDate)||returnSegments.length>0;

  const first=outbound[0]||{},last=outbound.at(-1)||first;
  const retFirst=returnSegments[0]||{},retLast=returnSegments.at(-1)||retFirst;

  return {payload,flight,search,all,origin,destination,outbound,returnSegments,roundtrip,first,last,retFirst,retLast};
}

function renderLeg({segments,first,last,origin,destination,isReturn=false,pnr,ticketNo}){
  const prefix=isReturn?"return":"";
  const airline=first.carrierName||order.airline_name||"Maskapai";
  const flightNo=first.flightNumber||order.flight_number||"—";
  const depart=first.departureLocalTime||first.departureTime||(isReturn?null:order.depart_at);
  const arrive=last.arrivalLocalTime||last.arrivalTime||(isReturn?null:order.arrival_at);
  const originName=first.originName||AIRPORTS[origin]||"Bandara asal";
  const destinationName=last.destinationName||AIRPORTS[destination]||"Bandara tujuan";

  if(!isReturn){
    $("#flightMain").textContent=`${airline} · ${flightNo}`;
    $("#outboundDateLabel").textContent=`${dateOnly(depart)} · ${hm(depart)}`;
    $("#origin").textContent=origin;$("#destination").textContent=destination;
    $("#originName").textContent=originName;$("#destinationName").textContent=destinationName;
    $("#departAt").textContent=`${dateOnly(depart)} · ${hm(depart)}`;$("#arrivalAt").textContent=`${dateOnly(arrive)} · ${hm(arrive)}`;
    $("#originTerminal").textContent=first.departureTerminal?`Terminal ${first.departureTerminal}`:"Terminal —";
    $("#destinationTerminal").textContent=last.arrivalTerminal?`Terminal ${last.arrivalTerminal}`:"Terminal —";
    $("#duration").textContent=durationLabel(legDuration(segments));
    $("#flightType").textContent=flightTypeText(segments);
    $("#airline").textContent=airline;$("#flightNumber").textContent=flightNo;
    $("#pnr").textContent=pnr;$("#ticketNumber").textContent=ticketNo;
  }else{
    $("#returnFlight").textContent=`${airline} · ${flightNo}`;
    $("#returnDateLabel").textContent=`${dateOnly(depart)} · ${hm(depart)}`;
    $("#returnOrigin").textContent=origin;$("#returnDestination").textContent=destination;
    $("#returnOriginName").textContent=originName;$("#returnDestinationName").textContent=destinationName;
    $("#returnDepart").textContent=`${dateOnly(depart)} · ${hm(depart)}`;$("#returnArrival").textContent=`${dateOnly(arrive)} · ${hm(arrive)}`;
    $("#returnOriginTerminal").textContent=first.departureTerminal?`Terminal ${first.departureTerminal}`:"Terminal —";
    $("#returnDestinationTerminal").textContent=last.arrivalTerminal?`Terminal ${last.arrivalTerminal}`:"Terminal —";
    $("#returnDuration").textContent=durationLabel(legDuration(segments));
    $("#returnFlightType").textContent=flightTypeText(segments);
    $("#returnAirline").textContent=airline;$("#returnFlightNumber").textContent=flightNo;
    $("#returnPnr").textContent=pnr;$("#returnTicketNumber").textContent=ticketNo;
  }
}

function renderPassengers(pax,cabin,outboundTicket,returnTicket,roundtrip){
  const effective=pax.length?pax:[{fullName:"Data penumpang tersimpan",type:"PASSENGER"}];
  $("#paxCount").textContent=`${effective.length||1} PAX`;
  $("#passengerList").innerHTML=effective.map((p,i)=>{
    const name=[p.title,p.fullName||p.full_name||p.name].filter(Boolean).join(" ").trim()||`Penumpang ${i+1}`;
    const type=String(p.label||p.type||p.passenger_type||"ADULT").toUpperCase();
    const outNo=p.ticketNumber||p.eTicketNumber||p.outboundTicketNumber||outboundTicket;
    const retNo=p.returnTicketNumber||p.returnETicketNumber||returnTicket||outNo;
    return `<article class="passenger-card">
      <span class="passenger-no">${i+1}</span>
      <div class="passenger-info">
        <strong>${esc(name.toUpperCase())}</strong>
        <small>${esc(type)} · ${esc(String(cabin||"ECONOMY").toUpperCase())}</small>
        <div class="passenger-tickets">
          <div class="passenger-ticket"><small>TIKET PERGI</small><b>${esc(outNo||"—")}</b></div>
          ${roundtrip?`<div class="passenger-ticket"><small>TIKET PULANG</small><b>${esc(retNo||"—")}</b></div>`:""}
        </div>
      </div>
    </article>`;
  }).join("");
}

function renderOfficialActions(ops,roundtrip){
  outboundOfficialRef=
    ops.outboundOfficialTicketPath||ops.outboundOfficialTicketUrl||
    ops.officialTicketPath||ops.officialTicketUrl||
    ops.official_ticket_path||ops.official_ticket_url||
    order.ticket_url||"";

  returnOfficialRef=ops.returnOfficialTicketPath||ops.returnOfficialTicketUrl||"";
  const shared=Boolean(ops.sharedOfficialTicket);
  sharedOfficialRef=shared?(outboundOfficialRef||returnOfficialRef):"";

  const panel=$("#officialActions");
  const outBtn=$("#officialBtn"),retBtn=$("#returnOfficialBtn"),sharedBtn=$("#sharedOfficialBtn");
  outBtn.classList.add("hidden");retBtn.classList.add("hidden");sharedBtn.classList.add("hidden");

  if(roundtrip&&shared&&sharedOfficialRef){
    panel.classList.remove("hidden");
    sharedBtn.classList.remove("hidden");
    return;
  }
  if(outboundOfficialRef){panel.classList.remove("hidden");outBtn.classList.remove("hidden")}
  if(roundtrip&&returnOfficialRef){panel.classList.remove("hidden");retBtn.classList.remove("hidden")}
  if(!outboundOfficialRef&&!returnOfficialRef)panel.classList.add("hidden");
}

function render(){
  const t=resolveTrip();
  const ops=order.payload?.ticketing||{};
  const pax=order.payload?.passengerDetails?.passengers||order.payload?.passengers||[];
  const addons=order.payload?.addons||{};

  const outboundPnr=ops.pnr||order.pnr||"—";
  const returnPnr=ops.returnPnr||outboundPnr;
  const outboundTicket=ops.outboundTicketNumber||ops.ticketNumber||order.ticket_number||"—";
  const returnTicket=ops.returnTicketNumber||outboundTicket;

  $("#screenOrder").textContent=order.order_code;
  $("#orderCode").textContent=order.order_code;
  $("#tripType").textContent=t.roundtrip?"Pulang-pergi":"Sekali jalan";
  $("#legCountText").textContent=t.roundtrip?"2 penerbangan":"1 penerbangan";

  renderLeg({
    segments:t.outbound,first:t.first,last:t.last,origin:t.origin,destination:t.destination,
    isReturn:false,pnr:outboundPnr,ticketNo:outboundTicket
  });

  if(t.roundtrip&&t.returnSegments.length){
    $("#returnCard").classList.remove("hidden");
    renderLeg({
      segments:t.returnSegments,first:t.retFirst,last:t.retLast,origin:t.destination,destination:t.origin,
      isReturn:true,pnr:returnPnr,ticketNo:returnTicket
    });
  }else{
    $("#returnCard").classList.add("hidden");
  }

  const cabin=t.first.cabinClass||t.flight.cabin||t.search.cabin||"Economy";
  renderPassengers(pax,cabin,outboundTicket,returnTicket,t.roundtrip);

  const baggage=Array.isArray(addons.baggage)?addons.baggage:[];
  const extraKg=baggage.reduce((sum,x)=>sum+Number(x.weightKg||x.weight_kg||0),0);
  $("#checkedBaggage").textContent=t.first.baggageAllowance||t.first.checkedBaggage||t.flight.baggage||"Sesuai ketentuan maskapai";
  $("#extraBaggage").textContent=extraKg?`${extraKg} kg`:baggage.length?`${baggage.length} add-on`:"Tidak ada";
  $("#protection").textContent=addons.insurance?(addons.insurance.addonName||addons.insurance.name||"Dipilih"):"Tidak dipilih";
  $("#issuedAt").textContent=dateTime(ops.issuedAt||ops.travelDocumentGeneratedAt||order.issued_at||order.updated_at);

  renderOfficialActions(ops,t.roundtrip);
}

async function openStorageRef(ref){
  if(!ref)return false;
  const raw=String(ref).trim();
  if(/^https?:\/\//i.test(raw)){window.open(raw,"_blank","noopener,noreferrer");return true}
  const candidates=[raw];
  for(const bucket of ["flight-tickets","tickets","documents"]){
    const prefix=`${bucket}/`;
    if(raw.startsWith(prefix))candidates.push(raw.slice(prefix.length));
  }
  for(const bucket of ["flight-tickets","tickets","documents"]){
    for(const path of [...new Set(candidates)]){
      try{
        const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,600);
        if(!error&&data?.signedUrl){window.open(data.signedUrl,"_blank","noopener,noreferrer");return true}
      }catch{}
    }
  }
  return false;
}

async function share(){
  const url=location.href,title=`LetsGo E-Ticket ${order?.order_code||""}`;
  if(navigator.share){
    try{await navigator.share({title,text:"E-ticket perjalanan LetsGo",url});return}catch(error){
      if(error?.name==="AbortError")return;
    }
  }
  try{await navigator.clipboard.writeText(url);toast("Link e-ticket disalin.")}catch{toast("Tidak dapat membagikan link.")}
}

async function downloadPremiumPdf(){
  const btn=$("#printBtn");
  const original=btn.innerHTML;
  let clone=null;
  try{
    btn.disabled=true;
    btn.querySelector("strong").textContent="Menyiapkan PDF…";
    if(!window.html2canvas||!window.jspdf?.jsPDF)throw new Error("Generator PDF belum siap.");

    const source=$("#ticketDocument");
    clone=source.cloneNode(true);
    clone.id="ticketPdfClone";
    clone.classList.add("pdf-mode");
    Object.assign(clone.style,{
      position:"fixed",left:"-10000px",top:"0",
      width:"430px",maxWidth:"430px",margin:"0",
      borderRadius:"0",boxShadow:"none",background:"#fff",zIndex:"-1"
    });
    document.body.appendChild(clone);

    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    const canvas=await window.html2canvas(clone,{
      scale:2.4,
      backgroundColor:"#ffffff",
      useCORS:true,
      logging:false,
      windowWidth:430,
      width:430
    });

    const pageWidth=108;
    const proportionalHeight=(canvas.height/canvas.width)*pageWidth;
    const pageHeight=Math.max(180,Math.min(650,proportionalHeight));
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:[pageWidth,pageHeight],compress:true});
    const img=canvas.toDataURL("image/jpeg",0.96);
    pdf.addImage(img,"JPEG",0,0,pageWidth,pageHeight,undefined,"FAST");

    const safe=(order?.order_code||orderCode()||"LetsGo-E-Ticket").replace(/[^\w-]+/g,"-");
    pdf.save(`${safe}-E-Ticket.pdf`);
    toast("PDF premium berhasil dibuat.");
  }catch(error){
    console.error("[LetsGo PDF]",error);
    toast(error?.message||"PDF belum dapat dibuat.");
  }finally{
    clone?.remove();
    btn.disabled=false;
    btn.innerHTML=original;
  }
}

$("#backBtn").addEventListener("click",()=>history.length>1?history.back():location.href=`detail-pesanan.html?id=${encodeURIComponent(orderCode())}`);
$("#retryBtn").addEventListener("click",()=>location.reload());
$("#shareBtn").addEventListener("click",share);
$("#shareTopBtn").addEventListener("click",share);
$("#printBtn").addEventListener("click",downloadPremiumPdf);
$("#officialBtn").addEventListener("click",async()=>{if(!await openStorageRef(outboundOfficialRef))toast("E-ticket resmi pergi belum dapat dibuka.")});
$("#returnOfficialBtn").addEventListener("click",async()=>{if(!await openStorageRef(returnOfficialRef))toast("E-ticket resmi pulang belum dapat dibuka.")});
$("#sharedOfficialBtn").addEventListener("click",async()=>{if(!await openStorageRef(sharedOfficialRef))toast("E-ticket resmi PP belum dapat dibuka.")});

(async()=>{
  try{
    if(!await auth())return;
    await load();
    render();
    $("#loadingState").classList.add("hidden");
    $("#ticketArea").classList.remove("hidden");
  }catch(error){
    console.error("[LetsGo E-Ticket]",error);
    $("#loadingState").classList.add("hidden");
    $("#errorState").classList.remove("hidden");
    $("#errorText").textContent=error?.message||"E-ticket belum dapat dibuka.";
  }
})();