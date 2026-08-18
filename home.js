/* =========================================================
   OTW HOME — V9 ROUTE ARCHITECTURE
   Navigation routes are permanent even if target page is 404.
   ========================================================= */

const ROUTES = Object.freeze({
  home: "home.html",
  orders: "orders.html",
  request: "request.html",
  notifications: "notifications.html",
  profile: "profile.html",
  invoice: "invoice.html",
  history: "history.html",
  services: "services.html",
  help: "help.html",
  flightSearch: "search-flight.html",
  trainSearch: "search-train.html",
  hotelSearch: "search-hotel.html"
});

function navigateTo(route) {
  window.location.href = route;
}

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  loadAccountDataSafely();
});

async function loadAccountDataSafely() {
  try {
    const [{ requireAuth }, { getMyProfile }] = await Promise.all([
      import("./guard.js"),
      import("./profile-service.js")
    ]);

    const session = await requireAuth({ redirect: "login.html" });
    if (!session) return;

    const profile = await getMyProfile();
    const fullName = profile?.full_name || "Pengguna";
    const firstName = fullName.trim().split(/\s+/)[0];

    const greeting = document.querySelector("#greeting");
    const avatar = document.querySelector("#avatar");

    if (greeting) greeting.textContent = `Halo, ${firstName}`;
    if (avatar) {
      avatar.textContent = fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase() || "OT";
    }
  } catch (error) {
    console.error("[OTW] Auth/profile gagal dimuat, UI tetap aktif:", error);
  }
}

function initUI() {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

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
    activeService: "flight"
  };

  window.__OTW_SEARCH_STATE__ = state;

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
    { code:"LOP", city:"Lombok", name:"Zainuddin Abdul Madjid International Airport" }
  ];

  /* ---------- Bottom sheets ---------- */
  const backdrop = $("#sheetBackdrop");
  const sheets = $$(".bottom-sheet");

  function openSheet(sheet) {
    if (!sheet) return;
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

  /* ---------- Travel tabs ---------- */
  const panels = {
    flight: $("#flightPanel"),
    train: $("#trainPanel"),
    hotel: $("#hotelPanel")
  };

  $$(".travel-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".travel-tab").forEach(item => item.classList.remove("active"));
      Object.values(panels).forEach(panel => panel?.classList.remove("active"));

      tab.classList.add("active");
      state.activeService = tab.dataset.tab;
      panels[state.activeService]?.classList.add("active");
    });
  });

  /* ---------- Trip type ---------- */
  const returnDateWrap = $("#returnDateWrap");
  const tripTypeLabel = $("#tripTypeLabel");

  $$(".trip-type").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".trip-type").forEach(item => item.classList.remove("active"));
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

  /* ---------- Airport selector: preserve existing working behavior ---------- */
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
      airportSheetTitle.textContent =
        target === "origin" ? "Bandara keberangkatan" : "Bandara tujuan";
    }
    if (airportSearch) airportSearch.value = "";
    renderAirports();
    openSheet(airportSheet);
    setTimeout(() => airportSearch?.focus(), 180);
  }

  $("#originBtn")?.addEventListener("click", () => openAirportSelector("origin"));
  $("#destinationBtn")?.addEventListener("click", () => openAirportSelector("destination"));
  airportSearch?.addEventListener("input", e => renderAirports(e.target.value));

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

    if (destinationCity) {
      destinationCity.textContent = state.destination?.city || "Pilih tujuan";
    }
  }

  $("#swapRouteBtn")?.addEventListener("click", () => {
    if (!state.destination) return;
    const temp = state.origin;
    state.origin = state.destination;
    state.destination = temp;
    syncRouteUI();
  });

  /* ---------- Native date overlay currently present in HTML ---------- */
  const departInput = $("#departDateInput");
  const returnInput = $("#returnDateInput");

  const now = new Date();
  const todayString = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  if (departInput) departInput.min = todayString;
  if (returnInput) returnInput.min = todayString;

  function formatDate(value) {
    if (!value) return "Pilih tanggal";
    const d = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(d);
  }

  departInput?.addEventListener("change", () => {
    state.departDate = departInput.value;
    const departText = $("#departDateText");
    if (departText) departText.textContent = formatDate(state.departDate);

    if (returnInput) returnInput.min = state.departDate || todayString;

    if (state.returnDate && state.returnDate < state.departDate) {
      state.returnDate = "";
      if (returnInput) returnInput.value = "";
      const returnText = $("#returnDateText");
      if (returnText) returnText.textContent = "Pilih tanggal";
    }
  });

  returnInput?.addEventListener("change", () => {
    state.returnDate = returnInput.value;
    const returnText = $("#returnDateText");
    if (returnText) returnText.textContent = formatDate(state.returnDate);
  });

  /* ---------- Passenger ---------- */
  const passengerSheet = $("#passengerSheet");
  const counts = {
    adult: $("#adultCount"),
    child: $("#childCount"),
    infant: $("#infantCount")
  };

  $("#passengerBtn")?.addEventListener("click", () => {
    if (counts.adult) counts.adult.textContent = state.adult;
    if (counts.child) counts.child.textContent = state.child;
    if (counts.infant) counts.infant.textContent = state.infant;
    openSheet(passengerSheet);
  });

  $$("[data-counter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.counter;
      const step = Number(btn.dataset.step);
      const target = counts[type];
      if (!target) return;

      let next = Number(target.textContent) + step;

      if (type === "adult") next = Math.max(1, Math.min(9, next));
      else next = Math.max(0, Math.min(8, next));

      if (type === "infant") {
        next = Math.min(next, Number(counts.adult?.textContent || 1));
      }

      target.textContent = next;
    });
  });

  $("#confirmPassengerBtn")?.addEventListener("click", () => {
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

  /* ---------- Cabin ---------- */
  const cabinSheet = $("#cabinSheet");

  $("#cabinBtn")?.addEventListener("click", () => openSheet(cabinSheet));

  $$(".cabin-option").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".cabin-option").forEach(item => item.classList.remove("active"));
      btn.classList.add("active");
      state.cabin = btn.dataset.cabin;

      const cabinText = $("#cabinText");
      if (cabinText) cabinText.textContent = state.cabin;

      closeSheets();
    });
  });

  /* ---------- Search flight ---------- */
  $("#searchFlightBtn")?.addEventListener("click", () => {
    if (!state.destination) {
      openAirportSelector("destination");
      return;
    }

    if (!state.departDate) {
      try {
        departInput?.showPicker?.();
      } catch {
        departInput?.click();
      }
      return;
    }

    if (state.tripType === "roundtrip" && !state.returnDate) {
      try {
        returnInput?.showPicker?.();
      } catch {
        returnInput?.click();
      }
      return;
    }

    const params = new URLSearchParams({
      origin: state.origin.code,
      destination: state.destination.code,
      depart: state.departDate,
      trip: state.tripType,
      adults: state.adult,
      children: state.child,
      infants: state.infant,
      cabin: state.cabin
    });

    if (state.returnDate) params.set("return", state.returnDate);

    navigateTo(`${ROUTES.flightSearch}?${params.toString()}`);
  });

  /* ---------- Permanent page navigation ---------- */
  $("#homeNav")?.addEventListener("click", () => navigateTo(ROUTES.home));
  $("#ordersNav")?.addEventListener("click", () => navigateTo(ROUTES.orders));
  $("#requestNav")?.addEventListener("click", () => navigateTo(ROUTES.request));
  $("#notificationsNav")?.addEventListener("click", () => navigateTo(ROUTES.notifications));
  $("#profileNav")?.addEventListener("click", () => navigateTo(ROUTES.profile));

  $("#notificationBtn")?.addEventListener("click", () => navigateTo(ROUTES.notifications));
  $("#profileBtn")?.addEventListener("click", () => navigateTo(ROUTES.profile));

  $("#activeOrdersCard")?.addEventListener("click", () => navigateTo(ROUTES.orders));
  $("#invoiceStatusCard")?.addEventListener("click", () => navigateTo(ROUTES.invoice));

  $("#requestQuickBtn")?.addEventListener("click", () => navigateTo(ROUTES.request));
  $("#ordersQuickBtn")?.addEventListener("click", () => navigateTo(ROUTES.orders));
  $("#invoiceQuickBtn")?.addEventListener("click", () => navigateTo(ROUTES.invoice));

  $("#servicesBtn")?.addEventListener("click", () => navigateTo(ROUTES.services));
  $("#historyBtn")?.addEventListener("click", () => navigateTo(ROUTES.history));
  $("#helpBtn")?.addEventListener("click", () => navigateTo(ROUTES.help));
}

