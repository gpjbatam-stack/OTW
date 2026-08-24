import { getOptionalSession } from "./guard.js";
import { getMyProfile } from "./profile-service.js";
import { supabase } from "./supabase.js";

/* =========================================================
   LETSGO HOME — FUNCTIONAL CONTROLLER
   Every visible button has an explicit behavior.
   ========================================================= */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function on(selector, event, handler, scope = document) {
  const el = $(selector, scope);
  if (el) el.addEventListener(event, handler);
  return el;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Home is public. Session is optional and only personalizes the experience. */
let activeSession = await getOptionalSession({ splash: "index.html" });

if (activeSession) {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    try { await supabase.auth.signOut({ scope: "local" }); } catch {}
    activeSession = null;
  } else {
    activeSession = { ...activeSession, user: authData.user };
  }
}

/* Visual ready state never controls visibility; it only enhances motion. */
requestAnimationFrame(() => document.body.classList.add("home-ready"));

/* Premium page transition for actual navigation. */
const pageTransition = $("#pageTransition");
let navigating = false;

async function navigate(url) {
  if (!url || navigating) return;
  navigating = true;
  document.body.classList.add("is-navigating");
  pageTransition?.classList.add("show");
  await wait(170);
  window.location.href = url;
}

window.addEventListener("pageshow", () => {
  navigating = false;
  document.body.classList.remove("is-navigating");
  pageTransition?.classList.remove("show");
});

/* Profile / guest identity */
const greeting = $("#greeting");
const authEntryBtn = $("#authEntryBtn");
const authEntryLabel = $("#authEntryLabel");
const guestAccountCard = $("#guestAccountCard");

if (activeSession) {
  try {
    const profile = await getMyProfile();
    const fullName =
      profile?.full_name ||
      activeSession.user?.user_metadata?.full_name ||
      "Pengguna";
    const firstName = fullName.trim().split(/\s+/)[0];
    const initials = fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase() || "LG";

    if (greeting) greeting.textContent = `Halo, ${firstName}`;
    if (authEntryLabel) authEntryLabel.textContent = initials;
    authEntryBtn?.classList.remove("guest");
    authEntryBtn?.classList.add("signed-in");
    guestAccountCard?.classList.add("hidden");
  } catch (error) {
    console.error("[LetsGo] Gagal memuat profil:", error);
    if (greeting) greeting.textContent = "Halo";
    if (authEntryLabel) authEntryLabel.textContent = "LG";
    authEntryBtn?.classList.remove("guest");
    authEntryBtn?.classList.add("signed-in");
    guestAccountCard?.classList.add("hidden");
  }
} else {
  if (greeting) greeting.textContent = "Halo";
  if (authEntryLabel) authEntryLabel.textContent = "Masuk";
  authEntryBtn?.classList.add("guest");
  authEntryBtn?.classList.remove("signed-in");
  guestAccountCard?.classList.remove("hidden");
}

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

/* =========================================================
   OVERLAYS: notification tray + bottom sheets are mutually exclusive
   ========================================================= */
const backdrop = $("#sheetBackdrop");
const sheets = $$(".bottom-sheet");
const notificationBtn = $("#notificationBtn");
const notificationTray = $("#notificationTray");
const notificationCloseBtn = $("#notificationCloseBtn");

function setNotificationTray(open) {
  if (!notificationTray || !notificationBtn) return;
  if (open) closeSheets();

  notificationTray.classList.toggle("show", open);
  notificationTray.setAttribute("aria-hidden", String(!open));
  notificationBtn.setAttribute("aria-expanded", String(open));
}

