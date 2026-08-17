import { getSession } from "./auth-service.js";
import { getMyProfile } from "./profile-service.js";

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

    if (!session) {
      await finishSplash();
      window.location.replace("login.html");
      return;
    }

    let profile = null;

    try {
      profile = await getMyProfile();
    } catch (error) {
      console.warn("[OTW] Profile check failed:", error);
    }

    await finishSplash();

    const incomplete =
      !profile ||
      !profile.full_name ||
      !profile.phone;

    window.location.replace(
      incomplete ? "complete-account.html" : "home.html"
    );
  } catch (error) {
    console.error("[OTW] Splash routing error:", error);
    await finishSplash();
    window.location.replace("login.html");
  }
}

route();
