import { getSession } from "./auth-service.js";

const SPLASH_SESSION_KEY = "letsgo_splash_seen";

function currentPage() {
  return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
}

export function hasSeenSplashThisSession() {
  return sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
}

export function requireSplashFirst({ splash = "index.html" } = {}) {
  if (currentPage() === "index.html") return true;

  if (!hasSeenSplashThisSession()) {
    window.location.replace(splash);
    return false;
  }

  return true;
}

export async function requireAuth({ redirect = "login.html", splash = "index.html" } = {}) {
  if (!requireSplashFirst({ splash })) return null;

  try {
    const session = await getSession();
    if (!session) {
      window.location.replace(redirect);
      return null;
    }
    return session;
  } catch (error) {
    console.error("[LetsGo] Auth guard:", error);
    window.location.replace(redirect);
    return null;
  }
}

export async function redirectIfAuthenticated({ redirect = "home.html", splash = "index.html" } = {}) {
  if (!requireSplashFirst({ splash })) return true;

  try {
    const session = await getSession();
    if (session) {
      window.location.replace(redirect);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[LetsGo] Guest guard:", error);
    return false;
  }
}
