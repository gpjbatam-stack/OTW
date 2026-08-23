import { getSession } from "./auth-service.js";

const MIN_SPLASH_MS = 5000;
const EXIT_MS = 280;
const startedAt = performance.now();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function keepSplashVisible() {
  const remaining = MIN_SPLASH_MS - (performance.now() - startedAt);
  if (remaining > 0) await wait(remaining);
}

async function navigateTo(url) {
  document.body.classList.add("is-leaving");
  await wait(EXIT_MS);
  window.location.replace(url);
}

async function boot() {
  try {
    const [session] = await Promise.all([getSession(), keepSplashVisible()]);
    await navigateTo(session ? "home.html" : "login.html");
  } catch (error) {
    console.error("[LetsGo] Splash initialization failed:", error);
    await keepSplashVisible();
    await navigateTo("login.html");
  }
}

boot();
