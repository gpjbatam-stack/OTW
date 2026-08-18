(() => {
  "use strict";

  const SUPABASE_URL = "https://vumyxlbybhlaicubtgun.supabase.co";
  const SUPABASE_KEY = "sb_publishable_I_RUzlQZGzVChVl7gbku6Q_Nmq1FBD2";
  const SPT_BUCKET = "spt-documents";
  const MAX_SPT_BYTES = 5 * 1024 * 1024;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  let sb = null;
  let selectedFlight = readJSON("otw_selected_flight");
  let search = readJSON("otw_search") || selectedFlight?.searchSnapshot || {};
  let passengerModels = [];
  let sptFile = null;
  let uploadedSptRecord = readJSON("otw_uploaded_spt") || null;
  let isUploading = false;
  let isSubmitting = false;

  const LOGOS = Object.freeze({
    GA:"GA.png", JT:"JT.png", QG:"QG.png", ID:"ID.png", IU:"IU.png",
    "8B":"8B.png", IN:"IN.png", IP:"IP.png", IW:"IW.png", QZ:"QZ.png", SJ:"SJ.png"
  });

  const NAME_CODES = Object.freeze({
    "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
    "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
    "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
  });

  function readJSON(key){
    try {
      return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function esc(v=""){
    return String(v).replace(/[&<>"']/g,m=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function toast(message){
    const el=$("#toast");
    if(!el) return;
    el.textContent=message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.remove("show"),2400);
  }

  function hm(v){
    if(!v) return "--:--";
    const m=String(v).match(/T(\d{2}):(\d{2})/);
    if(m) return `${m[1]}:${m[2]}`;
    return "--:--";
  }

  function dateLabel(v){
    if(!v) return "—";
    const d=new Date(v);
    if(Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("id-ID",{
      weekday:"short",day:"numeric",month:"short",year:"numeric"
    }).format(d);
  }

  function resolveCode(code,name){
    const c=String(code||"").toUpperCase();
    return LOGOS[c] ? c : (NAME_CODES[String(name||"").toLowerCase()] || c || "FL");
  }

  function logoHTML(code,name){
    const c=resolveCode(code,name);
    const src=LOGOS[c];
    return src
      ? `<img src="./${src}?v=20260819" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span style="display:none">${esc(c)}</span>`
      : `<span>${esc(c)}</span>`;
  }

  async function initSupabase(){
    if(!window.supabase?.createClient){
      throw new Error("Supabase SDK tidak berhasil dimuat.");
    }

    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });

    const {data,error}=await sb.auth.getSession();
    if(error) throw error;

    if(!data?.session){
      location.href="login.html";
      return false;
    }

    return true;
  }

  function renderFlightSummary(){
    if(!selectedFlight) return;

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

  function passengerCounts(){
    return {
      adults:Math.max(1,Number(search?.passengers?.adult ?? search.adults ?? 1)),
      children:Math.max(0,Number(search?.passengers?.child ?? search.children ?? 0)),
      infants:Math.max(0,Number(search?.passengers?.infant ?? search.infants ?? 0))
    };
  }

  function makePassenger(index,type,label){
    return {
      index,type,label,title:"",fullName:"",identityType:"KTP",identityNumber:"",
      birthDate:"",gender:"",passportCountry:"",passportExpiry:""
    };
  }

  function buildPassengerModels(){
    const saved=readJSON("otw_passenger_details");
    if(saved?.passengers?.length){
      passengerModels=saved.passengers;
      return;
    }

    const c=passengerCounts();
    let n=0;
    passengerModels=[];
    for(let i=0;i<c.adults;i++) passengerModels.push(makePassenger(++n,"ADULT","Dewasa"));
    for(let i=0;i<c.children;i++) passengerModels.push(makePassenger(++n,"CHILD","Anak"));
    for(let i=0;i<c.infants;i++) passengerModels.push(makePassenger(++n,"INFANT","Bayi"));
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

  function renderPassengers(){
    const list=$("#passengerList");
    list.innerHTML="";
    $("#passengerCount").textContent=`${passengerModels.length} orang`;

    passengerModels.forEach((model,idx)=>{
      const frag=$("#passengerTemplate").content.cloneNode(true);
      const card=$(".passenger-card",frag);
      card.dataset.index=idx;

      $(".number",card).textContent=idx+1;
      $(".passenger-title strong",card).textContent=`Penumpang ${idx+1}`;
      $(".passenger-title small",card).textContent=model.label;

      const name=$(".full-name",card);
      const type=$(".identity-type",card);
      const number=$(".identity-number",card);
      const birth=$(".birth-date",card);
      const country=$(".passport-country",card);
      const expiry=$(".passport-expiry",card);

      name.value=model.fullName||"";
      type.value=model.identityType||"KTP";
      number.value=model.identityNumber||"";
      birth.value=model.birthDate||"";
      country.value=model.passportCountry||"";
      expiry.value=model.passportExpiry||"";

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
        name.value=model.fullName;
        updateCardState(card,model);
      });

      type.addEventListener("change",()=>{
        model.identityType=type.value;
        $(".passport-extra",card).classList.toggle("hidden",model.identityType!=="PASSPORT");
        number.placeholder=model.identityType==="PASSPORT"?"Nomor paspor":"Nomor KTP";
        updateCardState(card,model);
      });

      number.addEventListener("input",()=>{
        model.identityNumber=number.value.trim().toUpperCase();
        number.value=model.identityNumber;
        updateCardState(card,model);
      });

      birth.addEventListener("change",()=>{
        model.birthDate=birth.value;
        updateCardState(card,model);
      });

      country.addEventListener("input",()=>model.passportCountry=country.value.trim());
      expiry.addEventListener("change",()=>model.passportExpiry=expiry.value);

      $(".passport-extra",card).classList.toggle("hidden",model.identityType!=="PASSPORT");
      number.placeholder=model.identityType==="PASSPORT"?"Nomor paspor":"Nomor KTP";

      updateCardState(card,model);
      if(idx===0) card.classList.add("open");

      list.appendChild(frag);
    });
  }

  function populateContact(){
    const saved=readJSON("otw_passenger_details");
    if(saved?.contact){
      $("#contactName").value=saved.contact.name||"";
      $("#contactPhone").value=(saved.contact.phone||"").replace(/^\+?62/,"");
      $("#contactEmail").value=saved.contact.email||"";
    }
  }

  function copyContactToFirstPassenger(){
    if(!$("#useForFirstPassenger")?.checked || !passengerModels[0]) return;
    const value=$("#contactName").value.trim().toUpperCase();
    passengerModels[0].fullName=value;
    const card=$('.passenger-card[data-index="0"]');
    if(card){
      $(".full-name",card).value=value;
      updateCardState(card,passengerModels[0]);
    }
  }

  function fileSize(bytes){
    const n=Number(bytes||0);
    if(n<1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/(1024*1024)).toFixed(1)} MB`;
  }

  function setSptStatus(type,title,text){
    const box=$("#sptStatus");
    box.classList.remove("hidden","success","error");
    if(type) box.classList.add(type);
    $("#sptStatusTitle").textContent=title;
    $("#sptStatusText").textContent=text;
  }

  function showFilePreview(file){
    sptFile=file;

    // IMMEDIATE UI FEEDBACK — occurs before any network request.
    $("#sptUploadZone").classList.add("hidden");
    $("#sptPreview").classList.remove("hidden");
    $("#sptFileName").textContent=file.name;
    $("#sptFileSize").textContent=fileSize(file.size);
    $("#sptFileType").textContent=(file.name.split(".").pop()||"FILE").toUpperCase();

    setSptStatus("", "File dipilih", "Menyiapkan upload ke OTW...");
    $("#sptError").textContent="";
  }

  function validSpt(file){
    if(!file) return "Pilih file SPT terlebih dahulu.";
    if(file.size>MAX_SPT_BYTES) return "Ukuran SPT maksimal 5 MB.";
    if(!(/\.(pdf|jpe?g|png)$/i.test(file.name)||["application/pdf","image/jpeg","image/png"].includes(file.type))){
      return "Format SPT harus PDF, JPG, JPEG, atau PNG.";
    }
    return "";
  }

  function uploadProgress(pct,text){
    $("#sptProgress").classList.remove("hidden");
    $("#sptProgressBar").style.width=`${pct}%`;
    $("#sptProgressText").textContent=text;
  }

  function sanitizeName(name){
    const ext=(name.split(".").pop()||"bin").toLowerCase();
    const base=name.replace(/\.[^.]+$/,"").normalize("NFKD")
      .replace(/[^\w-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"spt";
    return `${base}.${ext}`;
  }

  async function uploadSpt(file){
    const errorMessage=validSpt(file);
    if(errorMessage){
      $("#sptError").textContent=errorMessage;
      setSptStatus("error","File tidak dapat digunakan",errorMessage);
      return false;
    }

    showFilePreview(file);

    try{
      isUploading=true;
      $("#continueBtn").disabled=true;
      uploadProgress(15,"Menghubungkan ke penyimpanan...");

      const {data:userData,error:userError}=await sb.auth.getUser();
      if(userError) throw userError;
      const user=userData?.user;
      if(!user) throw new Error("Sesi login tidak ditemukan.");

      // Replace an older uploaded SPT if present.
      if(uploadedSptRecord?.file_path){
        await sb.storage.from(SPT_BUCKET).remove([uploadedSptRecord.file_path]);
        if(uploadedSptRecord?.id){
          await sb.from("trip_documents").delete().eq("id",uploadedSptRecord.id);
        }
        uploadedSptRecord=null;
        sessionStorage.removeItem("otw_uploaded_spt");
      }

      const filePath=`${user.id}/${Date.now()}-${crypto.randomUUID()}-${sanitizeName(file.name)}`;

      uploadProgress(40,"Mengunggah file SPT...");

      const {error:uploadError}=await sb.storage
        .from(SPT_BUCKET)
        .upload(filePath,file,{
          cacheControl:"3600",
          upsert:false,
          contentType:file.type||undefined
        });

      if(uploadError) throw new Error(uploadError.message);

      uploadProgress(78,"Menyimpan informasi dokumen...");

      const {data:row,error:dbError}=await sb
        .from("trip_documents")
        .insert({
          user_id:user.id,
          order_id:null,
          document_type:"SPT",
          file_name:file.name,
          file_path:filePath,
          file_size:file.size,
          mime_type:file.type||null,
          status:"uploaded"
        })
        .select("id,file_name,file_path,file_size,mime_type,status,uploaded_at")
        .single();

      if(dbError){
        await sb.storage.from(SPT_BUCKET).remove([filePath]);
        throw new Error(dbError.message);
      }

      uploadedSptRecord=row;
      sessionStorage.setItem("otw_uploaded_spt",JSON.stringify(row));

      uploadProgress(100,"Upload selesai.");
      setSptStatus("success","SPT berhasil diunggah","Dokumen sudah tersimpan dan Anda dapat melanjutkan.");
      $("#sptError").textContent="";
      toast("SPT berhasil diunggah.");

      setTimeout(()=>$("#sptProgress").classList.add("hidden"),650);
      return true;

    }catch(err){
      console.error("[OTW] SPT upload:",err);
      uploadedSptRecord=null;
      sessionStorage.removeItem("otw_uploaded_spt");
      $("#sptError").textContent=`Upload gagal: ${err?.message||"Terjadi kesalahan."}`;
      setSptStatus("error","Upload SPT gagal",err?.message||"Silakan coba lagi.");
      $("#sptProgress").classList.add("hidden");
      toast("Upload SPT gagal.");
      return false;
    }finally{
      isUploading=false;
      $("#continueBtn").disabled=false;
    }
  }

  async function removeSpt(){
    try{
      if(uploadedSptRecord?.file_path){
        await sb.storage.from(SPT_BUCKET).remove([uploadedSptRecord.file_path]);
        if(uploadedSptRecord.id){
          await sb.from("trip_documents").delete().eq("id",uploadedSptRecord.id);
        }
      }
    }catch(err){
      console.warn("[OTW] remove SPT:",err);
    }

    sptFile=null;
    uploadedSptRecord=null;
    sessionStorage.removeItem("otw_uploaded_spt");
    $("#sptFile").value="";
    $("#sptPreview").classList.add("hidden");
    $("#sptUploadZone").classList.remove("hidden");
    $("#sptStatus").classList.add("hidden");
    $("#sptProgress").classList.add("hidden");
    $("#sptError").textContent="";
  }

  function restoreSpt(){
    if(!uploadedSptRecord) return;
    $("#sptUploadZone").classList.add("hidden");
    $("#sptPreview").classList.remove("hidden");
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

    if(name.length<3){ $('[data-error-for="contactName"]').textContent="Nama pemesan wajib diisi."; ok=false; }
    if(phone.length<8){ $('[data-error-for="contactPhone"]').textContent="Nomor HP belum valid."; ok=false; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $('[data-error-for="contactEmail"]').textContent="Email belum valid."; ok=false; }

    passengerModels.forEach((p,idx)=>{
      const card=$(`.passenger-card[data-index="${idx}"]`);
      if(!p.fullName){ $(".name-error",card).textContent="Nama wajib diisi."; ok=false; }
      if(!p.identityNumber){ $(".identity-error",card).textContent="Nomor identitas wajib diisi."; ok=false; }
      if(!p.birthDate){ $(".birth-error",card).textContent="Tanggal lahir wajib diisi."; ok=false; }
      if(!p.gender){ $(".gender-error",card).textContent="Pilih jenis kelamin."; ok=false; }
      if(!isPassengerComplete(p)) card.classList.add("open");
    });

    if(!uploadedSptRecord?.id){
      $("#sptError").textContent=isUploading ? "Tunggu upload SPT selesai." : "SPT belum berhasil diunggah.";
      ok=false;
    }

    if(!$("#consentCheck").checked){
      toast("Centang konfirmasi data terlebih dahulu.");
      ok=false;
    }

    return ok;
  }

  async function continueFlow(){
    if(isSubmitting||isUploading){
      toast("Tunggu proses upload selesai.");
      return;
    }

    copyContactToFirstPassenger();
    if(!validateForm()) return;

    isSubmitting=true;
    const btn=$("#continueBtn");
    const old=btn.innerHTML;
    btn.disabled=true;
    btn.classList.add("loading");
    btn.innerHTML="<span>Menyimpan...</span>";

    try{
      const data={
        contact:{
          name:$("#contactName").value.trim(),
          phone:`+62${$("#contactPhone").value.trim().replace(/\D/g,"").replace(/^0+/,"")}`,
          email:$("#contactEmail").value.trim()
        },
        passengers:passengerModels,
        flightOfferId:sessionStorage.getItem("otw_selected_offer_id")||selectedFlight?.offerId||"",
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

      sessionStorage.setItem("otw_passenger_details",JSON.stringify(data));
      location.href="flight-addons.html";
    }finally{
      isSubmitting=false;
      btn.disabled=false;
      btn.classList.remove("loading");
      btn.innerHTML=old;
    }
  }

  function bindEvents(){
    $("#backBtn")?.addEventListener("click",()=>history.back());
    $("#continueBtn")?.addEventListener("click",continueFlow);
    $("#useForFirstPassenger")?.addEventListener("change",copyContactToFirstPassenger);
    $("#contactName")?.addEventListener("input",copyContactToFirstPassenger);

    const fileInput=$("#sptFile");

    // Critical: immediately process the file selected from Windows Explorer.
    fileInput?.addEventListener("change",async event=>{
      const file=event.target.files?.[0];
      if(!file) return;
      await uploadSpt(file);
    });

    $("#removeSptBtn")?.addEventListener("click",removeSpt);

    const zone=$("#sptUploadZone");
    zone?.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragging");});
    zone?.addEventListener("dragleave",()=>zone.classList.remove("dragging"));
    zone?.addEventListener("drop",async e=>{
      e.preventDefault();
      zone.classList.remove("dragging");
      const file=e.dataTransfer?.files?.[0];
      if(file) await uploadSpt(file);
    });
  }

  async function init(){
    try{
      const ready=await initSupabase();
      if(!ready) return;

      renderFlightSummary();
      populateContact();
      buildPassengerModels();
      renderPassengers();
      restoreSpt();
      bindEvents();

      console.info("[OTW] Passenger Details V5 ready");
    }catch(err){
      console.error("[OTW] init Passenger Details:",err);
      toast(err?.message||"Halaman gagal dimuat.");
    }
  }

  document.addEventListener("DOMContentLoaded",init);
})();