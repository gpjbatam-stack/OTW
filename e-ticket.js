import { supabase } from "./supabase.js";

const $=s=>document.querySelector(s);
const AIRPORTS={
  BTH:"Hang Nadim International Airport",CGK:"Soekarno-Hatta International Airport",
  HLP:"Halim Perdanakusuma International Airport",DPS:"I Gusti Ngurah Rai International Airport",
  SUB:"Juanda International Airport",KNO:"Kualanamu International Airport",
  PKU:"Sultan Syarif Kasim II International Airport",PLM:"Sultan Mahmud Badaruddin II International Airport",
  BPN:"Sultan Aji Muhammad Sulaiman Sepinggan Airport",UPG:"Sultan Hasanuddin International Airport",
  SOC:"Adi Soemarmo International Airport",YIA:"Yogyakarta International Airport"
};
let order=null,user=null,officialRef="";

function esc(v=""){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function dateLabel(v){if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d)}
function dateTime(v){if(!v)return"—";const d=new Date(v);if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"}
function dur(m){m=Number(m||0);return m?`${Math.floor(m/60)}j ${m%60}m`:"—"}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
function code(){return new URLSearchParams(location.search).get("id")||""}

async function auth(){
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  user=data?.session?.user||null;
  if(!user){location.replace("login.html");return false}
  return true;
}
async function load(){
  const id=code();if(!id)throw new Error("Nomor pesanan tidak ditemukan.");
  const {data,error}=await supabase.from("flight_orders").select("*").eq("order_code",id).single();
  if(error)throw error;
  order=data;
  if(order.user_id && order.user_id!==user.id)throw new Error("E-ticket ini bukan milik akun Anda.");
  if(!["ISSUED","COMPLETED","PAID"].includes(String(order.status||"").toUpperCase()))throw new Error("E-ticket belum diterbitkan.");
}

function resolve(){
  const payload=order.payload||{},flight=payload.flight||{},segs=Array.isArray(flight.segments)?flight.segments:[],first=segs[0]||{},search=flight.searchSnapshot||payload.search||{};
  const origin=String(search.origin||first.origin||flight.origin||order.origin||"---").toUpperCase();
  let destination=String(search.destination||flight.destination||order.destination||"").toUpperCase();
  if(!destination||destination===origin)destination=String(segs.find(s=>String(s.destination||"").toUpperCase()!==origin)?.destination||"---").toUpperCase();
  let out=[];
  for(const s of segs){out.push(s);if(String(s.destination||"").toUpperCase()===destination)break}
  if(!out.length&&first)out=[first];
  const last=out[out.length-1]||first;
  const depart=first.departureLocalTime||first.departureTime||order.depart_at;
  const arrive=last.arrivalLocalTime||last.arrivalTime||order.arrival_at;
  const duration=Number(flight.totalDuration||flight.durationMinutes||first.duration||0);
  const airline=first.carrierName||flight.airlineName||order.airline_name||"Maskapai";
  const flightNo=first.flightNumber||flight.flightNumber||order.flight_number||"—";
  const cabin=first.cabinClass||flight.cabin||"Economy";
  const trip=String(search.trip||"").toLowerCase()==="roundtrip"?"Pulang-pergi":"Sekali jalan";
  return {payload,flight,segs,first,last,origin,destination,depart,arrive,duration,airline,flightNo,cabin,trip};
}
function render(){
  const t=resolve(),ops=order.payload?.ticketing||{},pax=order.payload?.passengerDetails?.passengers||[],addons=order.payload?.addons||{};
  const pnr=ops.pnr||order.pnr||"—",ticketNo=ops.ticketNumber||order.ticket_number||"—";
  $("#screenOrder").textContent=order.order_code;$("#orderCode").textContent=order.order_code;$("#pnr").textContent=pnr;$("#ticketNumber").textContent=ticketNo;
  $("#origin").textContent=t.origin;$("#destination").textContent=t.destination;$("#originName").textContent=t.first.originName||AIRPORTS[t.origin]||"Bandara asal";$("#destinationName").textContent=t.last.destinationName||AIRPORTS[t.destination]||"Bandara tujuan";
  $("#departAt").textContent=`${dateLabel(t.depart)} · ${hm(t.depart)}`;$("#arrivalAt").textContent=`${dateLabel(t.arrive)} · ${hm(t.arrive)}`;
  $("#originTerminal").textContent=t.first.departureTerminal?`Terminal ${t.first.departureTerminal}`:"Terminal —";$("#destinationTerminal").textContent=t.last.arrivalTerminal?`Terminal ${t.last.arrivalTerminal}`:"Terminal —";
  $("#duration").textContent=dur(t.duration);$("#flightMain").textContent=`${t.airline} · ${t.flightNo}`;$("#flightType").textContent=t.segs.length>1?`${Math.max(0,t.segs.length-1)} transit`:"Direct / Non-stop";
  $("#airline").textContent=t.airline;$("#flightNumber").textContent=t.flightNo;$("#cabin").textContent=t.cabin;$("#tripType").textContent=t.trip;

  const returnSeg=t.segs.find(s=>String(s.origin||"").toUpperCase()===t.destination&&String(s.destination||"").toUpperCase()===t.origin);
  if(returnSeg){$("#returnCard").classList.remove("hidden");$("#returnFlight").textContent=`${returnSeg.carrierName||t.airline} · ${returnSeg.flightNumber||"—"}`;$("#returnOrigin").textContent=returnSeg.origin;$("#returnDestination").textContent=returnSeg.destination;$("#returnDepart").textContent=`${dateLabel(returnSeg.departureLocalTime||returnSeg.departureTime)} · ${hm(returnSeg.departureLocalTime||returnSeg.departureTime)}`;$("#returnArrival").textContent=`${dateLabel(returnSeg.arrivalLocalTime||returnSeg.arrivalTime)} · ${hm(returnSeg.arrivalLocalTime||returnSeg.arrivalTime)}`}

  const effective=pax.length?pax:[{fullName:"Data penumpang tersimpan",type:"PASSENGER"}];$("#paxCount").textContent=`${effective.length||1} PAX`;
  $("#passengerList").innerHTML=effective.map((p,i)=>`<div class="passenger"><span>${i+1}</span><div><strong>${esc([p.title,p.fullName].filter(Boolean).join(" ")||`Penumpang ${i+1}`)}</strong><small>${esc(String(p.label||p.type||"ADULT").toUpperCase())} · ${esc(String(t.cabin).toUpperCase())}</small></div><b>${esc(p.ticketNumber||p.eTicketNumber||ticketNo)}</b></div>`).join("");

  const baggage=Array.isArray(addons.baggage)?addons.baggage:[],extraKg=baggage.reduce((s,x)=>s+Number(x.weightKg||x.weight_kg||0),0);
  $("#checkedBaggage").textContent=t.first.baggageAllowance||t.flight.baggage||"Sesuai ketentuan maskapai";$("#extraBaggage").textContent=extraKg?`${extraKg} kg`:"Tidak ada";$("#protection").textContent=addons.insurance?(addons.insurance.addonName||addons.insurance.name||"Dipilih"):"Tidak dipilih";
  $("#issuedAt").textContent=dateTime(ops.issuedAt||ops.travelDocumentGeneratedAt||order.updated_at);

  officialRef=
    ops.officialTicketPath||
    ops.officialTicketUrl||
    ops.official_ticket_path||
    ops.official_ticket_url||
    order.ticket_url||
    "";
  $("#officialBtn").classList.toggle("hidden",!officialRef);
}
async function openOfficial(){
  if(!officialRef)return;

  const raw=String(officialRef).trim();
  if(/^https?:\/\//i.test(raw)){
    window.open(raw,"_blank","noopener,noreferrer");
    return;
  }

  // Accept either a plain object path or a value accidentally stored with
  // the bucket prefix (flight-tickets/user/order/file.pdf).
  const candidates=[raw];
  for(const bucket of ["flight-tickets","tickets","documents"]){
    const prefix=`${bucket}/`;
    if(raw.startsWith(prefix))candidates.push(raw.slice(prefix.length));
  }

  for(const bucket of ["flight-tickets","tickets","documents"]){
    for(const path of [...new Set(candidates)]){
      try{
        const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,600);
        if(!error&&data?.signedUrl){
          window.open(data.signedUrl,"_blank","noopener,noreferrer");
          return;
        }
      }catch{}
    }
  }
  toast("E-ticket resmi belum dapat dibuka.");
}

