import { getOptionalSession } from "./guard.js";
import { getMyProfile } from "./profile-service.js";
import { supabase } from "./supabase.js";
import { readUserSettings, isNotificationEnabled } from "./user-settings.js";

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

let homeUserSettings = readUserSettings(activeSession?.user?.id || null);

function applySearchPreferences() {
  if (!activeSession?.user?.id) return;
  homeUserSettings = readUserSettings(activeSession.user.id);
  const preferredAirport = airports.find(a => a.code === String(homeUserSettings.airport || "BTH").toUpperCase());
  if (preferredAirport) state.origin = preferredAirport;
  if (homeUserSettings.cabin) state.cabin = homeUserSettings.cabin;
  syncRouteUI?.();
  const cabinText = $("#cabinText");
  if (cabinText) cabinText.textContent = state.cabin;
  $$(".cabin-option").forEach(btn => btn.classList.toggle("active", btn.dataset.cabin === state.cabin));
}

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

const comingSoonModal = $("#comingSoonModal");
const comingSoonTitle = $("#comingSoonTitle");
const comingSoonText = $("#comingSoonText");

function openComingSoon(feature){
  if (!comingSoonModal) return;
  if (comingSoonTitle) comingSoonTitle.textContent = `${feature} Segera Hadir`;
  if (comingSoonText) comingSoonText.textContent = `Pemesanan ${feature.toLowerCase()} sedang kami siapkan di LetsGo. Fitur ini akan tersedia segera.`;
  comingSoonModal.classList.add("show");
  comingSoonModal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
}

function closeComingSoon(){
  if (!comingSoonModal) return;
  comingSoonModal.classList.remove("show");
  comingSoonModal.setAttribute("aria-hidden","true");
  document.body.classList.remove("modal-open");
}

on("#trainSearchBtn", "click", () => openComingSoon("Kereta"));
on("#hotelSearchBtn", "click", () => openComingSoon("Hotel"));
on("#comingSoonCloseBtn", "click", closeComingSoon);
on("#comingSoonOkBtn", "click", closeComingSoon);
$$("[data-close-coming-soon]").forEach(el => el.addEventListener("click", closeComingSoon));

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

  const target = `search-flight.html?${params.toString()}`;

  // Guest can prepare a search without losing it. After login, resume directly
  // to the exact search URL from this browser tab.
  if (!activeSession) {
    sessionStorage.setItem("letsgo_pending_search_url", target);
    return navigate("login.html?next=home.html%3FresumeSearch%3D1");
  }

  await navigate(target);
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
on("#applyNav", "click", () => {
  setNotificationTray(false);
  closeSheets();
  const booking = $(".booking-card");
  booking?.scrollIntoView({ behavior:"smooth", block:"center" });
  booking?.classList.add("booking-focus");
  setTimeout(() => booking?.classList.remove("booking-focus"), 700);
});
on("#documentsNav", "click", () => navigateProtected("documents.html"));
on("#profileNav", "click", () => activeSession ? navigate("profile.html") : navigate("login.html?next=profile.html"));
on("#helpBtn", "click", () => navigate("help.html"));


/* =========================================================
   LIVE HOME ACTIVITY — NOTIFICATIONS + ACTIVE JOURNEY
   ========================================================= */
const notificationDot = $("#notificationDot");
const notificationTrayLoading = $("#notificationTrayLoading");
const notificationTrayList = $("#notificationTrayList");
const notificationTrayEmpty = $("#notificationTrayEmpty");
const viewAllNotificationsBtn = $("#viewAllNotificationsBtn");
const journeyLoadingCard = $("#journeyLoadingCard");
const activeJourneyCard = $("#activeJourneyCard");
const emptyJourneyCard = $("#emptyJourneyCard");

let homeNotifications = [];
let activeJourney = null;
let notificationChannel = null;
let orderChannel = null;
let receivableChannel = null;

function activityDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d);
}

function relativeTime(value) {
  if (!value) return "";
  const diff = Math.max(0,Date.now()-new Date(value).getTime());
  const mins = Math.floor(diff/60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins/60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours/24);
  if (days < 7) return `${days} hari lalu`;
  return activityDate(value);
}

