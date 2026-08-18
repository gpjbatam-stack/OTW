import { requireAuth } from "./guard.js";

await requireAuth({ redirect: "login.html" });

const SUPABASE_URL = "https://vumyxlbybhlaicubtgun.supabase.co";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/jetwize-search`;

const qs = new URLSearchParams(location.search);
const search = {
  origin: qs.get("origin") || "BTH",
  destination: qs.get("destination") || "",
  depart: qs.get("depart") || "",
  return: qs.get("return") || "",
  trip: qs.get("trip") || "oneway",
  adults: Number(qs.get("adults") || 1),
  children: Number(qs.get("children") || 0),
  infants: Number(qs.get("infants") || 0),
  cabin: qs.get("cabin") || "Ekonomi",
};

const els = {
  routeTitle: document.querySelector("#routeTitle"),
  routeMeta: document.querySelector("#routeMeta"),
  summaryOrigin: document.querySelector("#summaryOrigin"),
  summaryDestination: document.querySelector("#summaryDestination"),
  summaryDate: document.querySelector("#summaryDate"),
  summaryPassengers: document.querySelector("#summaryPassengers"),
  summaryCabin: document.querySelector("#summaryCabin"),
  loading: document.querySelector("#loadingState"),
  error: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  empty: document.querySelector("#emptyState"),
  list: document.querySelector("#flightList"),
  count: document.querySelector("#resultCount"),
};

let flights = [];
let sortMode = "recommended";
let stopFilter = "all";
let timeFilter = null;

function formatDate(value) {
  if (!value) return "Tanggal belum dipilih";
  const d = new Date(value + "T00:00:00");
  return new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"}).format(d);
}
function formatCurrency(value,currency="IDR") {
  return new Intl.NumberFormat("id-ID",{style:"currency",currency,maximumFractionDigits:0}).format(Number(value||0));
}
function formatDuration(mins) {
  const n=Number(mins||0); const h=Math.floor(n/60); const m=n%60;
  return h ? `${h}j ${m ? m+"m":""}` : `${m}m`;
}
function timeOnly(value) {
  if (!value) return "--:--";
  const match = String(value).match(/T(\\d{2}):(\\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  return String(value).slice(0,5);
}
function passengerLabel() {
  const arr=[`${search.adults} Dewasa`];
  if(search.children) arr.push(`${search.children} Anak`);
  if(search.infants) arr.push(`${search.infants} Bayi`);
  return arr.join(", ");
}

function syncHeader(){
  els.routeTitle.textContent=`${search.origin} → ${search.destination || "—"}`;
  els.routeMeta.textContent=`${formatDate(search.depart)} · ${passengerLabel()}`;
  els.summaryOrigin.textContent=search.origin;
  els.summaryDestination.textContent=search.destination || "—";
  els.summaryDate.textContent=formatDate(search.depart);
  els.summaryPassengers.textContent=passengerLabel();
  els.summaryCabin.textContent=search.cabin;
}
syncHeader();

function normalizedFare(f) {
  // Harga supplier asli. Markup akan diambil dari setting Admin pada tahap pricing.
  return Number(f.supplierTotalPrice ?? 0);
}

function normalizeOffer(offer) {
  const segments = Array.isArray(offer.segments) ? offer.segments : [];
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || first;
  return {
    ...offer,
    airlineCode: first.carrier || "",
    airlineName: first.carrierName || first.carrier || "Maskapai",
    flightNumber: segments.map(s => s.flightNumber).filter(Boolean).join(" · "),
    departureTime: first.departureLocalTime || first.departureTime,
    arrivalTime: last.arrivalLocalTime || last.arrivalTime,
    durationMinutes: Number(offer.totalDuration || 0),
    baggage: first.baggageAllowance || null,
    cabin: first.cabinClass || search.cabin,
    aircraft: first.aircraft || null
  };
}

function getSupabaseAccessToken() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
    try {
      const raw = JSON.parse(localStorage.getItem(key));
      const token = raw?.access_token || raw?.currentSession?.access_token || raw?.session?.access_token;
      if (token) return token;
    } catch {}
  }
  return sessionStorage.getItem("sb-access-token") || localStorage.getItem("sb-access-token");
}

async function searchFlights(searchData) {
  if (!searchData.destination) throw new Error("Pilih bandara tujuan terlebih dahulu.");
  if (!searchData.depart) throw new Error("Pilih tanggal keberangkatan terlebih dahulu.");

  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesi login Supabase tidak ditemukan. Silakan login ulang.");

  const cabinMap = {
    "Ekonomi": "ECONOMY",
    "Premium Ekonomi": "PREMIUM_ECONOMY",
    "Bisnis": "BUSINESS",
    "First": "FIRST"
  };

  const payload = {
    origin: searchData.origin,
    destination: searchData.destination,
    departDate: searchData.depart,
    passengers: {
      adult: searchData.adults,
      child: searchData.children,
      infant: searchData.infants
    },
    cabinClass: cabinMap[searchData.cabin] || "ECONOMY",
    route: "ALL"
  };

  if (searchData.trip === "roundtrip" && searchData.return) {
    payload.returnDate = searchData.return;
  }

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Pencarian gagal (${response.status})`);
  }
  return (Array.isArray(data.results) ? data.results : []).map(normalizeOffer);
}

