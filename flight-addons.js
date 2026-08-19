import { supabase } from "./supabase.js";

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

const LOGOS={GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png","8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"};
const NAME_CODES={"garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID","super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP","wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"};

let flight=readJSON("otw_selected_flight");
let passengerData=readJSON("otw_passenger_details");
let search=readJSON("otw_search")||flight?.searchSnapshot||{};
let catalog=[];
let selectedBaggage={};
let selectedInsurance=null;
const previousSelection=readJSON("otw_flight_addons");
if(previousSelection?.airlineCode===airlineCode()){
  selectedInsurance=previousSelection.insurance||null;
}


function readJSON(key){try{return JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||"null")}catch{return null}}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v)||0)}
function hm(v){const m=String(v||"").match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"--:--"}
function dateLabel(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d)}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2200)}
function resolveCode(code,name){const c=String(code||"").toUpperCase();return LOGOS[c]?c:(NAME_CODES[String(name||"").toLowerCase()]||c||"FL")}
function airlineCode(){const seg=flight?.segments?.[0]||{};return resolveCode(seg.carrier||flight?.airlineCode,seg.carrierName||flight?.airlineName)}

function passengers(){
  if(passengerData?.passengers?.length)return passengerData.passengers;
  const n=Math.max(1,Number(search?.passengers?.adult||1));
  return Array.from({length:n},(_,i)=>({fullName:`Penumpang ${i+1}`,label:"Dewasa"}));
}

