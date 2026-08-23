import { requireAuth } from "./guard.js";
import { getMyProfile } from "./profile-service.js";

await requireAuth({ redirect: "login.html" });

const greeting = document.querySelector("#greeting");
const avatar = document.querySelector("#avatar");

try {
  const profile = await getMyProfile();
  const fullName = profile?.full_name || "Pengguna";
  const firstName = fullName.trim().split(/\s+/)[0];

  greeting.textContent = `Halo, ${firstName}`;

  avatar.textContent = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "OT";
} catch (error) {
  console.error("[LetsGo] Gagal memuat profil:", error);
}

/* Primary travel actions
   Flight is handled on Home. Train/Hotel always navigate directly. */
document.querySelector("#flightTabBtn")?.addEventListener("click", () => {
  document.querySelector(".booking-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelector("#trainSearchBtn")?.addEventListener("click", () => {
  window.location.href = "search-train.html";
});

document.querySelector("#hotelSearchBtn")?.addEventListener("click", () => {
  window.location.href = "search-hotel.html";
});

/* Booking state */
const state = {
  tripType: "oneway",
  origin: { code: "BTH", city: "Batam", name: "Hang Nadim International Airport" },
  destination: null,
  departDate: "",
  returnDate: "",
  adult: 1,
  child: 0,
  infant: 0,
  cabin: "Ekonomi",
};
window.__LETSGO_SEARCH_STATE__ = state;

const airports = [
  { code:"BTH", city:"Batam", name:"Hang Nadim International Airport" },
  { code:"CGK", city:"Jakarta", name:"Soekarno-Hatta International Airport" },
  { code:"HLP", city:"Jakarta", name:"Halim Perdanakusuma Airport" },
  { code:"DPS", city:"Denpasar", name:"I Gusti Ngurah Rai International Airport" },
  { code:"SUB", city:"Surabaya", name:"Juanda International Airport" },
  { code:"KNO", city:"Medan", name:"Kualanamu International Airport" },
  { code:"UPG", city:"Makassar", name:"Sultan Hasanuddin International Airport" },
  { code:"JOG", city:"Yogyakarta", name:"Adisutjipto Airport" },
  { code:"YIA", city:"Yogyakarta", name:"Yogyakarta International Airport" },
  { code:"SRG", city:"Semarang", name:"Jenderal Ahmad Yani International Airport" },
  { code:"PLM", city:"Palembang", name:"Sultan Mahmud Badaruddin II Airport" },
  { code:"PKU", city:"Pekanbaru", name:"Sultan Syarif Kasim II Airport" },
  { code:"PDG", city:"Padang", name:"Minangkabau International Airport" },
  { code:"BDJ", city:"Banjarmasin", name:"Syamsudin Noor International Airport" },
  { code:"BPN", city:"Balikpapan", name:"Sultan Aji Muhammad Sulaiman Sepinggan Airport" },
  { code:"SOC", city:"Solo", name:"Adi Soemarmo International Airport" },
  { code:"PNK", city:"Pontianak", name:"Supadio International Airport" },
  { code:"TKG", city:"Bandar Lampung", name:"Radin Inten II Airport" },
  { code:"LOP", city:"Lombok", name:"Zainuddin Abdul Madjid International Airport" },
];

/* Generic sheet helpers */
const backdrop = document.querySelector("#sheetBackdrop");
const sheets = document.querySelectorAll(".bottom-sheet");

function openSheet(sheet) {
  sheets.forEach(s => s.classList.remove("show"));
  sheet.classList.add("show");
  sheet.setAttribute("aria-hidden", "false");
  backdrop.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeSheets() {
  sheets.forEach(s => {
    s.classList.remove("show");
    s.setAttribute("aria-hidden", "true");
  });
  backdrop.classList.remove("show");
  document.body.style.overflow = "";
}

backdrop.addEventListener("click", closeSheets);
document.querySelectorAll("[data-close-sheet]").forEach(btn => btn.addEventListener("click", closeSheets));

/* Trip type */
const tripTypeBtns = document.querySelectorAll(".trip-type");
const returnDateWrap = document.querySelector("#returnDateWrap");
const tripTypeLabel = document.querySelector("#tripTypeLabel");

tripTypeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tripTypeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.tripType = btn.dataset.trip;
    const round = state.tripType === "roundtrip";
    returnDateWrap.hidden = !round;
    tripTypeLabel.textContent = round ? "Pulang-pergi" : "Sekali jalan";
    if (!round) state.returnDate = "";
  });
});

