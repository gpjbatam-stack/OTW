const ROUTES = Object.freeze({
  home:"home.html", orders:"orders.html", request:"request.html",
  notifications:"notifications.html", profile:"profile.html", invoice:"invoice.html",
  history:"history.html", services:"services.html", help:"help.html",
  flightSearch:"search-flight.html", trainSearch:"search-train.html", hotelSearch:"search-hotel.html"
});
const navigateTo = route => { window.location.href = route; };

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  loadAccountDataSafely();
});

async function loadAccountDataSafely(){
  try{
    const [{requireAuth},{getMyProfile}] = await Promise.all([import("./guard.js"),import("./profile-service.js")]);
    const session = await requireAuth({redirect:"login.html"});
    if(!session) return;
    const profile = await getMyProfile();
    const fullName = profile?.full_name || "Pengguna";
    const firstName = fullName.trim().split(/\s+/)[0];
    const greeting=document.querySelector("#greeting"), avatar=document.querySelector("#avatar");
    if(greeting) greeting.textContent=`Halo, ${firstName}`;
    if(avatar) avatar.textContent=fullName.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"OT";
  }catch(e){ console.warn("[OTW] Account data unavailable; UI remains active.",e); }
}

function initUI(){
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const state={tripType:"oneway",origin:{code:"BTH",city:"Batam",name:"Hang Nadim International Airport"},destination:null,departDate:"",returnDate:"",adult:1,child:0,infant:0,cabin:"Ekonomi",activeService:"flight",passengerContext:"flight",trainOrigin:null,trainDestination:null,trainDate:"",hotelCity:"",hotelCheckin:"",hotelCheckout:""};
  window.__OTW_SEARCH_STATE__=state;
  const airports=[
    ["BTH","Batam","Hang Nadim International Airport"],["CGK","Jakarta","Soekarno-Hatta International Airport"],["HLP","Jakarta","Halim Perdanakusuma Airport"],["DPS","Denpasar","I Gusti Ngurah Rai International Airport"],["SUB","Surabaya","Juanda International Airport"],["KNO","Medan","Kualanamu International Airport"],["UPG","Makassar","Sultan Hasanuddin International Airport"],["YIA","Yogyakarta","Yogyakarta International Airport"],["SRG","Semarang","Jenderal Ahmad Yani International Airport"],["PLM","Palembang","Sultan Mahmud Badaruddin II Airport"],["PKU","Pekanbaru","Sultan Syarif Kasim II Airport"],["PDG","Padang","Minangkabau International Airport"],["BPN","Balikpapan","Sultan Aji Muhammad Sulaiman Sepinggan Airport"],["SOC","Solo","Adi Soemarmo International Airport"]
  ].map(([code,city,name])=>({code,city,name}));
  const stations=[
    ["GMR","Jakarta","Gambir"],["PSE","Jakarta","Pasar Senen"],["BD","Bandung","Bandung"],["YK","Yogyakarta","Yogyakarta / Tugu"],["SLO","Solo","Solo Balapan"],["SMT","Semarang","Semarang Tawang"],["SGU","Surabaya","Surabaya Gubeng"],["SBI","Surabaya","Surabaya Pasar Turi"],["ML","Malang","Malang"]
  ].map(([code,city,name])=>({code,city,name}));
  const hotelCities=["Batam","Jakarta","Bandung","Yogyakarta","Surabaya","Medan","Makassar","Bali","Semarang","Pekanbaru","Padang","Balikpapan"];

  const backdrop=$("#sheetBackdrop"), sheets=$$(".bottom-sheet");
  function openSheet(sheet){ if(!sheet)return; sheets.forEach(s=>{s.classList.remove("show");s.setAttribute("aria-hidden","true")}); sheet.classList.add("show");sheet.setAttribute("aria-hidden","false");backdrop?.classList.add("show");document.body.style.overflow="hidden"; }
  function closeSheets(){ sheets.forEach(s=>{s.classList.remove("show");s.setAttribute("aria-hidden","true")});backdrop?.classList.remove("show");document.body.style.overflow=""; }
  backdrop?.addEventListener("click",closeSheets); $$('[data-close-sheet]').forEach(b=>b.addEventListener("click",closeSheets));

  const panels={flight:$("#flightPanel"),train:$("#trainPanel"),hotel:$("#hotelPanel")};
  $$(".travel-tab").forEach(tab=>tab.addEventListener("click",()=>{ const key=tab.dataset.tab; if(!panels[key])return; $$(".travel-tab").forEach(x=>x.classList.toggle("active",x===tab)); Object.entries(panels).forEach(([k,p])=>p?.classList.toggle("active",k===key)); state.activeService=key; }));

  const returnWrap=$("#returnDateWrap"), tripLabel=$("#tripTypeLabel");
  $$(".trip-type").forEach(btn=>btn.addEventListener("click",()=>{state.tripType=btn.dataset.trip; $$(".trip-type").forEach(x=>x.classList.toggle("active",x===btn)); const round=state.tripType==="roundtrip"; if(returnWrap)returnWrap.hidden=!round; if(tripLabel)tripLabel.textContent=round?"Pulang-pergi":"Sekali jalan"; if(!round){state.returnDate=""; if($("#returnDateInput"))$("#returnDateInput").value=""; if($("#returnDateText"))$("#returnDateText").textContent="Pilih tanggal";} }));

  let airportTarget="destination";
  const airportSheet=$("#airportSheet"), airportList=$("#airportList"), airportSearch=$("#airportSearch");
  function syncRoute(){ $("#originCode").textContent=state.origin.code; $("#originCity").textContent=state.origin.city; const dc=$("#destinationCode"),city=$("#destinationCity"); if(dc){dc.textContent=state.destination?.code||"—";dc.classList.toggle("muted-code",!state.destination)} if(city)city.textContent=state.destination?.city||"Pilih tujuan"; }
  function renderAirports(q=""){q=q.trim().toLowerCase(); const list=airports.filter(a=>!q||`${a.code} ${a.city} ${a.name}`.toLowerCase().includes(q)); if(!airportList)return; airportList.innerHTML=list.map(a=>`<button class="airport-option" type="button" data-code="${a.code}"><span class="code">${a.code}</span><span class="airport-main"><strong>${a.city}</strong><small>${a.name}</small></span><span class="select-mark">›</span></button>`).join(""); airportList.querySelectorAll("[data-code]").forEach(b=>b.addEventListener("click",()=>{const a=airports.find(x=>x.code===b.dataset.code); if(!a)return; if(airportTarget==="origin"){if(state.destination?.code===a.code)return;state.origin=a}else{if(state.origin.code===a.code)return;state.destination=a} syncRoute();closeSheets();}));}
  function openAirport(target){airportTarget=target; const title=$("#airportSheetTitle"); if(title)title.textContent=target==="origin"?"Bandara keberangkatan":"Bandara tujuan"; if(airportSearch)airportSearch.value="";renderAirports();openSheet(airportSheet);setTimeout(()=>airportSearch?.focus(),100);}
  $("#originBtn")?.addEventListener("click",()=>openAirport("origin")); $("#destinationBtn")?.addEventListener("click",()=>openAirport("destination")); airportSearch?.addEventListener("input",e=>renderAirports(e.target.value));
  $("#swapRouteBtn")?.addEventListener("click",()=>{if(!state.destination)return;[state.origin,state.destination]=[state.destination,state.origin];syncRoute();});

  const now=new Date(), today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  const fmt=v=>{if(!v)return"Pilih tanggal";return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v+"T00:00:00"));};
  const depart=$("#departDateInput"), ret=$("#returnDateInput"); if(depart)depart.min=today;if(ret)ret.min=today;
  depart?.addEventListener("change",()=>{state.departDate=depart.value;$("#departDateText").textContent=fmt(state.departDate);if(ret)ret.min=state.departDate||today;if(state.returnDate&&state.returnDate<state.departDate){state.returnDate="";ret.value="";$("#returnDateText").textContent="Pilih tanggal";}});
  ret?.addEventListener("change",()=>{state.returnDate=ret.value;$("#returnDateText").textContent=fmt(state.returnDate);});

  const passengerSheet=$("#passengerSheet"), counts={adult:$("#adultCount"),child:$("#childCount"),infant:$("#infantCount")};
  function openPassengers(context){state.passengerContext=context;counts.adult.textContent=state.adult;counts.child.textContent=state.child;counts.infant.textContent=Math.min(state.infant,state.adult);openSheet(passengerSheet);}
  $("#passengerBtn")?.addEventListener("click",()=>openPassengers("flight")); $("#trainPassengerBtn")?.addEventListener("click",()=>openPassengers("train"));
  $$("[data-counter]").forEach(btn=>btn.addEventListener("click",()=>{const type=btn.dataset.counter,step=Number(btn.dataset.step);let n=Number(counts[type].textContent)+step;if(type==="adult")n=Math.max(1,Math.min(9,n));else n=Math.max(0,Math.min(8,n));counts[type].textContent=n;if(type==="adult"&&Number(counts.infant.textContent)>n)counts.infant.textContent=n;if(type==="infant"&&n>Number(counts.adult.textContent))counts.infant.textContent=counts.adult.textContent;}));
  $("#confirmPassengerBtn")?.addEventListener("click",()=>{state.adult=Number(counts.adult.textContent);state.child=Number(counts.child.textContent);state.infant=Math.min(Number(counts.infant.textContent),state.adult);const parts=[`${state.adult} Dewasa`];if(state.child)parts.push(`${state.child} Anak`);if(state.infant)parts.push(`${state.infant} Bayi`);const text=parts.join(", ");if(state.passengerContext==="train")$("#trainPassengerText").textContent=text;else $("#passengerText").textContent=text;closeSheets();});

  const cabinSheet=$("#cabinSheet"); $("#cabinBtn")?.addEventListener("click",()=>openSheet(cabinSheet)); $$(".cabin-option").forEach(btn=>btn.addEventListener("click",()=>{state.cabin=btn.dataset.cabin||"Ekonomi";$$(".cabin-option").forEach(x=>x.classList.toggle("active",x===btn));$("#cabinText").textContent=state.cabin;closeSheets();}));

  let selectionMode=""; const selectionSheet=$("#selectionSheet"), selectionList=$("#selectionList"), selectionSearch=$("#selectionSearch");
  function renderSelection(q=""){q=q.trim().toLowerCase();if(!selectionList)return;if(selectionMode==="hotelCity"){const rows=hotelCities.filter(x=>!q||x.toLowerCase().includes(q));selectionList.innerHTML=rows.map(x=>`<button class="airport-option" type="button" data-value="${x}"><span class="code">⌂</span><span class="airport-main"><strong>${x}</strong><small>Kota / area menginap</small></span><span class="select-mark">›</span></button>`).join("")}else{const rows=stations.filter(x=>!q||`${x.code} ${x.city} ${x.name}`.toLowerCase().includes(q));selectionList.innerHTML=rows.map(x=>`<button class="airport-option" type="button" data-value="${x.code}"><span class="code">${x.code}</span><span class="airport-main"><strong>${x.name}</strong><small>${x.city}</small></span><span class="select-mark">›</span></button>`).join("")} selectionList.querySelectorAll("[data-value]").forEach(b=>b.addEventListener("click",()=>{if(selectionMode==="hotelCity"){state.hotelCity=b.dataset.value;$("#hotelCityText").textContent=state.hotelCity}else{const st=stations.find(x=>x.code===b.dataset.value);if(!st)return;if(selectionMode==="trainOrigin"){if(state.trainDestination?.code===st.code)return;state.trainOrigin=st;$("#trainOriginText").textContent=`${st.name} (${st.code})`}else{if(state.trainOrigin?.code===st.code)return;state.trainDestination=st;$("#trainDestinationText").textContent=`${st.name} (${st.code})`}}closeSheets();}));}
  function openSelection(mode,title,kicker,placeholder){selectionMode=mode;$("#selectionTitle").textContent=title;$("#selectionKicker").textContent=kicker;selectionSearch.value="";selectionSearch.placeholder=placeholder;renderSelection();openSheet(selectionSheet);setTimeout(()=>selectionSearch.focus(),100);}
  $("#trainOriginBtn")?.addEventListener("click",()=>openSelection("trainOrigin","Pilih stasiun asal","KERETA","Cari kota atau stasiun")); $("#trainDestinationBtn")?.addEventListener("click",()=>openSelection("trainDestination","Pilih stasiun tujuan","KERETA","Cari kota atau stasiun")); $("#hotelCityBtn")?.addEventListener("click",()=>openSelection("hotelCity","Pilih kota / area","HOTEL","Cari kota tujuan")); selectionSearch?.addEventListener("input",e=>renderSelection(e.target.value));
  const trainDate=$("#trainDateInput"), checkin=$("#hotelCheckinInput"), checkout=$("#hotelCheckoutInput"); [trainDate,checkin,checkout].forEach(x=>{if(x)x.min=today});
  trainDate?.addEventListener("change",()=>{state.trainDate=trainDate.value;$("#trainDateText").textContent=fmt(state.trainDate)}); checkin?.addEventListener("change",()=>{state.hotelCheckin=checkin.value;$("#hotelCheckinText").textContent=fmt(state.hotelCheckin);if(checkout)checkout.min=state.hotelCheckin||today;if(state.hotelCheckout&&state.hotelCheckout<=state.hotelCheckin){state.hotelCheckout="";checkout.value="";$("#hotelCheckoutText").textContent="Pilih tanggal";}}); checkout?.addEventListener("change",()=>{state.hotelCheckout=checkout.value;$("#hotelCheckoutText").textContent=fmt(state.hotelCheckout)});

  function pickDate(input){if(!input)return;try{if(typeof input.showPicker==="function")input.showPicker();else input.click();}catch{input.click();}}
  $("#searchFlightBtn")?.addEventListener("click",()=>{if(!state.destination)return openAirport("destination");if(!state.departDate)return pickDate(depart);if(state.tripType==="roundtrip"&&!state.returnDate)return pickDate(ret);const p=new URLSearchParams({origin:state.origin.code,destination:state.destination.code,depart:state.departDate,trip:state.tripType,adults:String(state.adult),children:String(state.child),infants:String(state.infant),cabin:state.cabin});if(state.returnDate)p.set("return",state.returnDate);navigateTo(`${ROUTES.flightSearch}?${p}`);});
  $("#searchTrainBtn")?.addEventListener("click",()=>{if(!state.trainOrigin)return $("#trainOriginBtn")?.click();if(!state.trainDestination)return $("#trainDestinationBtn")?.click();if(!state.trainDate)return pickDate(trainDate);const p=new URLSearchParams({origin:state.trainOrigin.code,destination:state.trainDestination.code,depart:state.trainDate,adults:String(state.adult),children:String(state.child),infants:String(state.infant)});navigateTo(`${ROUTES.trainSearch}?${p}`);});
  $("#searchHotelBtn")?.addEventListener("click",()=>{if(!state.hotelCity)return $("#hotelCityBtn")?.click();if(!state.hotelCheckin)return pickDate(checkin);if(!state.hotelCheckout)return pickDate(checkout);const p=new URLSearchParams({city:state.hotelCity,checkin:state.hotelCheckin,checkout:state.hotelCheckout,guests:String(state.adult+state.child),rooms:"1"});navigateTo(`${ROUTES.hotelSearch}?${p}`);});

  const nav={homeNav:"home",ordersNav:"orders",requestNav:"request",notificationsNav:"notifications",profileNav:"profile",notificationBtn:"notifications",profileBtn:"profile",profileAvatarBtn:"profile",activeOrdersCard:"orders",invoiceStatusCard:"invoice",requestQuickBtn:"request",ordersQuickBtn:"orders",invoiceQuickBtn:"invoice",servicesBtn:"services",historyBtn:"history",helpBtn:"help"};
  Object.entries(nav).forEach(([id,key])=>$("#"+id)?.addEventListener("click",()=>navigateTo(ROUTES[key])));
}