function renderFlight(){
  if(!flight)return;
  const segs=flight.segments||[],first=segs[0]||{},last=segs[segs.length-1]||first;
  const name=first.carrierName||flight.airlineName||"Maskapai",code=resolveCode(first.carrier||flight.airlineCode,name),logo=LOGOS[code];
  $("#airlineLogo").innerHTML=logo?`<img src="./${logo}?v=20260819" alt="${esc(name)}"><span style="display:none">${esc(code)}</span>`:`<span>${esc(code)}</span>`;
  $("#airlineName").textContent=name;
  $("#flightNumber").textContent=first.flightNumber||flight.flightNumber||"—";
  $("#origin").textContent=first.origin||flight.origin||search.origin||"---";
  $("#destination").textContent=last.destination||flight.destination||search.destination||"---";
  $("#departTime").textContent=hm(first.departureLocalTime||first.departureTime||flight.departureTime);
  $("#arriveTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime||flight.arrivalTime);
  $("#flightDate").textContent=dateLabel(first.departureLocalTime||first.departureTime||flight.departureTime||search.departDate);
  $("#cabinClass").textContent=first.cabinClass||flight.cabin||search.cabinClass||"Ekonomi";
  const baggage=first.baggageAllowance||flight.baggage||"sesuai fare";
  $("#includedBaggage").textContent=`Bagasi ${baggage}`;$("#baseBaggage").textContent=baggage;
}

async function loadCatalog(){
  const code=airlineCode();

  $("#baggageState").classList.remove("hidden");
  $("#insuranceState").classList.remove("hidden");
  $("#baggageEmpty").classList.add("hidden");
  $("#insuranceEmpty").classList.add("hidden");

  try{
    const {data,error}=await supabase.rpc("get_public_addon_catalog",{
      p_airline_code:code
    });

    if(error) throw error;

    catalog=(data||[]).map(item=>({
      ...item,
      selling_price:Number(item.selling_price||0),
      weight_kg:item.weight_kg==null?null:Number(item.weight_kg)
    }));

    console.info("[OTW Add-ons] catalog loaded",code,catalog);

    renderBaggage();
    renderInsurance();

  }catch(error){
    console.error("[OTW Add-ons] public catalog:",error);
    catalog=[];

    $("#baggageState").classList.add("hidden");
    $("#insuranceState").classList.add("hidden");

    $("#baggageEmpty").classList.remove("hidden");
    $("#insuranceEmpty").classList.remove("hidden");

    $("#baggageEmpty").innerHTML=`
      <span>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/></svg>
      </span>
      <strong>Harga bagasi belum dapat dimuat</strong>
      <small>${esc(error?.message||"Periksa konfigurasi Add-on Pricing OTW.")}</small>
      <button type="button" class="retry-addon" id="retryBaggage">Coba lagi</button>
    `;

    $("#insuranceEmpty").innerHTML=`
      <span>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/></svg>
      </span>
      <strong>Harga asuransi belum dapat dimuat</strong>
      <small>${esc(error?.message||"Periksa konfigurasi Add-on Pricing OTW.")}</small>
      <button type="button" class="retry-addon" id="retryInsurance">Coba lagi</button>
    `;

    $("#retryBaggage")?.addEventListener("click",loadCatalog);
    $("#retryInsurance")?.addEventListener("click",loadCatalog);

    toast("Katalog add-on belum dapat dimuat.");
  }
}

const baggageCatalog=()=>catalog.filter(x=>x.addon_type==="BAGGAGE");
const insuranceCatalog=()=>catalog.filter(x=>["INSURANCE","PROTECTION"].includes(x.addon_type));

function renderBaggage(){
  $("#baggageState").classList.add("hidden");

  if(previousSelection?.airlineCode===airlineCode() && Array.isArray(previousSelection?.baggage)){
    selectedBaggage={};
    previousSelection.baggage.forEach(x=>{
      const found=catalog.find(item=>String(item.id)===String(x.addonId));
      if(found) selectedBaggage[String(x.passengerIndex)]=found;
    });
  }
  const options=baggageCatalog(),list=$("#baggagePassengers");
  if(!options.length){
    $("#baggageEmpty").classList.remove("hidden");
    $("#baggageEmpty").innerHTML=`
      <span><svg viewBox="0 0 24 24"><path d="M8 7V5a4 4 0 0 1 8 0v2"/><rect x="4" y="7" width="16" height="13" rx="3"/></svg></span>
      <strong>Belum ada paket bagasi untuk ${esc(airlineCode())}</strong>
      <small>Aktifkan harga bagasi maskapai ini dari Admin Add-on Pricing.</small>
    `;
    list.classList.add("hidden");
    return
  }
  $("#baggageEmpty").classList.add("hidden");list.classList.remove("hidden");list.innerHTML="";
  const template=$("#passengerTemplate");

  passengers().forEach((p,index)=>{
    const frag=template.content.cloneNode(true),card=$(".pax-card",frag),key=String(index);
    $(".pax-avatar",card).textContent=index+1;
    $(".pax-copy strong",card).textContent=p.fullName||`Penumpang ${index+1}`;
    $(".pax-copy small",card).textContent=p.label||p.type||"Penumpang";
    $(".pax-head",card).addEventListener("click",()=>card.classList.toggle("open"));

    const dynamic=$(".dynamic-options",card);
    options.forEach(item=>{
      const b=document.createElement("button");
      b.type="button";b.className="option-card";b.dataset.addonId=item.id;
      b.innerHTML=`<span><strong>${esc(item.addon_name)}</strong><small>${item.weight_kg?`Tambahan ${item.weight_kg} kg`:"Bagasi tambahan"}</small></span><b>${rupiah(item.selling_price)}</b>`;
      dynamic.appendChild(b);
    });

    const existing=selectedBaggage[key];
    if(existing){
      $$("[data-addon-id]",card).forEach(btn=>{
        btn.classList.toggle("active",String(btn.dataset.addonId)===String(existing.id));
      });
      $(".pax-choice",card).textContent=existing.weight_kg?`+${existing.weight_kg} kg`:"Dipilih";
      card.classList.add("selected");
    }
    if(index===0) card.classList.add("open");

    $$("[data-addon-id]",card).forEach(btn=>btn.addEventListener("click",()=>{
      const id=btn.dataset.addonId||null;
      if(!id)delete selectedBaggage[key];
      else{const item=options.find(x=>String(x.id)===String(id));if(item)selectedBaggage[key]=item}
      $$("[data-addon-id]",card).forEach(x=>x.classList.toggle("active",x===btn));
      const chosen=selectedBaggage[key];
      $(".pax-choice",card).textContent=chosen?(chosen.weight_kg?`+${chosen.weight_kg} kg`:"Dipilih"):"Tidak tambah";
      card.classList.toggle("selected",Boolean(chosen));
      updateSummary();
    }));

    list.appendChild(frag);
  });
}

function renderInsurance(){
  $("#insuranceState").classList.add("hidden");
  const options=insuranceCatalog(),box=$("#insuranceOptions");
  if(!options.length){
    $("#insuranceEmpty").classList.remove("hidden");
    $("#insuranceEmpty").innerHTML=`
      <span><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/></svg></span>
      <strong>Asuransi belum diaktifkan</strong>
      <small>Admin OTW dapat mengaktifkan paket global atau paket khusus maskapai.</small>
    `;
    box.classList.add("hidden");
    return
  }
  $("#insuranceEmpty").classList.add("hidden");box.classList.remove("hidden");box.innerHTML="";

  const none=document.createElement("button");
  none.type="button";none.className="insurance-option active";
  none.innerHTML=`<span class="radio"></span><span><strong>Tanpa asuransi</strong><small>Lanjutkan tanpa perlindungan tambahan</small></span><b>Rp0</b>`;
  none.onclick=()=>{selectedInsurance=null;$$(".insurance-option",box).forEach(x=>x.classList.toggle("active",x===none));updateSummary()};
  box.appendChild(none);

  options.forEach(item=>{
    const btn=document.createElement("button");
    btn.type="button";btn.className="insurance-option";
    btn.innerHTML=`<span class="radio"></span><span><strong>${esc(item.addon_name)}</strong><small>Perlindungan perjalanan OTW</small></span><b>${rupiah(item.selling_price)}</b>`;
    btn.onclick=()=>{selectedInsurance=item;$$(".insurance-option",box).forEach(x=>x.classList.toggle("active",x===btn));updateSummary()};
    if(selectedInsurance && String(selectedInsurance.addonId||selectedInsurance.id)===String(item.id)){
      none.classList.remove("active");
      btn.classList.add("active");
      selectedInsurance=item;
    }
    box.appendChild(btn);
  });

  updateSummary();
}

function updateSummary(){
  const baggageItems=Object.values(selectedBaggage);
  const baggageTotal=baggageItems.reduce((s,x)=>s+Number(x.selling_price||0),0);
  const insuranceTotal=Number(selectedInsurance?.selling_price||0);
  const total=baggageTotal+insuranceTotal;

  $("#baggageSummary").textContent=baggageItems.length?`${baggageItems.length} penumpang · total +${baggageItems.reduce((s,x)=>s+Number(x.weight_kg||0),0)} kg`:"Tidak ada";
  $("#baggageTotal").textContent=rupiah(baggageTotal);
  $("#insuranceSummary").textContent=selectedInsurance?selectedInsurance.addon_name:"Tidak dipilih";
  $("#insuranceTotal").textContent=rupiah(insuranceTotal);
  $("#addonGrandTotal").textContent=rupiah(total);
  $("#stickyAddonTotal").textContent=rupiah(total);
}

function resetAll(){selectedBaggage={};selectedInsurance=null;renderBaggage();renderInsurance();updateSummary();toast("Pilihan tambahan direset.")}

function saveAndContinue(){
  const baggage=Object.entries(selectedBaggage).map(([passengerIndex,item])=>({
    passengerIndex:Number(passengerIndex),addonId:item.id,addonCode:item.addon_code,addonName:item.addon_name,weightKg:item.weight_kg,sellingPrice:Number(item.selling_price||0)
  }));
  const insurance=selectedInsurance?{addonId:selectedInsurance.id,addonCode:selectedInsurance.addon_code,addonName:selectedInsurance.addon_name,sellingPrice:Number(selectedInsurance.selling_price||0)}:null;
  const total=baggage.reduce((s,x)=>s+x.sellingPrice,0)+(insurance?.sellingPrice||0);

  sessionStorage.setItem("otw_flight_addons",JSON.stringify({
    airlineCode:airlineCode(),baggage,insurance,total,currency:"IDR",pricingSource:"OTW_ADMIN_CATALOG",selectedAt:new Date().toISOString()
  }));
  location.href="flight-review.html";
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#resetBtn")?.addEventListener("click",resetAll);
$("#continueBtn")?.addEventListener("click",saveAndContinue);
$("#skipBtn")?.addEventListener("click",()=>{selectedBaggage={};selectedInsurance=null;updateSummary();saveAndContinue()});

async function init(){
  const {data}=await supabase.auth.getSession();
  if(!data?.session){location.replace("login.html");return}
  renderFlight();updateSummary();await loadCatalog();
}
init();
