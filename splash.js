const MIN_SPLASH_MS = 1500;
const EXIT_MS = 280;
const SPLASH_SESSION_KEY = "letsgo_splash_seen";
const startedAt = performance.now();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function keepSplashVisible() {
  const remaining = MIN_SPLASH_MS - (performance.now() - startedAt);
  if (remaining > 0) await wait(remaining);
}

async function navigateTo(url) {
  sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
  document.body.classList.add("is-leaving");
  await wait(EXIT_MS);
  window.location.replace(url);
}

async function boot() {
  try {
    await keepSplashVisible();
    await navigateTo("home.html");
  } catch (error) {
    console.error("[LetsGo] Splash initialization failed:", error);
    await keepSplashVisible();
    await navigateTo("home.html");
  }
}

boot();
