import { requireAuth } from "./guard.js";
import { supabase } from "./supabase.js";

try { await requireAuth({ redirect: "login.html" }); }
catch (e) { console.warn("[OTW] auth guard:", e); }

const $ = (s,root=document) => root.querySelector(s);
const $$ = (s,root=document) => [...root.querySelectorAll(s)];

const LOGOS = Object.freeze({
  GA:"GA.png", JT:"JT.png", QG:"QG.png", ID:"ID.png", IU:"IU.png",
  "8B":"8B.png", IN:"IN.png", IP:"IP.png", IW:"IW.png", QZ:"QZ.png", SJ:"SJ.png"
});

const NAME_CODES = Object.freeze({
  "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
  "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
  "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
});

let selectedFlight = readJSON("otw_selected_flight");
let search = readJSON("otw_search") || selectedFlight?.searchSnapshot || {};
let passengerModels = [];
let sptFile = null;
const MAX_SPT_BYTES = 5 * 1024 * 1024;
const SPT_BUCKET = "spt-documents";
let uploadedSptRecord = readJSON("otw_uploaded_spt") || null;
let isSubmitting = false;

function readJSON(key){
  try { return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || "null"); }
  catch { return null; }
}

function esc(v=""){
  return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function hm(v){
  if(!v) return "--:--";
  const text=String(v);
  const m=text.match(/T(\d{2}):(\d{2})/);
  if(m) return `${m[1]}:${m[2]}`;
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"--:--":`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function dateLabel(v){
  if(!v) return "—";
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d);
}

function resolveCode(code,name){
  const c=String(code||"").toUpperCase();
  return LOGOS[c]?c:(NAME_CODES[String(name||"").toLowerCase()]||c||"FL");
}

function logoHTML(code,name){
  const c=resolveCode(code,name);
  const src=LOGOS[c];
  return src
    ? `<img src="./${src}?v=20260819" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span style="display:none">${esc(c)}</span>`
    : `<span>${esc(c)}</span>`;
}

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function passengerCounts(){
  const adults=Number(search?.passengers?.adult ?? search.adults ?? 1);
  const children=Number(search?.passengers?.child ?? search.children ?? 0);
  const infants=Number(search?.passengers?.infant ?? search.infants ?? 0);
  return {adults:Math.max(1,adults),children:Math.max(0,children),infants:Math.max(0,infants)};
}

function renderFlightSummary(){
  if(!selectedFlight){
    toast("Data penerbangan tidak ditemukan.");
    return;
  }

  const segments=selectedFlight.segments||[];
  const first=segments[0]||{};
  const last=segments[segments.length-1]||first;
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
  $("#flightDate").textContent=dateLabel(first.departureLocalTime||first.departureTime||selectedFlight.departureTime||search.depart);
  $("#cabinClass").textContent=cabin;
  $("#baggage").textContent=`Bagasi ${first.baggageAllowance||selectedFlight.baggage||"sesuai fare"}`;
}

function buildPassengerModels(){
  const saved=readJSON("otw_passenger_details");
  const counts=passengerCounts();

  if(saved?.passengers?.length){
    passengerModels=saved.passengers;
    return;
  }

  passengerModels=[];
  let index=0;

  for(let i=0;i<counts.adults;i++){
    passengerModels.push(makePassenger(++index,"ADULT","Dewasa"));
  }
  for(let i=0;i<counts.children;i++){
    passengerModels.push(makePassenger(++index,"CHILD","Anak"));
  }
  for(let i=0;i<counts.infants;i++){
    passengerModels.push(makePassenger(++index,"INFANT","Bayi"));
  }
}

function makePassenger(index,type,label){
  return {
    index,type,label,title:"",fullName:"",identityType:"KTP",identityNumber:"",
    birthDate:"",gender:"",passportCountry:"",passportExpiry:""
  };
}

function renderPassengers(){
  const list=$("#passengerList");
  list.innerHTML="";
  $("#passengerCount").textContent=`${passengerModels.length} orang`;

  passengerModels.forEach((model,idx)=>{
    const tpl=$("#passengerTemplate").content.cloneNode(true);
    const card=$(".passenger-card",tpl);

    card.dataset.index=idx;
    $(".number",card).textContent=idx+1;
    $(".passenger-title strong",card).textContent=`Penumpang ${idx+1}`;
    $(".passenger-title small",card).textContent=model.label;

    const nameInput=$(".full-name",card);
    const identityType=$(".identity-type",card);
    const identityNumber=$(".identity-number",card);
    const birthDate=$(".birth-date",card);
    const passportCountry=$(".passport-country",card);
    const passportExpiry=$(".passport-expiry",card);

    nameInput.value=model.fullName||"";
    identityType.value=model.identityType||"KTP";
    identityNumber.value=model.identityNumber||"";
    birthDate.value=model.birthDate||"";
    passportCountry.value=model.passportCountry||"";
    passportExpiry.value=model.passportExpiry||"";

    $$(".title-selector button",card).forEach(btn=>{
      if(btn.dataset.value===model.title) btn.classList.add("active");
      btn.addEventListener("click",()=>{
        model.title=btn.dataset.value;
        $$(".title-selector button",card).forEach(x=>x.classList.toggle("active",x===btn));
        updateCardState(card,model);
      });
    });

    $$(".gender-selector button",card).forEach(btn=>{
      if(btn.dataset.value===model.gender) btn.classList.add("active");
      btn.addEventListener("click",()=>{
        model.gender=btn.dataset.value;
        $$(".gender-selector button",card).forEach(x=>x.classList.toggle("active",x===btn));
        updateCardState(card,model);
      });
    });

    $(".passenger-head",card).addEventListener("click",()=>card.classList.toggle("open"));

    nameInput.addEventListener("input",()=>{
      model.fullName=nameInput.value.toUpperCase().replace(/\s+/g," ");
      nameInput.value=model.fullName;
      updateCardState(card,model);
    });

    identityType.addEventListener("change",()=>{
      model.identityType=identityType.value;
      $(".passport-extra",card).classList.toggle("hidden",model.identityType!=="PASSPORT");
      identityNumber.placeholder=model.identityType==="PASSPORT"?"Nomor paspor":"Nomor KTP";
      updateCardState(card,model);
    });

    identityNumber.addEventListener("input",()=>{
      model.identityNumber=identityNumber.value.trim().toUpperCase();
      identityNumber.value=model.identityNumber;
      updateCardState(card,model);
    });

    birthDate.addEventListener("change",()=>{
      model.birthDate=birthDate.value;
      updateCardState(card,model);
    });

    passportCountry.addEventListener("input",()=>model.passportCountry=passportCountry.value.trim());
    passportExpiry.addEventListener("change",()=>model.passportExpiry=passportExpiry.value);

    $(".passport-extra",card).classList.toggle("hidden",model.identityType!=="PASSPORT");
    identityNumber.placeholder=model.identityType==="PASSPORT"?"Nomor paspor":"Nomor KTP";

    updateCardState(card,model);

    if(idx===0) card.classList.add("open");
    list.appendChild(tpl);
  });
}

function isPassengerComplete(p){
  if(!p.title||!p.fullName||!p.identityNumber||!p.birthDate||!p.gender) return false;
  if(p.identityType==="PASSPORT" && (!p.passportCountry||!p.passportExpiry)) return false;
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

function populateContact(){
  const saved=readJSON("otw_passenger_details");
  if(saved?.contact){
    $("#contactName").value=saved.contact.name||"";
    $("#contactPhone").value=(saved.contact.phone||"").replace(/^\+?62/,"");
    $("#contactEmail").value=saved.contact.email||"";
    return;
  }

  const profile=readJSON("otw_profile")||readJSON("profile")||{};
  $("#contactName").value=profile.full_name||profile.name||"";
  $("#contactPhone").value=String(profile.phone||profile.no_hp||"").replace(/^\+?62/,"");
  $("#contactEmail").value=profile.email||"";
}

function copyContactToFirstPassenger(){
  if(!$("#useForFirstPassenger").checked || !passengerModels[0]) return;
  const name=$("#contactName").value.trim().toUpperCase();
  passengerModels[0].fullName=name;
  const firstCard=$('.passenger-card[data-index="0"]');
  if(firstCard){
    $(".full-name",firstCard).value=name;
    updateCardState(firstCard,passengerModels[0]);
  }
}


function formatFileSize(bytes){
  const n=Number(bytes||0);
  if(n<1024) return `${n} B`;
  if(n<1024*1024) return `${(n/1024).toFixed(n<10240?1:0)} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}

function isAllowedSpt(file){
  const allowedTypes=["application/pdf","image/jpeg","image/png"];
  const allowedExt=/\.(pdf|jpe?g|png)$/i;
  return allowedTypes.includes(file.type) || allowedExt.test(file.name||"");
}

function showSptFile(file){
  sptFile=file;
  uploadedSptRecord=null;
  sessionStorage.removeItem("otw_uploaded_spt");
  $("#sptUploadSuccess")?.classList.add("hidden");
  $("#sptError").textContent="";
  $("#sptUploadZone").classList.add("hidden");
  $("#sptPreview").classList.remove("hidden");
  $("#sptFileName").textContent=file.name;
  $("#sptFileSize").textContent=formatFileSize(file.size);
  const ext=(file.name.split(".").pop()||"FILE").toUpperCase();
  $("#sptFileType").textContent=ext==="JPEG"?"JPG":ext;
}

async function clearSpt(){
  const hadUploaded=Boolean(uploadedSptRecord?.file_path);

  sptFile=null;
  $("#sptFile").value="";
  $("#sptPreview").classList.add("hidden");
  $("#sptUploadZone").classList.remove("hidden");
  $("#sptError").textContent="";
  $("#sptUploadSuccess")?.classList.add("hidden");
  hideUploadProgress();

  if(hadUploaded){
    await deleteUploadedSptIfNeeded();
  }else{
    uploadedSptRecord=null;
    sessionStorage.removeItem("otw_uploaded_spt");
  }
}

function handleSptFile(file){
  if(!file) return;

  if(!isAllowedSpt(file)){
    $("#sptError").textContent="Format file harus PDF, JPG, JPEG, atau PNG.";
    return;
  }

  if(file.size>MAX_SPT_BYTES){
    $("#sptError").textContent="Ukuran file maksimal 10 MB.";
    return;
  }

  showSptFile(file);
}


function formatFileSize(bytes){
  const n=Number(bytes||0);
  if(n<1024) return `${n} B`;
  if(n<1024*1024) return `${(n/1024).toFixed(n<10240?1:0)} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}

function isAllowedSpt(file){
  const allowedTypes=["application/pdf","image/jpeg","image/png"];
  const allowedExt=/\.(pdf|jpe?g|png)$/i;
  return allowedTypes.includes(file.type) || allowedExt.test(file.name||"");
}

function setUploadProgress(percent,label="Mengunggah SPT..."){
  const box=$("#sptUploadProgress");
  if(!box) return;
  box.classList.remove("hidden");
  $("#sptProgressLabel").textContent=label;
  $("#sptProgressValue").textContent=`${percent}%`;
  $("#sptProgressBar").style.width=`${percent}%`;
}

function hideUploadProgress(){
  $("#sptUploadProgress")?.classList.add("hidden");
}

function sanitizeFileName(name){
  const ext=(name.split(".").pop()||"bin").toLowerCase();
  const base=name
    .replace(/\.[^.]+$/,"")
    .normalize("NFKD")
    .replace(/[^\w-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"")
    .slice(0,80) || "spt";
  return `${base}.${ext}`;
}

async function uploadSptToSupabase(){
  if(uploadedSptRecord?.id && uploadedSptRecord?.file_path){
    return uploadedSptRecord;
  }
  if(!sptFile) throw new Error("SPT belum dipilih.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if(authError) throw authError;

  const user=authData?.user;
  if(!user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

  const safeName=sanitizeFileName(sptFile.name);
  const uniqueName=`${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath=`${user.id}/${uniqueName}`;

  setUploadProgress(20,"Menyiapkan dokumen...");

  const { error: uploadError } = await supabase.storage
    .from(SPT_BUCKET)
    .upload(filePath,sptFile,{
      cacheControl:"3600",
      upsert:false,
      contentType:sptFile.type || undefined
    });

  if(uploadError) throw new Error(`Upload SPT gagal: ${uploadError.message}`);

  setUploadProgress(75,"Menyimpan data dokumen...");

  const { data: documentRow, error: dbError } = await supabase
    .from("trip_documents")
    .insert({
      user_id:user.id,
      order_id:null,
      document_type:"SPT",
      file_name:sptFile.name,
      file_path:filePath,
      file_size:sptFile.size,
      mime_type:sptFile.type || null,
      status:"uploaded"
    })
    .select("id,user_id,document_type,file_name,file_path,file_size,mime_type,status,uploaded_at")
    .single();

  if(dbError){
    try{
      await supabase.storage.from(SPT_BUCKET).remove([filePath]);
    }catch(rollbackError){
      console.error("[OTW] rollback file SPT gagal:",rollbackError);
    }
    throw new Error(`Data SPT gagal disimpan: ${dbError.message}`);
  }

  setUploadProgress(100,"SPT berhasil disimpan.");

  uploadedSptRecord=documentRow;
  sessionStorage.setItem("otw_uploaded_spt",JSON.stringify(documentRow));
  $("#sptUploadSuccess")?.classList.remove("hidden");

  setTimeout(hideUploadProgress,500);
  return documentRow;
}

async function deleteUploadedSptIfNeeded(){
  if(!uploadedSptRecord?.file_path) return;

  try{
    await supabase.storage.from(SPT_BUCKET).remove([uploadedSptRecord.file_path]);

    if(uploadedSptRecord.id){
      await supabase.from("trip_documents").delete().eq("id",uploadedSptRecord.id);
    }
  }catch(error){
    console.error("[OTW] gagal menghapus SPT lama:",error);
  }finally{
    uploadedSptRecord=null;
    sessionStorage.removeItem("otw_uploaded_spt");
  }
}

function restoreUploadedSptState(){
  if(!uploadedSptRecord) return;

  $("#sptUploadZone")?.classList.add("hidden");
  $("#sptPreview")?.classList.remove("hidden");
  $("#sptFileName").textContent=uploadedSptRecord.file_name || "SPT";
  $("#sptFileSize").textContent=formatFileSize(uploadedSptRecord.file_size || 0);

  const ext=(String(uploadedSptRecord.file_name||"").split(".").pop()||"FILE").toUpperCase();
  $("#sptFileType").textContent=ext==="JPEG"?"JPG":ext;
  $("#sptUploadSuccess")?.classList.remove("hidden");
}

function clearErrors(){
  $$("[data-error-for]").forEach(x=>x.textContent="");
  $$(".field-error.name-error,.field-error.identity-error,.field-error.birth-error,.field-error.gender-error")
    .forEach(x=>x.textContent="");
}

function validate(){
  clearErrors();
  let ok=true;

  const name=$("#contactName").value.trim();
  const phone=$("#contactPhone").value.trim().replace(/\D/g,"");
  const email=$("#contactEmail").value.trim();

  if(name.length<3){
    $('[data-error-for="contactName"]').textContent="Nama pemesan wajib diisi.";
    ok=false;
  }
  if(phone.length<8){
    $('[data-error-for="contactPhone"]').textContent="Nomor HP belum valid.";
    ok=false;
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    $('[data-error-for="contactEmail"]').textContent="Email belum valid.";
    ok=false;
  }

  passengerModels.forEach((p,idx)=>{
    const card=$(`.passenger-card[data-index="${idx}"]`);
    if(!card) return;

    if(!p.fullName || p.fullName.length<3){
      $(".name-error",card).textContent="Nama penumpang wajib diisi.";
      ok=false;
    }
    if(!p.identityNumber){
      $(".identity-error",card).textContent="Nomor identitas wajib diisi.";
      ok=false;
    }
    if(!p.birthDate){
      $(".birth-error",card).textContent="Tanggal lahir wajib diisi.";
      ok=false;
    }
    if(!p.gender){
      $(".gender-error",card).textContent="Pilih jenis kelamin.";
      ok=false;
    }
    if(p.identityType==="PASSPORT" && (!p.passportCountry||!p.passportExpiry)){
      ok=false;
    }

    if(!isPassengerComplete(p)) card.classList.add("open");
  });

  if(!sptFile && !uploadedSptRecord?.id){
    $("#sptError").textContent="Upload SPT wajib dilakukan sebelum melanjutkan.";
    ok=false;
  }

  if(!$("#consentCheck").checked){
    toast("Centang konfirmasi data penumpang terlebih dahulu.");
    ok=false;
  }

  return ok;
}

async function saveAndContinue(){
  if(isSubmitting) return;

  copyContactToFirstPassenger();

  if(!validate()){
    const firstError=$(".field-error:not(:empty)");
    firstError?.closest(".field-group,.upload-card")?.scrollIntoView({behavior:"smooth",block:"center"});
    return;
  }

  const btn=$("#continueBtn");
  const originalHtml=btn.innerHTML;

  try{
    isSubmitting=true;
    btn.disabled=true;
    btn.classList.add("loading");
    btn.innerHTML="<span>Menyimpan...</span>";

    let sptRecord=uploadedSptRecord;
    if(!sptRecord?.id){
      sptRecord=await uploadSptToSupabase();
    }

    const data={
      contact:{
        name:$("#contactName").value.trim(),
        phone:`+62${$("#contactPhone").value.trim().replace(/\D/g,"").replace(/^0+/,"")}`,
        email:$("#contactEmail").value.trim()
      },
      passengers:passengerModels,
      flightOfferId:sessionStorage.getItem("otw_selected_offer_id")||selectedFlight?.offerId||"",
      spt:{
        documentId:sptRecord.id,
        fileName:sptRecord.file_name,
        filePath:sptRecord.file_path,
        fileSize:sptRecord.file_size,
        mimeType:sptRecord.mime_type,
        status:sptRecord.status
      },
      updatedAt:new Date().toISOString()
    };

    sessionStorage.setItem("otw_passenger_details",JSON.stringify(data));
    toast("Data penumpang dan SPT berhasil disimpan.");

    setTimeout(()=>location.href="flight-addons.html",350);

  }catch(error){
    console.error("[OTW] simpan Passenger Details gagal:",error);
    $("#sptError").textContent=error?.message || "SPT gagal disimpan.";
    toast(error?.message || "Gagal menyimpan data.");
  }finally{
    isSubmitting=false;
    btn.disabled=false;
    btn.classList.remove("loading");
    btn.innerHTML=originalHtml;
  }
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#continueBtn")?.addEventListener("click",saveAndContinue);

$("#useForFirstPassenger")?.addEventListener("change",copyContactToFirstPassenger);
$("#contactName")?.addEventListener("input",copyContactToFirstPassenger);

$("#sptFile")?.addEventListener("change",(e)=>handleSptFile(e.target.files?.[0]));
$("#removeSptBtn")?.addEventListener("click",clearSpt);

const sptZone=$("#sptUploadZone");
sptZone?.addEventListener("dragover",(e)=>{e.preventDefault();sptZone.classList.add("dragging");});
sptZone?.addEventListener("dragleave",()=>sptZone.classList.remove("dragging"));
sptZone?.addEventListener("drop",(e)=>{
  e.preventDefault();
  sptZone.classList.remove("dragging");
  handleSptFile(e.dataTransfer?.files?.[0]);
});

renderFlightSummary();
populateContact();
buildPassengerModels();
renderPassengers();
restoreUploadedSptState();