function notificationIcon(type) {
  const t = String(type||"").toLowerCase();
  if (["paid","payment","payment_due","payment_reminder","overdue"].includes(t)) {
    return `<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M3 10h18M16 15h2"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg>`;
}

function renderNotificationTray() {
  if (!activeSession) {
    notificationTrayLoading?.classList.add("hidden");
    notificationTrayList?.classList.add("hidden");
    notificationTrayEmpty?.classList.remove("hidden");
    viewAllNotificationsBtn?.classList.add("hidden");
    notificationDot?.classList.add("hidden");
    return;
  }

  const unread = homeNotifications.filter(n => !n.is_read).length;
  notificationDot?.classList.toggle("hidden", unread === 0);
  notificationBtn?.setAttribute("aria-label", unread ? `Buka notifikasi, ${unread} belum dibaca` : "Buka notifikasi");

  notificationTrayLoading?.classList.add("hidden");

  if (!homeNotifications.length) {
    notificationTrayList?.classList.add("hidden");
    notificationTrayEmpty?.classList.remove("hidden");
    viewAllNotificationsBtn?.classList.add("hidden");
    return;
  }

  notificationTrayEmpty?.classList.add("hidden");
  notificationTrayList?.classList.remove("hidden");
  viewAllNotificationsBtn?.classList.remove("hidden");

  notificationTrayList.innerHTML = homeNotifications.slice(0,5).map(n => `
    <button class="tray-notification ${n.is_read ? "" : "unread"}" type="button"
      data-notification-id="${n.id}" data-order-code="${n.order_code || ""}">
      <span class="tray-notification-icon">${notificationIcon(n.type)}</span>
      <span class="tray-notification-copy">
        <strong>${String(n.title||"Update LetsGo").replace(/[<>&"]/g,"")}</strong>
        <p>${String(n.message||"").replace(/[<>&"]/g,"")}</p>
        <small>${relativeTime(n.created_at)}</small>
      </span>
      ${n.is_read ? "" : '<span class="tray-unread-dot"></span>'}
    </button>
  `).join("");
}

async function loadHomeNotifications() {
  if (!activeSession?.user?.id) {
    homeNotifications = [];
    renderNotificationTray();
    return;
  }

  try {
    // Also materialize due-soon / overdue reminders.
    try { await supabase.rpc("sync_my_letsgo_notifications"); } catch (error) { console.warn("[LetsGo Notification Sync]", error); }

    const {data,error} = await supabase
      .from("notifications")
      .select("id,user_id,order_id,order_code,title,message,type,is_read,created_at")
      .eq("user_id",activeSession.user.id)
      .order("created_at",{ascending:false})
      .limit(20);

    if (error) throw error;
    homeUserSettings = readUserSettings(activeSession.user.id);
    homeNotifications = (data || []).filter(n => isNotificationEnabled(n, homeUserSettings));
    renderNotificationTray();
  } catch (error) {
    console.warn("[LetsGo Home Notifications]",error);
    notificationTrayLoading?.classList.add("hidden");
    notificationTrayList?.classList.add("hidden");
    notificationTrayEmpty?.classList.remove("hidden");
  }
}

async function markHomeNotificationRead(id) {
  if (!activeSession?.user?.id || !id) return;
  const {error} = await supabase
    .from("notifications")
    .update({is_read:true})
    .eq("id",id)
    .eq("user_id",activeSession.user.id);
  if (!error) {
    const item = homeNotifications.find(n => n.id === id);
    if (item) item.is_read = true;
    renderNotificationTray();
  }
}

notificationTrayList?.addEventListener("click", async event => {
  const item = event.target.closest("[data-notification-id]");
  if (!item) return;
  await markHomeNotificationRead(item.dataset.notificationId);
  const code = item.dataset.orderCode;
  if (code) return navigate(`detail-pesanan.html?id=${encodeURIComponent(code)}`);
  return navigate("notifications.html");
});

viewAllNotificationsBtn?.addEventListener("click", () => navigateProtected("notifications.html"));

function journeyEffectiveStatus(order, receivable) {
  const rs = String(receivable?.status||"").toLowerCase();
  if (rs === "paid" || (receivable?.outstanding_amount != null && Number(receivable.outstanding_amount) <= 0)) return "PAID";
  return String(order?.status||"SUBMITTED").toUpperCase();
}

function journeyStatusLabel(status) {
  return ({
    SUBMITTED:"Diajukan",
    PROCESSING:"Diproses",
    VERIFIED:"Terverifikasi",
    ISSUED:"Tiket terbit",
    COMPLETED:"Menunggu pembayaran",
    PAID:"Lunas",
    CANCELLED:"Dibatalkan"
  })[status] || status;
}

function renderActiveJourney() {
  journeyLoadingCard?.classList.add("hidden");

  if (!activeSession || !activeJourney) {
    activeJourneyCard?.classList.add("hidden");
    emptyJourneyCard?.classList.remove("hidden");
    return;
  }

  emptyJourneyCard?.classList.add("hidden");
  activeJourneyCard?.classList.remove("hidden");

  const {order,receivable} = activeJourney;
  const status = journeyEffectiveStatus(order,receivable);
  const due = receivable?.effective_due_date || receivable?.due_date || null;

  $("#activeJourneyKicker").textContent = status === "PAID" ? "PERJALANAN SELESAI" : "AKTIVITAS TERBARU";
  $("#activeJourneyTitle").textContent = `${order.origin||"---"} → ${order.destination||"---"}`;
  $("#activeJourneyOrigin").textContent = order.origin||"---";
  $("#activeJourneyDestination").textContent = order.destination||"---";
  $("#activeJourneyAirline").textContent = order.airline_name||"Maskapai";
  $("#activeJourneyDate").textContent = activityDate(order.depart_at);
  $("#activeJourneyOrder").textContent = order.order_code||"LG-—";

  const statusEl = $("#activeJourneyStatus");
  statusEl.textContent = journeyStatusLabel(status);
  statusEl.classList.toggle("is-paid",status==="PAID");
  statusEl.classList.toggle("is-warning",status==="COMPLETED");

  const reminder = $("#activeJourneyReminder");
  const isPaid = status === "PAID";
  if (!isPaid && due) {
    reminder.textContent = `Selesaikan sebelum ${activityDate(due)}`;
    reminder.classList.remove("hidden");
  } else {
    reminder.classList.add("hidden");
  }

  activeJourneyCard.dataset.orderCode = order.order_code || "";
}

async function loadActiveJourney() {
  if (!activeSession?.user?.id) {
    activeJourney = null;
    renderActiveJourney();
    return;
  }

  journeyLoadingCard?.classList.remove("hidden");
  emptyJourneyCard?.classList.add("hidden");

  try {
    const {data:orderRows,error} = await supabase
      .from("flight_orders")
      .select("*")
      .eq("user_id",activeSession.user.id)
      .neq("status","CANCELLED")
      .order("updated_at",{ascending:false})
      .limit(8);

    if (error) throw error;

    const orders = orderRows || [];
    if (!orders.length) {
      activeJourney = null;
      renderActiveJourney();
      return;
    }

    const ids = orders.map(x=>x.id).filter(Boolean);
    let receivables = [];
    if (ids.length) {
      const {data:rRows,error:rError} = await supabase
        .from("receivables")
        .select("flight_order_id,status,outstanding_amount,due_date,effective_due_date,arrived_batam_at")
        .in("flight_order_id",ids);
      if (!rError) receivables = rRows || [];
    }
    const rMap = new Map(receivables.map(r=>[r.flight_order_id,r]));

    // Home "Perjalanan saya" hanya menampilkan perjalanan yang masih aktif/actionable.
    // Pesanan PAID tidak lagi dianggap perjalanan aktif.
    const activeStatuses = new Set(["SUBMITTED","PROCESSING","VERIFIED","ISSUED","COMPLETED"]);
    const priority ={COMPLETED:0,ISSUED:1,PROCESSING:2,VERIFIED:3,SUBMITTED:4};

    const activeOrders = orders.filter(order => {
      const status = journeyEffectiveStatus(order,rMap.get(order.id));
      return activeStatuses.has(status);
    });

    if (!activeOrders.length) {
      activeJourney = null;
      renderActiveJourney();
      return;
    }

    const sorted = [...activeOrders].sort((a,b)=>{
      const sa=journeyEffectiveStatus(a,rMap.get(a.id));
      const sb=journeyEffectiveStatus(b,rMap.get(b.id));
      const pa=priority[sa]??9, pb=priority[sb]??9;
      if (pa!==pb) return pa-pb;
      return new Date(b.updated_at||b.created_at)-new Date(a.updated_at||a.created_at);
    });

    const selected = sorted[0];
    activeJourney = {order:selected,receivable:rMap.get(selected.id)||null};
    renderActiveJourney();
  } catch (error) {
    console.warn("[LetsGo Home Journey]",error);
    activeJourney = null;
    renderActiveJourney();
  }
}

activeJourneyCard?.addEventListener("click", () => {
  const code = activeJourneyCard.dataset.orderCode;
  if (code) navigate(`detail-pesanan.html?id=${encodeURIComponent(code)}`);
});
activeJourneyCard?.addEventListener("keydown", event => {
  if (!["Enter"," "].includes(event.key)) return;
  event.preventDefault();
  activeJourneyCard.click();
});

async function startReceivableRealtimeForActiveJourney() {
  if (receivableChannel) {
    await supabase.removeChannel(receivableChannel);
    receivableChannel = null;
  }

  const orderId = activeJourney?.order?.id;
  const uid = activeSession?.user?.id;
  if (!uid || !orderId) return;

  receivableChannel = supabase
    .channel(`home-receivable-${uid}-${orderId}`)
    .on("postgres_changes",{
      event:"*",
      schema:"public",
      table:"receivables",
      filter:`flight_order_id=eq.${orderId}`
    }, async () => {
      await loadActiveJourney();
      await startReceivableRealtimeForActiveJourney();
    })
    .subscribe();
}

async function startHomeRealtime() {
  if (!activeSession?.user?.id) return;
  const uid = activeSession.user.id;

  notificationChannel = supabase
    .channel(`home-notifications-${uid}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},()=>loadHomeNotifications())
    .subscribe();

  orderChannel = supabase
    .channel(`home-orders-${uid}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"flight_orders",filter:`user_id=eq.${uid}`},async()=>{
      await loadActiveJourney();
      await startReceivableRealtimeForActiveJourney();
    })
    .subscribe();

  await startReceivableRealtimeForActiveJourney();
}