/* Airport selector */
let airportTarget = "destination";
const airportSheet = document.querySelector("#airportSheet");
const airportList = document.querySelector("#airportList");
const airportSearch = document.querySelector("#airportSearch");
const airportSheetTitle = document.querySelector("#airportSheetTitle");

function renderAirports(query = "") {
  const q = query.trim().toLowerCase();
  const list = airports.filter(a =>
    !q ||
    a.code.toLowerCase().includes(q) ||
    a.city.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q)
  );

  airportList.innerHTML = list.map(a => `
    <button class="airport-option" type="button" data-code="${a.code}">
      <span class="code">${a.code}</span>
      <span class="airport-main">
        <strong>${a.city}</strong>
        <small>${a.name}</small>
      </span>
      <span class="select-mark">›</span>
    </button>
  `).join("");

  airportList.querySelectorAll(".airport-option").forEach(btn => {
    btn.addEventListener("click", () => {
      const airport = airports.find(a => a.code === btn.dataset.code);
      if (!airport) return;

      if (airportTarget === "origin") {
        if (state.destination?.code === airport.code) {
          state.destination = state.origin;
        }
        state.origin = airport;
      } else {
        if (state.origin.code === airport.code) return;
        state.destination = airport;
      }

      syncRouteUI();
      closeSheets();
    });
  });
}

function openAirportSelector(target) {
  airportTarget = target;
  airportSheetTitle.textContent = target === "origin" ? "Bandara keberangkatan" : "Bandara tujuan";
  airportSearch.value = "";
  renderAirports();
  openSheet(airportSheet);
  setTimeout(() => airportSearch.focus(), 200);
}

document.querySelector("#originBtn").addEventListener("click", () => openAirportSelector("origin"));
document.querySelector("#destinationBtn").addEventListener("click", () => openAirportSelector("destination"));
airportSearch.addEventListener("input", e => renderAirports(e.target.value));

function syncRouteUI() {
  document.querySelector("#originCode").textContent = state.origin.code;
  document.querySelector("#originCity").textContent = state.origin.city;

  document.querySelector("#destinationCode").textContent = state.destination?.code || "—";
  document.querySelector("#destinationCity").textContent = state.destination?.city || "Pilih tujuan";
  document.querySelector("#destinationCode").classList.toggle("muted-code", !state.destination);
}

document.querySelector("#swapRouteBtn").addEventListener("click", () => {
  if (!state.destination) return;
  const temp = state.origin;
  state.origin = state.destination;
  state.destination = temp;
  syncRouteUI();
});

/* Date picker */
const departInput = document.querySelector("#departDateInput");
const returnInput = document.querySelector("#returnDateInput");
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth()+1).padStart(2,"0");
const dd = String(today.getDate()).padStart(2,"0");
const todayStr = `${yyyy}-${mm}-${dd}`;
departInput.min = todayStr;
returnInput.min = todayStr;

function formatDate(value) {
  if (!value) return "Pilih tanggal";
  const d = new Date(value + "T00:00:00");
  return new Intl.DateTimeFormat("id-ID", {
    day:"numeric", month:"short", year:"numeric"
  }).format(d);
}

function openNativeDate(input) {
  if (typeof input.showPicker === "function") {
    input.showPicker();
  } else {
    input.click();
  }
}

departInput.addEventListener("change", () => {
  state.departDate = departInput.value;
  document.querySelector("#departDateText").textContent = formatDate(state.departDate);
  returnInput.min = state.departDate || todayStr;
  if (state.returnDate && state.returnDate < state.departDate) {
    state.returnDate = "";
    returnInput.value = "";
    document.querySelector("#returnDateText").textContent = "Pilih tanggal";
  }
});

returnInput.addEventListener("change", () => {
  state.returnDate = returnInput.value;
  document.querySelector("#returnDateText").textContent = formatDate(state.returnDate);
});

/* Passenger selector */
const passengerSheet = document.querySelector("#passengerSheet");
const counts = {
  adult: document.querySelector("#adultCount"),
  child: document.querySelector("#childCount"),
  infant: document.querySelector("#infantCount"),
};