async function downloadPremiumPdf(){
  const btn=$("#printBtn"),old=btn?.innerHTML||"";
  if(btn){btn.disabled=true;btn.textContent="Menyiapkan PDF…";}
  let clone=null;
  try{
    const ticket=$("#printTicket");
    if(!ticket)throw new Error("Dokumen tiket tidak ditemukan.");
    if(!window.html2canvas||!window.jspdf?.jsPDF)throw new Error("Generator PDF belum siap.");
    document.body.classList.add("pdf-capture");
    clone=ticket.cloneNode(true);
    clone.id="printTicketPdfClone";
    Object.assign(clone.style,{position:"fixed",left:"-10000px",top:"0",width:"760px",maxWidth:"760px",margin:"0",zIndex:"-1",background:"#fff"});
    document.body.appendChild(clone);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const canvas=await window.html2canvas(clone,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false,windowWidth:760});
    const pageWidthMm=108;
    const pageHeightMm=Math.max(160,Math.min(500,(canvas.height/canvas.width)*pageWidthMm));
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:[pageWidthMm,pageHeightMm],compress:true,hotfixes:["px_scaling"]});
    const img=canvas.toDataURL("image/jpeg",0.94);
    pdf.addImage(img,"JPEG",0,0,pageWidthMm,pageHeightMm,undefined,"FAST");
    const safe=(order?.order_code||code()||"LetsGo-E-Ticket").replace(/[^\w-]+/g,"-");
    pdf.save(`${safe}-E-Ticket.pdf`);
    toast("PDF premium berhasil dibuat.");
  }catch(error){
    console.error("[LetsGo PDF]",error);
    toast(error?.message||"PDF belum dapat dibuat.");
  }finally{
    clone?.remove();
    document.body.classList.remove("pdf-capture");
    if(btn){btn.disabled=false;btn.innerHTML=old;}
  }
}

async function share(){
  const url=location.href,title=`LetsGo E-Ticket ${order?.order_code||""}`;
  if(navigator.share){try{await navigator.share({title,text:"E-ticket perjalanan LetsGo",url});return}catch{}}
  try{await navigator.clipboard.writeText(url);toast("Link e-ticket disalin.")}catch{toast("Tidak dapat membagikan link.")}
}

$("#backBtn").onclick=()=>history.length>1?history.back():location.href=`detail-pesanan.html?id=${encodeURIComponent(code())}`;
$("#retryBtn").onclick=()=>location.reload();
$("#printBtn").onclick=()=>downloadPremiumPdf();$("#shareBtn").onclick=share;$("#shareTopBtn").onclick=share;$("#officialBtn").onclick=()=>openOfficial().catch(e=>toast(e.message));

(async()=>{try{if(!await auth())return;await load();render();$("#loadingState").classList.add("hidden");$("#ticketArea").classList.remove("hidden")}catch(e){console.error(e);$("#loadingState").classList.add("hidden");$("#errorState").classList.remove("hidden");$("#errorText").textContent=e.message||"E-ticket belum dapat dibuka."}})();
