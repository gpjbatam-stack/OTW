import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

"use strict";

const SPT_BUCKET="spt-documents";
const MAX_SPT_BYTES=5*1024*1024;
const PRIMARY_PREFIX="letsgo_";
const LEGACY_PREFIX=String.fromCharCode(111,116,119)+"_";

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];

let selectedFlight=readState("selected_flight");
let flightPricing=readState("flight_pricing")||selectedFlight?.letsgoPricing||null;
let search=readState("search")||selectedFlight?.searchSnapshot||{};
let passengerModels=[];
let sptFile=null;
let uploadedSptRecord=readState("uploaded_spt")||null;
let isUploading=false;
let isSubmitting=false;
let session=null;

const LOGOS={
  GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
  "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
};
const NAME_CODES={
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
};

function readState(name){
  for(const key of [PRIMARY_PREFIX+name,LEGACY_PREFIX+name]){
    try{
      const raw=sessionStorage.getItem(key)||localStorage.getItem(key);
      if(raw) return JSON.parse(raw);
    }catch{}
  }
  return null;
}
function writeState(name,value){
  sessionStorage.setItem(PRIMARY_PREFIX+name,JSON.stringify(value));
}
function removeState(name){
  sessionStorage.removeItem(PRIMARY_PREFIX+name);
  sessionStorage.removeItem(LEGACY_PREFIX+name);
}
function readTextState(name){
  return sessionStorage.getItem(PRIMARY_PREFIX+name)
    || sessionStorage.getItem(LEGACY_PREFIX+name)
    || "";
}
function esc(v=""){
  return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
function toast(message){
  const el=$("#toast");if(!el)return;
  el.textContent=message;el.classList.add("show");
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2400);
}
function hm(v){
  const m=String(v||"").match(/T(\d{2}):(\d{2})/);
  return m?`${m[1]}:${m[2]}`:"--:--";
}
function dateLabel(v){
  if(!v)return"—";
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d);
}
function resolveCode(code,name){
  const c=String(code||"").toUpperCase();
  return LOGOS[c]?c:(NAME_CODES[String(name||"").toLowerCase()]||c||"FL");
}
function logoHTML(code,name){
  const c=resolveCode(code,name),src=LOGOS[c];
  return src
    ?`<img src="./${src}?v=20260824" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span style="display:none">${esc(c)}</span>`
    :`<span>${esc(c)}</span>`;
}
function renderFlightSummary(){
  if(!selectedFlight)return;
  const segments=selectedFlight.segments||[],first=segments[0]||{},last=segments.at(-1)||first;
  const name=first.carrierName||selectedFlight.airlineName||"Maskapai";
  const code=first.carrier||selectedFlight.airlineCode||"";
  const cabin=first.cabinClass||selectedFlight.cabin||search.cabin||"Ekonomi";

  $("#airlineLogo").innerHTML=logoHTML(code,name);
  $("#airlineName").textContent=name;
  $("#flightCode").textContent=`${first.flightNumber||selectedFlight.flightNumber||"—"} · ${cabin}`;
  $("#originCode").textContent=first.origin||selectedFlight.origin||search.origin||"---";
  $("#destinationCode").textContent=last.destination||selectedFlight.destination||search.destination||"---";
  $("#departureTime").textContent=hm(first.departureLocalTime||first.departureTime||selectedFlight.departureTime);
  $("#arrivalTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime||selectedFlight.arrivalTime);
  $("#flightDate").textContent=dateLabel(first.departureLocalTime||first.departureTime||selectedFlight.departureTime||search.departDate);
  $("#cabinClass").textContent=cabin;
  $("#baggage").textContent=`Bagasi ${first.baggageAllowance||selectedFlight.baggage||"sesuai fare"}`;
}
function passengerCounts(){
  return {
    adults:Math.max(1,Number(search?.passengers?.adult??search.adults??1)),
    children:Math.max(0,Number(search?.passengers?.child??search.children??0)),
    infants:Math.max(0,Number(search?.passengers?.infant??search.infants??0))
  };
}
function makePassenger(index,type,label){
  return {index,type,label,title:"",fullName:"",identityType:"KTP",identityNumber:"",birthDate:"",gender:"",passportCountry:"",passportExpiry:""};
}
function buildPassengerModels(){
  const saved=readState("passenger_details");
  if(saved?.passengers?.length){passengerModels=saved.passengers;return}
  const c=passengerCounts();let n=0;passengerModels=[];
  for(let i=0;i<c.adults;i++)passengerModels.push(makePassenger(++n,"ADULT","Dewasa"));
  for(let i=0;i<c.children;i++)passengerModels.push(makePassenger(++n,"CHILD","Anak"));
  for(let i=0;i<c.infants;i++)passengerModels.push(makePassenger(++n,"INFANT","Bayi"));
}
function isPassengerComplete(p){
  if(!p.title||!p.fullName||!p.identityNumber||!p.birthDate||!p.gender)return false;
  if(p.identityType==="PASSPORT"&&(!p.passportCountry||!p.passportExpiry))return false;
  return true;
}
function updateCardState(card,model){
  const complete=isPassengerComplete(model);
  card.classList.toggle("complete",complete);
  const badge=$(".status-badge",card);
  badge.textContent=complete?"Lengkap":"Belum lengkap";
  badge.classList.toggle("complete",complete);
  badge.classList.toggle("incomplete",!complete);
}
function renderPassengers(){
  const list=$("#passengerList");list.innerHTML="";
  $("#passengerCount").textContent=`${passengerModels.length} orang`;

  passengerModels.forEach((model,idx)=>{
    const frag=$("#passengerTemplate").content.cloneNode(true);
    const card=$(".passenger-card",frag);card.dataset.index=idx;
    $(".number",card).textContent=idx+1;
    $(".passenger-title strong",card).textContent=`Penumpang ${idx+1}`;
    $(".passenger-title small",card).textContent=model.label;

    const name=$(".full-name",card),type=$(".identity-type",card),number=$(".identity-number",card),
      birth=$(".birth-date",card),country=$(".passport-country",card),expiry=$(".passport-expiry",card);

    name.value=model.fullName||"";type.value=model.identityType||"KTP";number.value=model.identityNumber||"";
    birth.value=model.birthDate||"";country.value=model.passportCountry||"";expiry.value=model.passportExpiry||"";

    $(".passenger-head",card).addEventListener("click",()=>card.classList.toggle("open"));

    $$(".title-selector button",card).forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.value===model.title);
      btn.addEventListener("click",()=>{
        model.title=btn.dataset.value;
        $$(".title-selector button",card).forEach(x=>x.classList.toggle("active",x===btn));
        updateCardState(card,model);
      });
    });

    $$(".gender-selector button",card).forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.value===model.gender);
      btn.addEventListener("click",()=>{
        model.gender=btn.dataset.value;
        $$(".gender-selector button",card).forEach(x=>x.classList.toggle("active",x===btn));
        updateCardState(card,model);
      });
    });

    name.addEventListener("input",()=>{
      model.fullName=name.value.toUpperCase().replace(/\s+/g," ");
      name.value=model.fullName;updateCardState(card,model);
    });
    type.addEventListener("change",()=>{
      model.identityType=type.value;
      $(".passport-extra",card).classList.toggle("hidden",model.identityType!=="PASSPORT");
      number.placeholder=model.identityType==="PASSPORT"?"Nomor paspor":"Nomor KTP";
      updateCardState(card,model);
    });
    number.addEventListener("input",()=>{
      model.identityNumber=number.value.trim().toUpperCase();
      number.value=model.identityNumber;updateCardState(card,model);
    });
    birth.addEventListener("change",()=>{model.birthDate=birth.value;updateCardState(card,model)});
    country.addEventListener("input",()=>{model.passportCountry=country.value.trim();updateCardState(card,model)});
    expiry.addEventListener("change",()=>{model.passportExpiry=expiry.value;updateCardState(card,model)});

    $(".passport-extra",card).classList.toggle("hidden",model.identityType!=="PASSPORT");
    number.placeholder=model.identityType==="PASSPORT"?"Nomor paspor":"Nomor KTP";
    updateCardState(card,model);
    if(idx===0)card.classList.add("open");
    list.appendChild(frag);
  });
}
function populateContact(){
  const saved=readState("passenger_details");
  const meta=session?.user?.user_metadata||{};
  $("#contactName").value=saved?.contact?.name||meta.full_name||"";
  $("#contactPhone").value=(saved?.contact?.phone||meta.phone||session?.user?.phone||"").replace(/^\+?62/,"");
  $("#contactEmail").value=saved?.contact?.email||session?.user?.email||"";
}
function copyContactToFirstPassenger(){
  if(!$("#useForFirstPassenger")?.checked||!passengerModels[0])return;
  const value=$("#contactName").value.trim().toUpperCase();
  passengerModels[0].fullName=value;
  const card=$('.passenger-card[data-index="0"]');
  if(card){$(".full-name",card).value=value;updateCardState(card,passengerModels[0])}
}
function fileSize(bytes){
  const n=Number(bytes||0);
  if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;
  return`${(n/(1024*1024)).toFixed(1)} MB`;
}
function setSptStatus(type,title,text){
  const box=$("#sptStatus");box.classList.remove("hidden","success","error");
  if(type)box.classList.add(type);
  $("#sptStatusTitle").textContent=title;$("#sptStatusText").textContent=text;
}
function showFilePreview(file){
  sptFile=file;
  $("#sptUploadZone").classList.add("hidden");
  $("#sptPreview").classList.remove("hidden");
  $("#sptFileName").textContent=file.name;
  $("#sptFileSize").textContent=fileSize(file.size);
  $("#sptFileType").textContent=(file.name.split(".").pop()||"FILE").toUpperCase();
  setSptStatus("","File dipilih","Menyiapkan upload ke LetsGo...");
  $("#sptError").textContent="";
}
function validSpt(file){
  if(!file)return"Pilih file SPT terlebih dahulu.";
  if(file.size>MAX_SPT_BYTES)return"Ukuran SPT maksimal 5 MB.";
  if(!(/\.(pdf|jpe?g|png)$/i.test(file.name)||["application/pdf","image/jpeg","image/png"].includes(file.type))){
    return"Format SPT harus PDF, JPG, JPEG, atau PNG.";
  }
  return"";
}
function uploadProgress(pct,text){
  $("#sptProgress").classList.remove("hidden");
  $("#sptProgressBar").style.width=`${pct}%`;
  $("#sptProgressText").textContent=text;
}
function sanitizeName(name){
  const ext=(name.split(".").pop()||"bin").toLowerCase();
  const stem=name.replace(/\.[^.]+$/,"").normalize("NFKD").replace(/[^\w-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"spt";
  return`${stem}.${ext}`;
}
async function deleteCurrentSpt(){
  if(!uploadedSptRecord)return;
  try{
    if(uploadedSptRecord.file_path)await supabase.storage.from(SPT_BUCKET).remove([uploadedSptRecord.file_path]);
    if(uploadedSptRecord.id)await supabase.from("trip_documents").delete().eq("id",uploadedSptRecord.id).eq("user_id",session.user.id);
  }catch(error){
    console.warn("[LetsGo SPT Cleanup]",error);
  }
  uploadedSptRecord=null;removeState("uploaded_spt");
}
async function uploadSpt(file){
  const message=validSpt(file);
  if(message){$("#sptError").textContent=message;setSptStatus("error","File tidak dapat digunakan",message);return false}
  showFilePreview(file);

  try{
    isUploading=true;$("#continueBtn").disabled=true;
    uploadProgress(15,"Menghubungkan ke penyimpanan...");
    await deleteCurrentSpt();

    const path=`${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${sanitizeName(file.name)}`;
    uploadProgress(40,"Mengunggah file SPT...");

    const {error:uploadError}=await supabase.storage.from(SPT_BUCKET).upload(path,file,{
      cacheControl:"3600",upsert:false,contentType:file.type||undefined
    });
    if(uploadError)throw uploadError;

    uploadProgress(78,"Menyimpan informasi dokumen...");
    const {data:row,error:dbError}=await supabase.from("trip_documents").insert({
      user_id:session.user.id,
      order_id:null,
      order_code:null,
      document_type:"SPT",
      file_name:file.name,
      file_path:path,
      file_size:file.size,
      mime_type:file.type||null,
      status:"ACTIVE",
      metadata:{source:"passenger-details",uploadedBeforeOrder:true}
    }).select("id,file_name,file_path,file_size,mime_type,status,uploaded_at").single();

    if(dbError){
      await supabase.storage.from(SPT_BUCKET).remove([path]);
      throw dbError;
    }

    uploadedSptRecord=row;writeState("uploaded_spt",row);
    uploadProgress(100,"Upload selesai.");
    setSptStatus("success","SPT berhasil diunggah","Dokumen sudah tersimpan dan siap digunakan.");
    toast("SPT berhasil diunggah.");
    setTimeout(()=>$("#sptProgress").classList.add("hidden"),650);
    return true;
  }catch(error){
    console.error("[LetsGo SPT Upload]",error);
    uploadedSptRecord=null;removeState("uploaded_spt");
    $("#sptError").textContent=`Upload gagal: ${error?.message||"Terjadi kesalahan."}`;
    setSptStatus("error","Upload SPT gagal",error?.message||"Silakan coba lagi.");
    $("#sptProgress").classList.add("hidden");
    toast("Upload SPT gagal.");
    return false;
  }finally{
    isUploading=false;$("#continueBtn").disabled=false;
  }
}
async function removeSpt(){
  await deleteCurrentSpt();
  sptFile=null;$("#sptFile").value="";
  $("#sptPreview").classList.add("hidden");
  $("#sptUploadZone").classList.remove("hidden");
  $("#sptStatus").classList.add("hidden");
  $("#sptProgress").classList.add("hidden");
  $("#sptError").textContent="";
}
function restoreSpt(){
  if(!uploadedSptRecord)return;
  $("#sptUploadZone").classList.add("hidden");$("#sptPreview").classList.remove("hidden");
  $("#sptFileName").textContent=uploadedSptRecord.file_name||"SPT";
  $("#sptFileSize").textContent=fileSize(uploadedSptRecord.file_size||0);
  $("#sptFileType").textContent=(String(uploadedSptRecord.file_name||"").split(".").pop()||"FILE").toUpperCase();
  setSptStatus("success","SPT sudah tersimpan","Dokumen siap digunakan untuk perjalanan ini.");
}
function validateForm(){
  $$("[data-error-for]").forEach(x=>x.textContent="");
  $$(".name-error,.identity-error,.birth-error,.gender-error").forEach(x=>x.textContent="");
  let ok=true;
  const name=$("#contactName").value.trim();
  const phone=$("#contactPhone").value.trim().replace(/\D/g,"");
  const email=$("#contactEmail").value.trim();

  if(name.length<3){$('[data-error-for="contactName"]').textContent="Nama pemesan wajib diisi.";ok=false}
  if(phone.length<8){$('[data-error-for="contactPhone"]').textContent="Nomor HP belum valid.";ok=false}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){$('[data-error-for="contactEmail"]').textContent="Email belum valid.";ok=false}

  passengerModels.forEach((p,idx)=>{
    const card=$(`.passenger-card[data-index="${idx}"]`);
    if(!p.fullName){$(".name-error",card).textContent="Nama wajib diisi.";ok=false}
    if(!p.identityNumber){$(".identity-error",card).textContent="Nomor identitas wajib diisi.";ok=false}
    if(!p.birthDate){$(".birth-error",card).textContent="Tanggal lahir wajib diisi.";ok=false}
    if(!p.gender){$(".gender-error",card).textContent="Pilih jenis kelamin.";ok=false}
    if(!isPassengerComplete(p))card.classList.add("open");
  });

  if(!uploadedSptRecord?.id){$("#sptError").textContent=isUploading?"Tunggu upload SPT selesai.":"SPT belum berhasil diunggah.";ok=false}
  if(!$("#consentCheck").checked){toast("Centang konfirmasi data terlebih dahulu.");ok=false}
  return ok;
}
async function continueFlow(){
  if(isSubmitting||isUploading)return toast("Tunggu proses upload selesai.");
  copyContactToFirstPassenger();
  if(!validateForm())return;

  isSubmitting=true;
  const btn=$("#continueBtn"),old=btn.innerHTML;
  btn.disabled=true;btn.classList.add("loading");btn.innerHTML="<span>Menyimpan...</span>";

  try{
    const data={
      contact:{
        name:$("#contactName").value.trim(),
        phone:`+62${$("#contactPhone").value.trim().replace(/\D/g,"").replace(/^0+/,"")}`,
        email:$("#contactEmail").value.trim()
      },
      passengers:passengerModels,
      flightOfferId:readTextState("selected_offer_id")||selectedFlight?.offerId||"",
      pricing:flightPricing,
      spt:{
        documentId:uploadedSptRecord.id,
        fileName:uploadedSptRecord.file_name,
        filePath:uploadedSptRecord.file_path,
        fileSize:uploadedSptRecord.file_size,
        mimeType:uploadedSptRecord.mime_type,
        status:uploadedSptRecord.status
      },
      updatedAt:new Date().toISOString()
    };
    writeState("passenger_details",data);
    if(flightPricing)writeState("flight_pricing",flightPricing);
    location.href="flight-review.html";
  }finally{
    isSubmitting=false;btn.disabled=false;btn.classList.remove("loading");btn.innerHTML=old;
  }
}
function bindEvents(){
  $("#backBtn")?.addEventListener("click",()=>history.back());
  $("#continueBtn")?.addEventListener("click",continueFlow);
  $("#useForFirstPassenger")?.addEventListener("change",copyContactToFirstPassenger);
  $("#contactName")?.addEventListener("input",copyContactToFirstPassenger);

  $("#sptFile")?.addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(file)await uploadSpt(file);
  });
  $("#removeSptBtn")?.addEventListener("click",removeSpt);

  const zone=$("#sptUploadZone");
  zone?.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragging")});
  zone?.addEventListener("dragleave",()=>zone.classList.remove("dragging"));
  zone?.addEventListener("drop",async e=>{
    e.preventDefault();zone.classList.remove("dragging");
    const file=e.dataTransfer?.files?.[0];if(file)await uploadSpt(file);
  });
}
async function init(){
  try{
    session=await requireAuth({redirect:"login.html",splash:"index.html"});
    if(!session)return;
    renderFlightSummary();buildPassengerModels();populateContact();renderPassengers();restoreSpt();bindEvents();
    console.info("[LetsGo] Passenger Details ready");
  }catch(error){
    console.error("[LetsGo Passenger Details]",error);
    toast(error?.message||"Halaman gagal dimuat.");
  }
}
init();
