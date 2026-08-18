/* OTW HOME V8 — All UI controls functional */

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  hydrateProfile();
});

async function hydrateProfile(){
  try{
    const [{ requireAuth }, { getMyProfile }] = await Promise.all([
      import("./guard.js"),
      import("./profile-service.js")
    ]);
    const session = await requireAuth({redirect:"login.html"});
    if(!session) return;
    const profile = await getMyProfile();
    const fullName = profile?.full_name || "Pengguna";
    const firstName = fullName.trim().split(/\s+/)[0];
    document.querySelector("#greeting").textContent = `Halo, ${firstName}`;
    document.querySelector("#avatar").textContent = fullName.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "OT";
  }catch(err){
    console.error("[OTW] Profile load gagal, UI tetap aktif:",err);
  }
}

function initUI(){
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const state = {
    tripType:"oneway",
    origin:{code:"BTH",city:"Batam",name:"Hang Nadim International Airport"},
    destination:null,
    departDate:"",
    returnDate:"",
    adult:1,child:0,infant:0,
    cabin:"Ekonomi"
  };
  window.__OTW_SEARCH_STATE__ = state;

  const airports = [
    ["BTH","Batam","Hang Nadim International Airport"],
    ["CGK","Jakarta","Soekarno-Hatta International Airport"],
    ["HLP","Jakarta","Halim Perdanakusuma Airport"],
    ["DPS","Denpasar","I Gusti Ngurah Rai International Airport"],
    ["SUB","Surabaya","Juanda International Airport"],
    ["KNO","Medan","Kualanamu International Airport"],
    ["UPG","Makassar","Sultan Hasanuddin International Airport"],
    ["YIA","Yogyakarta","Yogyakarta International Airport"],
    ["SRG","Semarang","Jenderal Ahmad Yani International Airport"],
    ["PLM","Palembang","Sultan Mahmud Badaruddin II Airport"],
    ["PKU","Pekanbaru","Sultan Syarif Kasim II Airport"],
    ["PDG","Padang","Minangkabau International Airport"],
    ["BDJ","Banjarmasin","Syamsudin Noor International Airport"],
    ["BPN","Balikpapan","Sultan Aji Muhammad Sulaiman Sepinggan Airport"],
    ["SOC","Solo","Adi Soemarmo International Airport"],
    ["PNK","Pontianak","Supadio International Airport"],
    ["TKG","Bandar Lampung","Radin Inten II Airport"],
    ["LOP","Lombok","Zainuddin Abdul Madjid International Airport"]
  ].map(([code,city,name])=>({code,city,name}));

  const backdrop=$("#sheetBackdrop");
  const sheets=$$(".bottom-sheet");
  let toastTimer;

  function showToast(text){
    const el=$("#toast");
    if(!el) return;
    clearTimeout(toastTimer);
    el.textContent=text;
    el.classList.add("show");
    toastTimer=setTimeout(()=>el.classList.remove("show"),2200);
  }

  function openSheet(sheet){
    if(!sheet) return;
    sheets.forEach(s=>{s.classList.remove("show");s.setAttribute("aria-hidden","true")});
    sheet.classList.add("show");
    sheet.setAttribute("aria-hidden","false");
    backdrop?.classList.add("show");
    document.body.style.overflow="hidden";
  }
  function closeSheets(){
    sheets.forEach(s=>{s.classList.remove("show");s.setAttribute("aria-hidden","true")});
    backdrop?.classList.remove("show");
    document.body.style.overflow="";
  }
  backdrop?.addEventListener("click",closeSheets);
  $$("[data-close-sheet]").forEach(b=>b.addEventListener("click",closeSheets));
  $("#actionSheetClose")?.addEventListener("click",closeSheets);

  function showAction(title,text){
    $("#actionSheetTitle").textContent=title;
    $("#actionSheetText").textContent=text;
    openSheet($("#actionSheet"));
  }

  // tabs
  const panels={flight:$("#flightPanel"),train:$("#trainPanel"),hotel:$("#hotelPanel")};
  $$(".travel-tab").forEach(tab=>tab.addEventListener("click",()=>{
    $$(".travel-tab").forEach(x=>x.classList.remove("active"));
    Object.values(panels).forEach(x=>x?.classList.remove("active"));
    tab.classList.add("active");
    panels[tab.dataset.tab]?.classList.add("active");
  }));

  // trip type
  $$(".trip-type").forEach(btn=>btn.addEventListener("click",()=>{
    $$(".trip-type").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    state.tripType=btn.dataset.trip;
    const round=state.tripType==="roundtrip";
    $("#returnDateBtn").hidden=!round;
    $("#tripTypeLabel").textContent=round?"Pulang-pergi":"Sekali jalan";
    if(!round){
      state.returnDate="";
      $("#returnDateText").textContent="Pilih tanggal";
    }
  }));

  // airport sheet
  let airportTarget="destination";
  function renderAirports(q=""){
    const list=airports.filter(a=>!q || `${a.code} ${a.city} ${a.name}`.toLowerCase().includes(q.toLowerCase()));
    $("#airportList").innerHTML=list.map(a=>`
      <button class="airport-option" type="button" data-code="${a.code}">
        <span class="code">${a.code}</span>
        <span class="airport-main"><strong>${a.city}</strong><small>${a.name}</small></span>
        <span class="select-mark">›</span>
      </button>`).join("");
    $("#airportList").querySelectorAll(".airport-option").forEach(b=>b.addEventListener("click",()=>{
      const a=airports.find(x=>x.code===b.dataset.code);
      if(!a) return;
      if(airportTarget==="origin"){
        if(state.destination?.code===a.code) state.destination=state.origin;
        state.origin=a;
      }else{
        if(state.origin.code===a.code){showToast("Bandara asal dan tujuan tidak boleh sama.");return}
        state.destination=a;
      }
      syncRoute();
      closeSheets();
    }));
  }
  function openAirport(target){
    airportTarget=target;
    $("#airportSheetTitle").textContent=target==="origin"?"Bandara keberangkatan":"Bandara tujuan";
    $("#airportSearch").value="";
    renderAirports();
    openSheet($("#airportSheet"));
    setTimeout(()=>$("#airportSearch")?.focus(),180);
  }
  $("#originBtn")?.addEventListener("click",()=>openAirport("origin"));
  $("#destinationBtn")?.addEventListener("click",()=>openAirport("destination"));
  $("#airportSearch")?.addEventListener("input",e=>renderAirports(e.target.value));
  function syncRoute(){
    $("#originCode").textContent=state.origin.code;
    $("#originCity").textContent=state.origin.city;
    $("#destinationCode").textContent=state.destination?.code||"—";
    $("#destinationCity").textContent=state.destination?.city||"Pilih tujuan";
    $("#destinationCode").classList.toggle("muted-code",!state.destination);
  }
  $("#swapRouteBtn")?.addEventListener("click",()=>{
    if(!state.destination){openAirport("destination");return}
    [state.origin,state.destination]=[state.destination,state.origin];
    syncRoute();
  });

  // custom calendar
  const cal={
    target:"depart",
    cursor:new Date(new Date().getFullYear(),new Date().getMonth(),1)
  };
  function isoDate(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function parseISO(v){
    if(!v) return null;
    const [y,m,d]=v.split("-").map(Number);
    return new Date(y,m-1,d);
  }
  function formatDate(v){
    const d=parseISO(v);
    if(!d) return "Pilih tanggal";
    return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d);
  }
  function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
  function openCalendar(target){
    cal.target=target;
    const selected=parseISO(target==="depart"?state.departDate:state.returnDate);
    const base=selected || (target==="return"&&state.departDate?parseISO(state.departDate):new Date());
    cal.cursor=new Date(base.getFullYear(),base.getMonth(),1);
    $("#calendarTitle").textContent=target==="depart"?"Pilih tanggal berangkat":"Pilih tanggal pulang";
    renderCalendar();
    openSheet($("#calendarSheet"));
  }
  function renderCalendar(){
    const year=cal.cursor.getFullYear(), month=cal.cursor.getMonth();
    $("#calendarMonthLabel").textContent=new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric"}).format(cal.cursor);
    const first=new Date(year,month,1);
    const firstIndex=(first.getDay()+6)%7; // monday=0
    const start=new Date(year,month,1-firstIndex);
    const today=new Date(); today.setHours(0,0,0,0);
    const minReturn=state.departDate?parseISO(state.departDate):today;
    const selected=parseISO(cal.target==="depart"?state.departDate:state.returnDate);
    const days=[];
    for(let i=0;i<42;i++){
      const d=new Date(start); d.setDate(start.getDate()+i); d.setHours(0,0,0,0);
      const outside=d.getMonth()!==month;
      const disabled=cal.target==="depart"?d<today:d<minReturn;
      days.push(`<button class="calendar-day ${outside?"outside":""} ${sameDay(d,today)?"today":""} ${sameDay(d,selected)?"selected":""}" type="button" data-date="${isoDate(d)}" ${disabled?"disabled":""}>${d.getDate()}</button>`);
    }
    $("#calendarGrid").innerHTML=days.join("");
    $("#calendarGrid").querySelectorAll(".calendar-day:not(:disabled)").forEach(b=>b.addEventListener("click",()=>{
      const value=b.dataset.date;
      if(cal.target==="depart"){
        state.departDate=value;
        $("#departDateText").textContent=formatDate(value);
        if(state.returnDate && parseISO(state.returnDate)<parseISO(value)){
          state.returnDate="";
          $("#returnDateText").textContent="Pilih tanggal";
        }
      }else{
        state.returnDate=value;
        $("#returnDateText").textContent=formatDate(value);
      }
      closeSheets();
    }));
  }
  $("#calendarPrev")?.addEventListener("click",()=>{cal.cursor.setMonth(cal.cursor.getMonth()-1);renderCalendar()});
  $("#calendarNext")?.addEventListener("click",()=>{cal.cursor.setMonth(cal.cursor.getMonth()+1);renderCalendar()});
  $("#departDateBtn")?.addEventListener("click",()=>openCalendar("depart"));
  $("#returnDateBtn")?.addEventListener("click",()=>openCalendar("return"));

  // passenger
  const counts={adult:$("#adultCount"),child:$("#childCount"),infant:$("#infantCount")};
  $("#passengerBtn")?.addEventListener("click",()=>{
    counts.adult.textContent=state.adult;counts.child.textContent=state.child;counts.infant.textContent=state.infant;
    openSheet($("#passengerSheet"));
  });
  $$("[data-counter]").forEach(btn=>btn.addEventListener("click",()=>{
    const type=btn.dataset.counter, step=Number(btn.dataset.step);
    let n=Number(counts[type].textContent)+step;
    n=type==="adult"?Math.max(1,Math.min(9,n)):Math.max(0,Math.min(8,n));
    if(type==="infant") n=Math.min(n,Number(counts.adult.textContent));
    counts[type].textContent=n;
  }));
  $("#confirmPassengerBtn")?.addEventListener("click",()=>{
    state.adult=Number(counts.adult.textContent);state.child=Number(counts.child.textContent);state.infant=Number(counts.infant.textContent);
    const arr=[`${state.adult} Dewasa`];
    if(state.child)arr.push(`${state.child} Anak`);if(state.infant)arr.push(`${state.infant} Bayi`);
    $("#passengerText").textContent=arr.join(", ");
    closeSheets();
  });

  // cabin
  $("#cabinBtn")?.addEventListener("click",()=>openSheet($("#cabinSheet")));
  $$(".cabin-option").forEach(btn=>btn.addEventListener("click",()=>{
    $$(".cabin-option").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    state.cabin=btn.dataset.cabin;
    $("#cabinText").textContent=state.cabin;
    closeSheets();
  }));

  // search
  $("#searchFlightBtn")?.addEventListener("click",()=>{
    if(!state.destination){openAirport("destination");return}
    if(!state.departDate){openCalendar("depart");return}
    if(state.tripType==="roundtrip"&&!state.returnDate){openCalendar("return");return}
    const p=new URLSearchParams({
      origin:state.origin.code,destination:state.destination.code,depart:state.departDate,
      trip:state.tripType,adults:state.adult,children:state.child,infants:state.infant,cabin:state.cabin
    });
    if(state.returnDate)p.set("return",state.returnDate);
    location.href=`search-flight.html?${p.toString()}`;
  });

  // all remaining actions
  $("#notificationBtn")?.addEventListener("click",()=>showAction("Notifikasi","Belum ada notifikasi baru. Status booking, pembayaran, dan perjalanan akan muncul di sini."));
  $("#profileBtn")?.addEventListener("click",()=>showAction("Akun OTW","Profil, data identitas, KTP, keamanan akun, dan pengaturan akan dikelola dari halaman Akun."));
  $("#profileNav")?.addEventListener("click",()=>showAction("Akun OTW","Halaman akun akan memuat profil, dokumen, keamanan, dan pengaturan pengguna."));
  $("#helpBtn")?.addEventListener("click",()=>showAction("Pusat Bantuan","Bantuan pemesanan, perubahan jadwal, refund, invoice, dan perjalanan dinas akan tersedia di sini."));
  $$("[data-action]").forEach(btn=>btn.addEventListener("click",()=>showAction(btn.dataset.action,`${btn.dataset.action} sudah terhubung sebagai aksi. Halaman detailnya akan kita bangun pada tahap berikutnya.`)));
  $$("[data-nav]").forEach(btn=>btn.addEventListener("click",()=>{
    const nav=btn.dataset.nav;
    $$(".nav-item").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    if(nav==="home") {showToast("Anda sudah berada di Home.");return}
    if(nav==="orders") showAction("Pesanan","Daftar pesanan aktif, selesai, refund, dan riwayat perjalanan akan tampil di sini.");
    if(nav==="apply") showAction("Ajukan Perjalanan","Form pengajuan perjalanan dinas dan upload SPT akan dibuka dari menu ini.");
    if(nav==="notifications") showAction("Notifikasi","Semua pembaruan booking dan perjalanan akan tampil di sini.");
    if(nav==="account") showAction("Akun","Profil pengguna dan pengaturan OTW akan tampil di sini.");
  }));
}