/* OTW V10 — Train & Hotel search panels */
document.addEventListener("DOMContentLoaded", () => {
  const $ = s => document.querySelector(s);
  const today = new Date().toISOString().slice(0,10);
  ["#trainDateInput","#hotelCheckinInput","#hotelCheckoutInput"].forEach(s=>{const el=$(s); if(el) el.min=today;});
  const fmt=v=>v?new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v+"T00:00:00")):"Pilih tanggal";
  $("#trainDateInput")?.addEventListener("change",e=>{$("#trainDateText").textContent=fmt(e.target.value)});
  $("#hotelCheckinInput")?.addEventListener("change",e=>{ $("#hotelCheckinText").textContent=fmt(e.target.value); const out=$("#hotelCheckoutInput"); if(out) out.min=e.target.value||today; });
  $("#hotelCheckoutInput")?.addEventListener("change",e=>{$("#hotelCheckoutText").textContent=fmt(e.target.value)});
  $("#trainOriginBtn")?.addEventListener("click",()=>{const v=prompt("Masukkan stasiun asal");if(v)$("#trainOriginText").textContent=v});
  $("#trainDestinationBtn")?.addEventListener("click",()=>{const v=prompt("Masukkan stasiun tujuan");if(v)$("#trainDestinationText").textContent=v});
  $("#hotelCityBtn")?.addEventListener("click",()=>{const v=prompt("Masukkan kota atau area hotel");if(v)$("#hotelCityText").textContent=v});
  $("#searchTrainBtn")?.addEventListener("click",()=>{const p=new URLSearchParams({origin:$("#trainOriginText")?.textContent||"",destination:$("#trainDestinationText")?.textContent||"",depart:$("#trainDateInput")?.value||"",adults:"1"});location.href=`search-train.html?${p}`});
  $("#searchHotelBtn")?.addEventListener("click",()=>{const p=new URLSearchParams({city:$("#hotelCityText")?.textContent||"",checkin:$("#hotelCheckinInput")?.value||"",checkout:$("#hotelCheckoutInput")?.value||"",guests:"1"});location.href=`search-hotel.html?${p}`});
});
