import { getSession } from "./auth-service.js";

const MIN_SPLASH_MS = 900;
const startedAt = performance.now();

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function finishSplash() {
  const elapsed = performance.now() - startedAt;
  if (elapsed < MIN_SPLASH_MS) {
    await wait(MIN_SPLASH_MS - elapsed);
  }
}

async function route() {
  try {
    const session = await getSession();
    await finishSplash();
    window.location.replace(session ? "home.html" : "login.html");
  } catch (error) {
    console.error("[OTW] Splash routing error:", error);
    await finishSplash();
    window.location.replace("login.html");
  }
}

route();