function openSheet(sheet) {
  if (!sheet) return;
  setNotificationTray(false);

  sheets.forEach(s => {
    s.classList.remove("show");
    s.setAttribute("aria-hidden", "true");
  });

  sheet.classList.add("show");
  sheet.setAttribute("aria-hidden", "false");
  backdrop?.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeSheets() {
  sheets.forEach(s => {
    s.classList.remove("show");
    s.setAttribute("aria-hidden", "true");
  });
  backdrop?.classList.remove("show");
  document.body.style.overflow = "";
}

backdrop?.addEventListener("click", closeSheets);
$$("[data-close-sheet]").forEach(btn => btn.addEventListener("click", closeSheets));

notificationBtn?.addEventListener("click", event => {
  event.stopPropagation();
  setNotificationTray(!notificationTray?.classList.contains("show"));
});
notificationCloseBtn?.addEventListener("click", () => setNotificationTray(false));

document.addEventListener("click", event => {
  if (!notificationTray?.classList.contains("show")) return;
  if (notificationTray.contains(event.target) || notificationBtn?.contains(event.target)) return;
  setNotificationTray(false);
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  setNotificationTray(false);
  closeSheets();
});

/* =========================================================
   TRAVEL PRODUCT BUTTONS
   ========================================================= */
on("#flightTabBtn", "click", () => {
  const card = $(".booking-card");
  card?.classList.remove("booking-focus");
  requestAnimationFrame(() => {
    card?.classList.add("booking-focus");
    card?.scrollIntoView({ behavior:"smooth", block:"center" });
  });
  setTimeout(() => card?.classList.remove("booking-focus"), 700);
});

on("#trainSearchBtn", "click", () => navigate("search-train.html"));
on("#hotelSearchBtn", "click", () => navigate("search-hotel.html"));

/* =========================================================
   TRIP TYPE
   ========================================================= */
const tripTypeBtns = $$(".trip-type");
const returnDateWrap = $("#returnDateWrap");
const tripTypeLabel = $("#tripTypeLabel");

tripTypeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tripTypeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    state.tripType = btn.dataset.trip;
    const isRoundTrip = state.tripType === "roundtrip";

    if (returnDateWrap) returnDateWrap.hidden = !isRoundTrip;
    if (tripTypeLabel) tripTypeLabel.textContent = isRoundTrip ? "Pulang-pergi" : "Sekali jalan";

    if (!isRoundTrip) {
      state.returnDate = "";
      const returnInput = $("#returnDateInput");
      const returnText = $("#returnDateText");
      if (returnInput) returnInput.value = "";
      if (returnText) returnText.textContent = "Pilih tanggal";
    }
  });
});

/* =========================================================
   AIRPORT SELECTOR
   ========================================================= */
let airportTarget = "destination";
const airportSheet = $("#airportSheet");
const airportList = $("#airportList");
const airportSearch = $("#airportSearch");
const airportSheetTitle = $("#airportSheetTitle");

function renderAirports(query = "") {
  if (!airportList) return;

  const q = query.trim().toLowerCase();
  const list = airports.filter(a =>
    !q ||
    a.code.toLowerCase().includes(q) ||
    a.city.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q)
  );

  airportList.innerHTML = list.length
    ? list.map(a => `
      <button class="airport-option" type="button" data-code="${a.code}">
        <span class="code">${a.code}</span>
        <span class="airport-main">
          <strong>${a.city}</strong>
          <small>${a.name}</small>
        </span>
        <span class="select-mark">›</span>
      </button>
    `).join("")
    : `<div class="airport-empty">Bandara tidak ditemukan.</div>`;

  $$(".airport-option", airportList).forEach(btn => {
    btn.addEventListener("click", () => {
      const airport = airports.find(a => a.code === btn.dataset.code);
      if (!airport) return;

      if (airportTarget === "origin") {
        if (state.destination?.code === airport.code) state.destination = state.origin;
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
  if (airportSheetTitle) {
    airportSheetTitle.textContent = target === "origin"
      ? "Bandara keberangkatan"
      : "Bandara tujuan";
  }

  if (airportSearch) airportSearch.value = "";
  renderAirports();
  openSheet(airportSheet);
  setTimeout(() => airportSearch?.focus(), 220);
}

on("#originBtn", "click", () => openAirportSelector("origin"));
on("#destinationBtn", "click", () => openAirportSelector("destination"));
airportSearch?.addEventListener("input", event => renderAirports(event.target.value));

function syncRouteUI() {
  const originCode = $("#originCode");
  const originCity = $("#originCity");
  const destinationCode = $("#destinationCode");
  const destinationCity = $("#destinationCity");

  if (originCode) originCode.textContent = state.origin.code;
  if (originCity) originCity.textContent = state.origin.city;

  if (destinationCode) {
    destinationCode.textContent = state.destination?.code || "—";
    destinationCode.classList.toggle("muted-code", !state.destination);
  }
  if (destinationCity) destinationCity.textContent = state.destination?.city || "Pilih tujuan";
}

on("#swapRouteBtn", "click", () => {
  if (!state.destination) {
    openAirportSelector("destination");
    return;
  }

  [state.origin, state.destination] = [state.destination, state.origin];
  syncRouteUI();

  const swap = $("#swapRouteBtn");
  swap?.classList.add("swap-animate");
  setTimeout(() => swap?.classList.remove("swap-animate"), 360);
});

/* =========================================================
   DATE PICKERS
   ========================================================= */
const departInput = $("#departDateInput");
const returnInput = $("#returnDateInput");

const today = new Date();
const todayStr = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2,"0"),
  String(today.getDate()).padStart(2,"0")
].join("-");

if (departInput) departInput.min = todayStr;
if (returnInput) returnInput.min = todayStr;

function formatDate(value) {
  if (!value) return "Pilih tanggal";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", {
    day:"numeric",
    month:"short",
    year:"numeric"
  }).format(date);
}

function openNativeDate(input) {
  if (!input) return;
  try {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  } catch {
    input.focus();
    input.click();
  }
}