document.querySelector("#passengerBtn").addEventListener("click", () => {
  counts.adult.textContent = state.adult;
  counts.child.textContent = state.child;
  counts.infant.textContent = state.infant;
  openSheet(passengerSheet);
});

document.querySelectorAll("[data-counter]").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.counter;
    const step = Number(btn.dataset.step);
    let next = Number(counts[type].textContent) + step;

    if (type === "adult") next = Math.max(1, Math.min(9, next));
    else next = Math.max(0, Math.min(8, next));

    if (type === "infant") {
      next = Math.min(next, Number(counts.adult.textContent));
    }

    counts[type].textContent = next;
  });
});

document.querySelector("#confirmPassengerBtn").addEventListener("click", () => {
  state.adult = Number(counts.adult.textContent);
  state.child = Number(counts.child.textContent);
  state.infant = Number(counts.infant.textContent);

  const parts = [`${state.adult} Dewasa`];
  if (state.child) parts.push(`${state.child} Anak`);
  if (state.infant) parts.push(`${state.infant} Bayi`);
  document.querySelector("#passengerText").textContent = parts.join(", ");
  closeSheets();
});

/* Cabin selector */
const cabinSheet = document.querySelector("#cabinSheet");
document.querySelector("#cabinBtn").addEventListener("click", () => openSheet(cabinSheet));

document.querySelectorAll(".cabin-option").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cabin-option").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.cabin = btn.dataset.cabin;
    document.querySelector("#cabinText").textContent = state.cabin;
    closeSheets();
  });
});

/* Search validation */
document.querySelector("#searchFlightBtn").addEventListener("click", () => {
  const searchState = window.__LETSGO_SEARCH_STATE__;
  if (!searchState) return;

  if (!searchState.destination) {
    document.querySelector("#destinationBtn")?.click();
    return;
  }
  if (!searchState.departDate) {
    openNativeDate(departInput);
    return;
  }
  if (searchState.tripType === "roundtrip" && !searchState.returnDate) {
    openNativeDate(returnInput);
    return;
  }

  const params = new URLSearchParams({
    origin: searchState.origin.code,
    destination: searchState.destination.code,
    depart: searchState.departDate,
    trip: searchState.tripType,
    adults: searchState.adult,
    children: searchState.child,
    infants: searchState.infant,
    cabin: searchState.cabin,
  });
  if (searchState.returnDate) params.set("return", searchState.returnDate);

  window.location.href = `search-flight.html?${params.toString()}`;
});


/* Notification tray — stays on Home, no redirect. */
const notificationBtn = document.querySelector("#notificationBtn");
const notificationTray = document.querySelector("#notificationTray");
const notificationCloseBtn = document.querySelector("#notificationCloseBtn");

function setNotificationTray(open) {
  notificationTray.classList.toggle("show", open);
  notificationTray.setAttribute("aria-hidden", String(!open));
  notificationBtn.setAttribute("aria-expanded", String(open));
}

notificationBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  setNotificationTray(!notificationTray.classList.contains("show"));
});

notificationCloseBtn.addEventListener("click", () => setNotificationTray(false));

document.addEventListener("click", (event) => {
  if (!notificationTray.classList.contains("show")) return;
  if (notificationTray.contains(event.target) || notificationBtn.contains(event.target)) return;
  setNotificationTray(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setNotificationTray(false);
});

/* Unique primary navigation — no duplicate action elsewhere on Home. */
document.querySelector("#ordersNav").addEventListener("click", () => {
  window.location.href = "order.html";
});

document.querySelector("#applyNav").addEventListener("click", () => {
  window.location.href = "pengajuan.html";
});

document.querySelector("#documentsNav").addEventListener("click", () => {
  window.location.href = "documents.html";
});

document.querySelector("#profileNav").addEventListener("click", () => {
  window.location.href = "profile.html";
});

document.querySelector("#helpBtn").addEventListener("click", () => {
  window.location.href = "help.html";
});

document.querySelector("#homeNav")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* Premium micro-interactions */
const pressables = document.querySelectorAll(
  "button, .airport-option, .meta-card, .cabin-option"
);

pressables.forEach((el) => {
  el.addEventListener("pointerdown", () => el.classList.add("is-pressed"));
  ["pointerup","pointercancel","pointerleave"].forEach((name) => {
    el.addEventListener(name, () => el.classList.remove("is-pressed"));
  });
});

requestAnimationFrame(() => {
  document.body.classList.add("home-ready");
});
