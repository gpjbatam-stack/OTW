import { supabase } from "./supabase.js";

console.info("[LetsGo] search-flight public browsing enabled");

const SUPABASE_URL = "https://vumyxlbybhlaicubtgun.supabase.co";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/jetwize-search`;

const AIRPORTS = Object.freeze({
  BTH: "Hang Nadim",
  CGK: "Soekarno-Hatta",
  DPS: "I Gusti Ngurah Rai",
  SUB: "Juanda",
  KNO: "Kualanamu",
  PKU: "Sultan Syarif Kasim II",
  PLM: "Sultan Mahmud Badaruddin II",
  BPN: "Sultan Aji Muhammad Sulaiman",
  UPG: "Sultan Hasanuddin",
  SOC: "Adi Soemarmo",
  YIA: "Yogyakarta International"
});

const AIRLINE_LOGOS = Object.freeze({
  GA: "GA.png",
  JT: "JT.png",
  QG: "QG.png",
  ID: "ID.png",
  IU: "IU.png",
  "8B": "8B.png",
  IN: "IN.png",
  IP: "IP.png",
  IW: "IW.png",
  QZ: "QZ.png",
  SJ: "SJ.png"
});
const AIRLINE_NAME_TO_CODE = Object.freeze({
  "garuda indonesia": "GA",
  "lion air": "JT",
  "citilink": "QG",
  "batik air": "ID",
  "super air jet": "IU",
  "transnusa": "8B",
  "nam air": "IN",
  "pelita air": "IP",
  "wings air": "IW",
  "indonesia airasia": "QZ",
  "airasia indonesia": "QZ",
  "sriwijaya air": "SJ"
});


const qs = new URLSearchParams(location.search);
const search = {
  origin: (qs.get("origin") || "BTH").toUpperCase(),
  destination: (qs.get("destination") || "").toUpperCase(),
  depart: qs.get("depart") || "",
  return: qs.get("return") || "",
  trip: (qs.get("trip") || "oneway").toLowerCase(),
  adults: Math.max(1, Number(qs.get("adults") || 1)),
  children: Math.max(0, Number(qs.get("children") || 0)),
  infants: Math.max(0, Number(qs.get("infants") || 0)),
  cabin: qs.get("cabin") || "Ekonomi"
};

if (search.trip === "oneway") search.return = "";

const CABIN_MAP = Object.freeze({
  ekonomi: "ECONOMY",
  economy: "ECONOMY",
  "premium ekonomi": "PREMIUM_ECONOMY",
  "premium economy": "PREMIUM_ECONOMY",
  bisnis: "BUSINESS",
  business: "BUSINESS",
  first: "FIRST"
});

const els = {
  routeTitle: document.querySelector("#routeTitle"),
  routeMeta: document.querySelector("#routeMeta"),
  summaryOrigin: document.querySelector("#summaryOrigin"),
  summaryDestination: document.querySelector("#summaryDestination"),
  summaryDate: document.querySelector("#summaryDate"),
  summaryPassengers: document.querySelector("#summaryPassengers"),
  summaryCabin: document.querySelector("#summaryCabin"),
  originCity: document.querySelector("#originCity"),
  destinationCity: document.querySelector("#destinationCity"),
  loading: document.querySelector("#loadingState"),
  error: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  empty: document.querySelector("#emptyState"),
  list: document.querySelector("#flightList"),
  count: document.querySelector("#resultCount")
};

let flights = [];
let sortMode = "recommended";
let stopFilter = "all";
let timeFilter = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function formatDate(value) {
  if (!value) return "Tanggal belum dipilih";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  }).format(d);
}

function formatCurrency(value, currency = "IDR") {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency, maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDuration(minutes) {
  const n = Math.max(0, Number(minutes || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}j${m ? ` ${m}m` : ""}` : `${m}m`;
}

function timeOnly(value) {
  if (!value) return "--:--";
  const text = String(value).trim();
  const iso = text.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const plain = text.match(/^(\d{2}):(\d{2})/);
  return plain ? `${plain[1]}:${plain[2]}` : "--:--";
}

