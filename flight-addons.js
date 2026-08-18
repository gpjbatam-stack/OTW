(() => {
  "use strict";

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];

  const LOGOS = {
    GA:"GA.png",JT:"JT.png",QG:"QG.png",ID:"ID.png",IU:"IU.png",
    "8B":"8B.png",IN:"IN.png",IP:"IP.png",IW:"IW.png",QZ:"QZ.png",SJ:"SJ.png"
  };

  const NAME_CODES = {
    "garuda indonesia":"GA","lion air":"JT","citilink":"QG","batik air":"ID",
    "super air jet":"IU","transnusa":"8B","nam air":"IN","pelita air":"IP",
    "wings air":"IW","indonesia airasia":"QZ","airasia indonesia":"QZ","sriwijaya air":"SJ"
  };

  let flight = readJSON("otw_selected_flight");
  let passengerData = readJSON("otw_passenger_details");
  let search = readJSON("otw_search") || flight?.searchSnapshot || {};
  let selections = readJSON("otw_flight_addons") || { baggage:{}, insurance:false };

  function readJSON(key){
    try{return JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||"null")}
    catch{return null}
  }

  function toast(msg){
    const el=$("#toast"); el.textContent=msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2200);
  }

  function esc(v=""){
    return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }

  function hm(v){
    if(!v)return"--:--";
    const m=String(v).match(/T(\d{2}):(\d{2})/);
    return m?`${m[1]}:${m[2]}`:"--:--";
  }

  function dateLabel(v){
    if(!v)return"—";
    const d=new Date(v); if(Number.isNaN(d.getTime()))return"—";
    return new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d);
  }

  function resolveCode(code,name){
    const c=String(code||"").toUpperCase();
    return LOGOS[c]?c:(NAME_CODES[String(name||"").toLowerCase()]||c||"FL");
  }

  function renderFlight(){
    if(!flight){
      toast("Data penerbangan tidak ditemukan.");
      return;
    }
    const segs=flight.segments||[];
    const first=segs[0]||{};
    const last=segs[segs.length-1]||first;
    const name=first.carrierName||flight.airlineName||"Maskapai";
    const code=resolveCode(first.carrier||flight.airlineCode,name);
    const logo=LOGOS[code];

    $("#airlineLogo").innerHTML=logo
      ? `<img src="./${logo}?v=20260819" alt="${esc(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span style="display:none">${esc(code)}</span>`
      : `<span>${esc(code)}</span>`;

    $("#airlineName").textContent=name;
    $("#flightNumber").textContent=first.flightNumber||flight.flightNumber||"—";
    $("#origin").textContent=first.origin||flight.origin||search.origin||"---";
    $("#destination").textContent=last.destination||flight.destination||search.destination||"---";
    $("#departTime").textContent=hm(first.departureLocalTime||first.departureTime||flight.departureTime);
    $("#arriveTime").textContent=hm(last.arrivalLocalTime||last.arrivalTime||flight.arrivalTime);
    $("#flightDate").textContent=dateLabel(first.departureLocalTime||first.departureTime||flight.departureTime||search.depart);
    $("#cabin").textContent=first.cabinClass||flight.cabin||search.cabinClass||"Ekonomi";

    const baggage=first.baggageAllowance||flight.baggage||"sesuai fare";
    $("#includedBaggage").textContent=`Bagasi ${baggage}`;
    $("#baseBaggage").textContent=baggage;
  }

  function passengers(){
    if(passengerData?.passengers?.length)return passengerData.passengers;
    const count=Math.max(1,Number(search?.passengers?.adult||1));
    return Array.from({length:count},(_,i)=>({index:i+1,label:"Dewasa",fullName:`Penumpang ${i+1}`}));
  }

  function renderBaggage(){
    const list=$("#baggagePassengers");
    const tpl=$("#baggagePassengerTemplate");
    list.innerHTML="";

    passengers().forEach((p,i)=>{
      const frag=tpl.content.cloneNode(true);
      const card=$(".pax-addon",frag);
      const key=String(i);
      const kg=Number(selections.baggage?.[key]||0);

      $(".pax-number",card).textContent=i+1;
      $(".pax-name",card).textContent=p.fullName||`Penumpang ${i+1}`;
      $(".pax-type",card).textContent=p.label||p.type||"Penumpang";
      setChoice(card,kg);

      $(".pax-addon-head",card).addEventListener("click",()=>card.classList.toggle("open"));

      $$(".baggage-options button",card).forEach(btn=>{
        btn.classList.toggle("active",Number(btn.dataset.kg)===kg);
        btn.addEventListener("click",()=>{
          const value=Number(btn.dataset.kg);
          selections.baggage[key]=value;
          $$(".baggage-options button",card).forEach(x=>x.classList.toggle("active",x===btn));
          setChoice(card,value);
          saveDraft();
          updateSummary();
        });
      });

      if(kg>0)card.classList.add("selected");
      list.appendChild(frag);
    });
  }

  function setChoice(card,kg){
    $(".pax-choice",card).textContent=kg>0?`+${kg} kg`:"Tidak tambah";
    card.classList.toggle("selected",kg>0);
  }

  function updateInsurance(){
    const on=Boolean(selections.insurance);
    $("#insuranceToggle").checked=on;
    $(".insurance-card").classList.toggle("active",on);
    $("#insuranceState span").textContent=on?"Perlindungan dipilih":"Belum dipilih";
    $("#insuranceState small").textContent=on?"Akan dikonfirmasi pada tahap final.":"Anda dapat melanjutkan tanpa asuransi.";
    updateSummary();
  }

  function updateSummary(){
    const values=Object.values(selections.baggage||{}).map(Number);
    const selected=values.filter(v=>v>0);
    const total=selected.reduce((a,b)=>a+b,0);

    $("#baggageSummary").textContent=selected.length
      ? `${selected.length} penumpang · total +${total} kg`
      : "Tidak ada";
    $("#baggageStatus").textContent=selected.length?"Dipilih":"—";
    $("#baggageStatus").classList.toggle("on",selected.length>0);

    $("#insuranceSummary").textContent=selections.insurance?"Perlindungan dipilih":"Tidak dipilih";
    $("#insuranceStatus").textContent=selections.insurance?"Aktif":"—";
    $("#insuranceStatus").classList.toggle("on",Boolean(selections.insurance));
  }

  function saveDraft(){
    sessionStorage.setItem("otw_flight_addons",JSON.stringify({
      ...selections,
      updatedAt:new Date().toISOString()
    }));
  }

  function resetAll(showToast=true){
    selections={baggage:{},insurance:false};
    saveDraft();
    renderBaggage();
    updateInsurance();
    if(showToast)toast("Pilihan tambahan direset.");
  }

  function continueFlow(){
    saveDraft();
    sessionStorage.setItem("otw_flight_addons",JSON.stringify({
      baggage:selections.baggage,
      insurance:Boolean(selections.insurance),
      pricingStatus:"pending_supplier_confirmation",
      note:"Harga dan ketersediaan add-on dikonfirmasi pada proses final.",
      updatedAt:new Date().toISOString()
    }));

    /*
      Tahap 4 yang disiapkan:
      flight-review.html
      Jika nama halaman final OTW berbeda, cukup ubah satu baris di bawah.
    */
    location.href="flight-review.html";
  }

  function bind(){
    $("#backBtn").addEventListener("click",()=>history.back());

    $("#insuranceToggle").addEventListener("change",e=>{
      selections.insurance=e.target.checked;
      saveDraft();
      updateInsurance();
      toast(selections.insurance?"Asuransi perjalanan dipilih.":"Asuransi perjalanan dinonaktifkan.");
    });

    $("#resetBtn").addEventListener("click",()=>resetAll(true));
    $("#skipBtn").addEventListener("click",()=>{
      resetAll(false);
      toast("Add-on dilewati.");
      setTimeout(continueFlow,220);
    });
    $("#continueBtn").addEventListener("click",continueFlow);
  }

  function init(){
    if(!passengerData){
      toast("Data penumpang belum ditemukan.");
    }
    renderFlight();
    renderBaggage();
    updateInsurance();
    bind();
    console.info("[OTW] Flight Add-ons Premium V1 ready");
  }

  document.addEventListener("DOMContentLoaded",init);
})();