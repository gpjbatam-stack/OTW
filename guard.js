import { getSession } from "./auth-service.js";

export async function requireAuth({ redirect = "login.html" } = {}) {
  try {
    const session = await getSession();
    if (!session) {
      window.location.replace(redirect);
      return null;
    }
    return session;
  } catch (error) {
    console.error("[OTW] Auth guard:", error);
    window.location.replace(redirect);
    return null;
  }
}

export async function redirectIfAuthenticated({ redirect = "home.html" } = {}) {
  try {
    const session = await getSession();
    if (session) {
      window.location.replace(redirect);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[OTW] Guest guard:", error);
    return false;
  }
}