const homeParams = new URLSearchParams(location.search);
if (activeSession && homeParams.get("resumeSearch") === "1") {
  const pendingSearchUrl = sessionStorage.getItem("letsgo_pending_search_url") || "";
  sessionStorage.removeItem("letsgo_pending_search_url");
  if (/^search-flight\.html\?/.test(pendingSearchUrl)) {
    await navigate(pendingSearchUrl);
    await new Promise(() => {});
  }
}

if (activeSession) {
  applySearchPreferences();
  notificationTrayLoading?.classList.remove("hidden");
  await Promise.all([loadHomeNotifications(),loadActiveJourney()]);
  await startHomeRealtime();
} else {
  notificationTrayLoading?.classList.add("hidden");
  renderNotificationTray();
  renderActiveJourney();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !activeSession) return;
  loadHomeNotifications();
  loadActiveJourney();
});

window.addEventListener("pagehide", () => {
  if (notificationChannel) supabase.removeChannel(notificationChannel);
  if (orderChannel) supabase.removeChannel(orderChannel);
  if (receivableChannel) supabase.removeChannel(receivableChannel);
});


if (location.hash === "#booking") {
  requestAnimationFrame(() => {
    const booking = $(".booking-card");
    booking?.scrollIntoView({ behavior:"smooth", block:"center" });
    booking?.classList.add("booking-focus");
    setTimeout(() => booking?.classList.remove("booking-focus"), 700);
  });
}

/* =========================================================
   MICRO INTERACTIONS
   ========================================================= */
$$("button, .airport-option, .meta-card, .cabin-option").forEach(el => {
  el.addEventListener("pointerdown", () => el.classList.add("is-pressed"));
  ["pointerup","pointercancel","pointerleave"].forEach(eventName => {
    el.addEventListener(eventName, () => el.classList.remove("is-pressed"));
  });
});

window.addEventListener("storage", event => {
  if (!activeSession?.user?.id) return;
  if (event.key === `letsgo_user_settings_${activeSession.user.id}`) {
    applySearchPreferences();
    loadHomeNotifications();
  }
});