function hourOnly(value) {
  const t = timeOnly(value);
  return t === "--:--" ? -1 : Number(t.slice(0, 2));
}

function passengerLabel() {
  const arr = [`${search.adults} Dewasa`];
  if (search.children) arr.push(`${search.children} Anak`);
  if (search.infants) arr.push(`${search.infants} Bayi`);
  return arr.join(", ");
}

function syncHeader() {
  els.routeTitle.textContent = `${search.origin} → ${search.destination || "—"}`;
  els.routeMeta.textContent = `${formatDate(search.depart)} · ${passengerLabel()}`;
  els.summaryOrigin.textContent = search.origin;
  els.summaryDestination.textContent = search.destination || "—";
  els.summaryDate.textContent = formatDate(search.depart);
  els.summaryPassengers.textContent = passengerLabel();
  els.summaryCabin.textContent = search.cabin;
  els.originCity.textContent = AIRPORTS[search.origin] || "Bandara asal";
  els.destinationCity.textContent = AIRPORTS[search.destination] || "Bandara tujuan";
}
syncHeader();

function normalizeOffer(offer) {
  const segments = Array.isArray(offer.segments) ? offer.segments : [];
  const first = segments[0] || {};
  const last = segments[segments.length - 1] || first;

  return {
    offerId: offer.offerId || offer.id || "",
    fareBrand: offer.fareBrand || null,
    stops: Number(offer.stops ?? Math.max(0, segments.length - 1)),
    durationMinutes: Number(offer.totalDuration || 0),
    basePrice: Number(offer.basePrice || 0),
    tax: Number(offer.tax || 0),
    supplierTotalPrice: Number(offer.supplierTotalPrice ?? offer.totalPrice ?? 0),
    currency: offer.currency || "IDR",
    seatsAvailable: offer.seatsAvailable ?? null,
    expiresAt: offer.expiresAt || null,
    airlineCode: first.carrier || "",
    airlineName: first.carrierName || first.carrier || "Maskapai",
    flightNumber: segments.map(s => s.flightNumber).filter(Boolean).join(" · "),
    departureTime: first.departureLocalTime || first.departureTime || null,
    arrivalTime: last.arrivalLocalTime || last.arrivalTime || null,
    origin: first.origin || search.origin,
    destination: last.destination || search.destination,
    aircraft: first.aircraft || null,
    cabin: first.cabinClass || search.cabin,
    baggage: first.baggageAllowance || null,
    segments
  };
}

function resolveAirlineCode(code, airlineName = "") {
  const direct = String(code || "").trim().toUpperCase();
  if (AIRLINE_LOGOS[direct]) return direct;

  const byName = AIRLINE_NAME_TO_CODE[String(airlineName || "").trim().toLowerCase()];
  return byName || direct || "FL";
}

function airlineLogoMarkup(code, airlineName = "Maskapai") {
  const resolvedCode = resolveAirlineCode(code, airlineName);
  const src = AIRLINE_LOGOS[resolvedCode];

  if (!src) {
    return `<span class="airline-code-fallback">${escapeHtml(resolvedCode)}</span>`;
  }

  return `
    <img
      src="./${src}?v=20260819-logo-v8"
      alt="Logo ${escapeHtml(airlineName)}"
      title="${escapeHtml(airlineName)}"
      loading="eager"
      decoding="async"
      onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"
    >
    <span class="airline-code-fallback" style="display:none">${escapeHtml(resolvedCode)}</span>
  `;
}

