import { getSession } from "./auth-service.js";

const MIN_SPLASH_MS = 1200;
const EXIT_ANIMATION_MS = 220;
const startedAt = performance.now();

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForMinimumSplash() {
  const elapsed = performance.now() - startedAt;

  if (elapsed < MIN_SPLASH_MS) {
    await wait(MIN_SPLASH_MS - elapsed);
  }
}

async function leaveSplash(destination) {
  document.body.classList.add("is-leaving");
  await wait(EXIT_ANIMATION_MS);
  window.location.replace(destination);
}

async function route() {
  try {
    const [session] = await Promise.all([
      getSession(),
      waitForMinimumSplash(),
    ]);

    await leaveSplash(session ? "home.html" : "login.html");
  } catch (error) {
    console.error("[LetsGo] Splash routing error:", error);

    await waitForMinimumSplash();
    await leaveSplash("login.html");
  }
}

route();
