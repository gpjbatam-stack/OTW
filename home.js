import { requireAuth } from "./guard.js";
import { signOut } from "./auth-service.js";
import { getMyProfile } from "./profile-service.js";

await requireAuth({ redirect: "login.html" });

const profile = await getMyProfile();
if (profile) {
  document.querySelector("#hello").textContent = `Halo, ${profile.full_name?.split(" ")[0] || "Pengguna"}`;
  const initials = (profile.full_name || "OTW")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0])
    .join("")
    .toUpperCase();
  document.querySelector("#avatar").textContent = initials;
}

document.querySelector("#logoutBtn").addEventListener("click", async () => {
  await signOut();
  window.location.replace("login.html");
});