function render() {
  let rows = [...flights];

  if (stopFilter !== "all") {
    rows = rows.filter(f => Number(f.stops) === Number(stopFilter));
  }

  if (timeFilter) {
    rows = rows.filter(f => {
      const h = hourOnly(f.departureTime);
      if (timeFilter === "morning") return h >= 0 && h < 10;
      if (timeFilter === "day") return h >= 10 && h < 16;
      if (timeFilter === "evening") return h >= 16 && h < 19;
      return h >= 19 && h <= 23;
    });
  }

  if (sortMode === "cheapest") {
    rows.sort((a, b) => a.supplierTotalPrice - b.supplierTotalPrice);
  } else if (sortMode === "fastest") {
    rows.sort((a, b) => a.durationMinutes - b.durationMinutes);
  }

  els.count.textContent = `${rows.length} penerbangan ditemukan`;

  if (!rows.length) {
    els.list.classList.add("hidden");
    els.empty.classList.remove("hidden");
    return;
  }

  els.empty.classList.add("hidden");
  els.list.classList.remove("hidden");

  els.list.innerHTML = rows.map((f, index) => {
    const stops = Number(f.stops || 0);
    const seats = f.seatsAvailable == null ? "—" : f.seatsAvailable;

    return `
      <article class="flight-card" data-carrier="${escapeHtml(f.airlineCode)}">
        <div class="flight-body">
          <div class="flight-head">
            <div class="airline-wrap">
              <div class="airline-logo">${airlineLogoMarkup(f.airlineCode, f.airlineName)}</div>
              <div class="airline-copy">
                <strong>${escapeHtml(f.airlineName)}</strong>
                <small>${escapeHtml(f.flightNumber || f.airlineCode)}${f.aircraft ? ` · ${escapeHtml(f.aircraft)}` : ""}</small>
              </div>
            </div>
            <span class="stop-badge">${stops === 0 ? "Langsung" : `${stops} Transit`}</span>
          </div>

          <div class="times">
            <div class="time">
              <strong>${timeOnly(f.departureTime)}</strong>
              <small>${escapeHtml(f.origin)}</small>
            </div>

            <div class="trip-line">
              <div class="trip-visual">
                <i></i>
                <svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg>
                <i></i>
              </div>
              <small>${formatDuration(f.durationMinutes)} · ${stops === 0 ? "langsung" : `${stops} transit`}</small>
            </div>

            <div class="time right">
              <strong>${timeOnly(f.arrivalTime)}</strong>
              <small>${escapeHtml(f.destination)}</small>
            </div>
          </div>

          <div class="info-grid">
            <div class="info">
              <svg viewBox="0 0 24 24"><path d="M7 5h10v14H7z"/><path d="M9 5V3h6v2"/></svg>
              <strong>${escapeHtml(f.baggage || "Sesuai fare")}</strong>
              <small>Bagasi</small>
            </div>
            <div class="info">
              <svg viewBox="0 0 24 24"><path d="M4 20h16V8H4z"/><path d="M8 8V4h8v4"/></svg>
              <strong>${escapeHtml(f.cabin || search.cabin)}</strong>
              <small>Kelas</small>
            </div>
            <div class="info">
              <svg viewBox="0 0 24 24"><path d="M6 19V7m0 8h8a4 4 0 0 0 0-8H6"/></svg>
              <strong>${escapeHtml(seats)}</strong>
              <small>Kursi</small>
            </div>
            <div class="info">
              <svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="16" r="1"/></svg>
              <strong>Live</strong>
              <small>Harga</small>
            </div>
          </div>
        </div>

        <div class="price-row">
          <div class="price-copy">
            <small>Harga supplier / orang</small>
            <strong class="price">${formatCurrency(f.supplierTotalPrice, f.currency)}</strong>
            <em>Markup & biaya layanan OTW belum diterapkan</em>
          </div>
          <button class="select-flight" data-index="${index}" type="button">Pilih</button>
        </div>
      </article>
    `;
  }).join("");

  els.list.querySelectorAll(".select-flight").forEach(btn => {
    btn.addEventListener("click", () => {
      selectFlight(rows[Number(btn.dataset.index)]);
    });
  });
}

async function selectFlight(flight) {
  const selected = {
    ...flight,
    selectedAt: new Date().toISOString(),
    searchSnapshot: { ...search }
  };

  sessionStorage.setItem("otw_selected_flight", JSON.stringify(selected));
  sessionStorage.setItem("otw_selected_offer_id", flight.offerId || "");
  sessionStorage.setItem("otw_search", JSON.stringify(search));

  // Browsing is public; booking starts here and requires an account.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    sessionStorage.setItem("letsgo_pending_booking_url", "flight-detail.html");
    location.href = "login.html?next=flight-detail.html";
    return;
  }

  location.href = "flight-detail.html";
}