function render(){
  let rows=[...flights];
  if(stopFilter!=="all") rows=rows.filter(f=>Number(f.stops??0)===Number(stopFilter));
  if(timeFilter){
    rows=rows.filter(f=>{
      const match=String(f.departureTime||"").match(/T(\\d{2}):/); const h=match?Number(match[1]):-1;
      if(timeFilter==="morning") return h>=0&&h<10;
      if(timeFilter==="day") return h>=10&&h<16;
      if(timeFilter==="evening") return h>=16&&h<19;
      return h>=19&&h<=23;
    });
  }
  if(sortMode==="cheapest") rows.sort((a,b)=>normalizedFare(a)-normalizedFare(b));
  if(sortMode==="fastest") rows.sort((a,b)=>Number(a.durationMinutes||99999)-Number(b.durationMinutes||99999));

  els.count.textContent=`${rows.length} penerbangan ditemukan`;
  els.list.innerHTML=rows.map((f,i)=>{
    const price=normalizedFare(f);
    const stops=Number(f.stops??0);
    return `<article class="flight-card">
      <div class="flight-top">
        <div class="airline-wrap">
          <div class="airline-logo">${f.airlineLogo?`<img src="${f.airlineLogo}" alt="">`:(f.airlineCode||"FL")}</div>
          <div class="airline-name">
            <strong>${f.airlineName||"Maskapai"}</strong>
            <small>${f.flightNumber||f.airlineCode||""} · ${f.cabin||search.cabin}</small>
          </div>
        </div>
        <span class="badge">${stops===0?"Langsung":stops+" transit"}</span>
      </div>
      <div class="flight-times">
        <div class="time-block"><strong>${timeOnly(f.departureTime)}</strong><small>${search.origin}</small></div>
        <div class="duration">
          <div class="duration-line"><span></span><i></i><svg viewBox="0 0 24 24"><path d="m3 11 18-7-7 18-3-8-8-3Z"/></svg><i></i><span></span></div>
          <small>${formatDuration(f.durationMinutes)} · ${stops===0?"langsung":stops+" transit"}</small>
        </div>
        <div class="time-block right"><strong>${timeOnly(f.arrivalTime)}</strong><small>${search.destination}</small></div>
      </div>
      <div class="flight-info">
        <span class="info-pill"><svg viewBox="0 0 24 24"><path d="M7 5h10v14H7z"/><path d="M9 5V3h6v2"/></svg>${f.baggage||"Bagasi sesuai fare"}</span>
        <span class="info-pill">Harga real-time</span>
      </div>
      <div class="fare-row">
        <div class="fare-copy">
          <small>Harga supplier saat ini</small>
          <strong>${formatCurrency(price,f.currency||"IDR")}</strong>
          <em>Markup & biaya layanan OTW belum diterapkan</em>
        </div>
        <button class="select-flight" data-index="${i}">Pilih</button>
      </div>
    </article>`;
  }).join("");
  els.list.querySelectorAll(".select-flight").forEach(btn=>{
    btn.addEventListener("click",()=>selectFlight(rows[Number(btn.dataset.index)]));
  });
}

function selectFlight(f){
  sessionStorage.setItem("otw_selected_flight",JSON.stringify(f));
  sessionStorage.setItem("otw_search",JSON.stringify(search));
  window.location.href="flight-detail.html";
}

async function loadFlights(){
  els.loading.classList.remove("hidden"); els.error.classList.add("hidden"); els.empty.classList.add("hidden"); els.list.classList.add("hidden");
  els.count.textContent="Mencari penerbangan...";
  try{
    flights=await searchFlights(search);
    els.loading.classList.add("hidden");
    if(!flights.length){els.empty.classList.remove("hidden");els.count.textContent="Tidak ada penerbangan";return;}
    els.list.classList.remove("hidden"); render();
  }catch(err){
    console.error(err);
    els.loading.classList.add("hidden"); els.error.classList.remove("hidden");
    els.count.textContent="Pencarian belum tersedia";
    els.errorMessage.textContent=err.message==="JETWIZE_NOT_CONFIGURED"
      ?"Adapter Jetwize sudah siap, tetapi endpoint dan autentikasi resmi Jetwize belum dimasukkan."
      :(err.message||"Terjadi kesalahan saat mengambil penerbangan.");
  }
}
loadFlights();

document.querySelector("#backBtn").onclick=()=>history.back();
document.querySelector("#editBtn").onclick=()=>location.href="home.html";
document.querySelector("#changeSearchBtn").onclick=()=>location.href="home.html";
document.querySelector("#retryBtn").onclick=loadFlights;

document.querySelectorAll(".filter-chip[data-filter]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".filter-chip[data-filter]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); sortMode=btn.dataset.filter; render();
  });
});

const sheet=document.querySelector("#filterSheet"),backdrop=document.querySelector("#sheetBackdrop");
function openSheet(){sheet.classList.add("show");backdrop.classList.add("show");sheet.setAttribute("aria-hidden","false")}
function closeSheet(){sheet.classList.remove("show");backdrop.classList.remove("show");sheet.setAttribute("aria-hidden","true")}
document.querySelector("#filterBtn").onclick=openSheet;
document.querySelector("#closeFilterBtn").onclick=closeSheet;
backdrop.onclick=closeSheet;

document.querySelectorAll("[data-stop]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-stop]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");stopFilter=btn.dataset.stop;
});
document.querySelectorAll("[data-time]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-time]").forEach(b=>b.classList.remove("active"));
  if(timeFilter===btn.dataset.time){timeFilter=null}else{btn.classList.add("active");timeFilter=btn.dataset.time}
});
document.querySelector("#applyFilterBtn").onclick=()=>{render();closeSheet()};