departInput?.addEventListener("change", () => {
  state.departDate = departInput.value;
  const text = $("#departDateText");
  if (text) text.textContent = formatDate(state.departDate);

  if (returnInput) returnInput.min = state.departDate || todayStr;

  if (state.returnDate && state.returnDate < state.departDate) {
    state.returnDate = "";
    if (returnInput) returnInput.value = "";
    const returnText = $("#returnDateText");
    if (returnText) returnText.textContent = "Pilih tanggal";
  }
});

returnInput?.addEventListener("change", () => {
  state.returnDate = returnInput.value;
  const text = $("#returnDateText");
  if (text) text.textContent = formatDate(state.returnDate);
});

/* =========================================================
   PASSENGERS
   ========================================================= */
const passengerSheet = $("#passengerSheet");
const counts = {
  adult: $("#adultCount"),
  child: $("#childCount"),
  infant: $("#infantCount"),
};

on("#passengerBtn", "click", () => {
  if (counts.adult) counts.adult.textContent = state.adult;
  if (counts.child) counts.child.textContent = state.child;
  if (counts.infant) counts.infant.textContent = state.infant;
  openSheet(passengerSheet);
});

$$("[data-counter]").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.counter;
    const step = Number(btn.dataset.step);
    const counter = counts[type];
    if (!counter) return;

    let next = Number(counter.textContent) + step;

    if (type === "adult") next = Math.max(1, Math.min(9, next));
    else next = Math.max(0, Math.min(8, next));

    if (type === "infant") {
      next = Math.min(next, Number(counts.adult?.textContent || 1));
    }

    counter.textContent = next;
  });
});

on("#confirmPassengerBtn", "click", () => {
  state.adult = Number(counts.adult?.textContent || 1);
  state.child = Number(counts.child?.textContent || 0);
  state.infant = Number(counts.infant?.textContent || 0);

  const parts = [`${state.adult} Dewasa`];
  if (state.child) parts.push(`${state.child} Anak`);
  if (state.infant) parts.push(`${state.infant} Bayi`);

  const passengerText = $("#passengerText");
  if (passengerText) passengerText.textContent = parts.join(", ");

  closeSheets();
});

/* =========================================================
   CABIN
   ========================================================= */
const cabinSheet = $("#cabinSheet");

on("#cabinBtn", "click", () => openSheet(cabinSheet));

$$(".cabin-option").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".cabin-option").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.cabin = btn.dataset.cabin || "Ekonomi";

    const cabinText = $("#cabinText");
    if (cabinText) cabinText.textContent = state.cabin;

    closeSheets();
  });
});

/* =========================================================
   SEARCH
   ========================================================= */
on("#searchFlightBtn", "click", async () => {
  if (!state.destination) {
    openAirportSelector("destination");
    return;
  }

  if (!state.departDate) {
    openNativeDate(departInput);
    return;
  }

  if (state.tripType === "roundtrip" && !state.returnDate) {
    openNativeDate(returnInput);
    return;
  }

  const params = new URLSearchParams({
    origin: state.origin.code,
    destination: state.destination.code,
    depart: state.departDate,
    trip: state.tripType,
    adults: String(state.adult),
    children: String(state.child),
    infants: String(state.infant),
    cabin: state.cabin,
  });

  if (state.returnDate) params.set("return", state.returnDate);

  await navigate(`search-flight.html?${params.toString()}`);
});


function navigateProtected(url) {
  if (activeSession) return navigate(url);

  const next = encodeURIComponent(url);
  return navigate(`login.html?next=${next}`);
}


on("#authEntryBtn", "click", () => {
  if (activeSession) return navigate("profile.html");
  return navigate("login.html?next=home.html");
});
on("#guestLoginBtn", "click", () => navigate("login.html?next=home.html"));
on("#guestRegisterBtn", "click", () => navigate("register.html?next=home.html"));

/* =========================================================
   PRIMARY NAVIGATION
   One button = one function.
   ========================================================= */
on("#homeNav", "click", () => {
  setNotificationTray(false);
  closeSheets();
  window.scrollTo({ top:0, behavior:"smooth" });
});

on("#ordersNav", "click", () => navigateProtected("orders.html"));
on("#applyNav", "click", () => navigateProtected("pengajuan.html"));
on("#documentsNav", "click", () => navigateProtected("documents.html"));
on("#profileNav", "click", () => activeSession ? navigate("profile.html") : navigate("login.html?next=profile.html"));
on("#helpBtn", "click", () => navigate("help.html"));

/* =========================================================
   MICRO INTERACTIONS
   ========================================================= */
$$("button, .airport-option, .meta-card, .cabin-option").forEach(el => {
  el.addEventListener("pointerdown", () => el.classList.add("is-pressed"));
  ["pointerup","pointercancel","pointerleave"].forEach(eventName => {
    el.addEventListener(eventName, () => el.classList.remove("is-pressed"));
  });
});