async function postFlightSearch(payload) {
  // Flight browsing is public. Supabase client sends the project key automatically.
  // The Edge Function jetwize-search must be deployed as a public function
  // (verify_jwt = false) while keeping Jetwize credentials server-side.
  const {data,error}=await supabase.functions.invoke("jetwize-search",{body:payload});
  if(error){
    const status=Number(error?.context?.status||error?.status||0);
    if(status===401) throw new Error("Pencarian publik belum diaktifkan pada server LetsGo.");
    throw error;
  }
  return {response:{ok:true,status:200},data:data||{}};
}
async function searchFlights(searchData) {
  if (!searchData.destination) throw new Error("Pilih bandara tujuan terlebih dahulu.");
  if (!searchData.depart) throw new Error("Pilih tanggal keberangkatan terlebih dahulu.");

  const payload = {
    origin: searchData.origin,
    destination: searchData.destination,
    departDate: searchData.depart,
    passengers: {
      adult: searchData.adults,
      child: searchData.children,
      infant: searchData.infants
    },
    cabinClass: CABIN_MAP[String(searchData.cabin).toLowerCase()] || "ECONOMY",
    route: "ALL"
  };

  if (searchData.trip === "roundtrip" && searchData.return) {
    payload.returnDate = searchData.return;
  }

  const { response, data } = await postFlightSearch(payload);

  if (!response.ok || data?.error) {
    if (response.status === 401) {
      throw new Error("Sesi login tidak berlaku. Silakan logout, login kembali, lalu ulangi pencarian.");
    }

    throw new Error(
      data?.error?.message ||
      data?.message ||
      `Pencarian gagal (${response.status}).`
    );
  }

  return (Array.isArray(data.results) ? data.results : []).map(normalizeOffer);
}

async function loadFlights() {
  els.loading.classList.remove("hidden");
  els.error.classList.add("hidden");
  els.empty.classList.add("hidden");
  els.list.classList.add("hidden");
  els.count.textContent = "Mencari penerbangan...";

  try {
    flights = await searchFlights(search);
    els.loading.classList.add("hidden");

    if (!flights.length) {
      els.empty.classList.remove("hidden");
      els.count.textContent = "Tidak ada penerbangan";
      return;
    }

    render();
  } catch (err) {
    console.error("[OTW] flight search:", err);
    els.loading.classList.add("hidden");
    els.error.classList.remove("hidden");
    els.count.textContent = "Pencarian gagal";
    els.errorMessage.textContent = err?.message || "Terjadi kesalahan saat mengambil penerbangan.";
  }
}

document.querySelector("#backBtn")?.addEventListener("click", () => history.back());
document.querySelector("#editBtn")?.addEventListener("click", () => location.href = "home.html");
document.querySelector("#changeSearchBtn")?.addEventListener("click", () => location.href = "home.html");
document.querySelector("#retryBtn")?.addEventListener("click", loadFlights);

document.querySelectorAll(".sort-chip[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sort-chip[data-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    sortMode = btn.dataset.filter;
    render();
  });
});

const sheet = document.querySelector("#filterSheet");
const backdrop = document.querySelector("#sheetBackdrop");

function openSheet() {
  sheet.classList.add("show");
  backdrop.classList.add("show");
  sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() {
  sheet.classList.remove("show");
  backdrop.classList.remove("show");
  sheet.setAttribute("aria-hidden", "true");
}

document.querySelector("#filterBtn")?.addEventListener("click", openSheet);
document.querySelector("#closeFilterBtn")?.addEventListener("click", closeSheet);
backdrop?.addEventListener("click", closeSheet);

document.querySelectorAll("[data-stop]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-stop]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    stopFilter = btn.dataset.stop;
  });
});

document.querySelectorAll("[data-time]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-time]").forEach(b => b.classList.remove("active"));
    if (timeFilter === btn.dataset.time) {
      timeFilter = null;
    } else {
      btn.classList.add("active");
      timeFilter = btn.dataset.time;
    }
  });
});

document.querySelector("#applyFilterBtn")?.addEventListener("click", () => {
  render();
  closeSheet();
});

loadFlights();
