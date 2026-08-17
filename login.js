import { signIn } from "./auth-service.js";
import { redirectIfAuthenticated } from "./guard.js";
import { getMyProfile } from "./profile-service.js";

await redirectIfAuthenticated({ redirect: "home.html" });

const form = document.querySelector("#loginForm");
const notice = document.querySelector("#notice");
const btn = document.querySelector("#submitBtn");
const password = document.querySelector("#password");
const toggle = document.querySelector("#togglePassword");

function showNotice(message, type = "error") {
  notice.textContent = message;
  notice.className = `notice show ${type}`;
}

toggle.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  toggle.textContent = show ? "Sembunyi" : "Lihat";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.className = "notice";

  const email = form.email.value.trim();
  const password = form.password.value;

  btn.disabled = true;
  btn.textContent = "Memproses...";

  try {
    await signIn({ email, password });

    let profile = null;
    try {
      profile = await getMyProfile();
    } catch (_) {}

    if (!profile?.employee_number || !profile?.phone) {
      window.location.replace("complete-account.html");
      return;
    }

    window.location.replace("home.html");
  } catch (error) {
    const message =
      error?.message?.includes("Invalid login credentials")
        ? "Email atau password tidak sesuai."
        : error?.message || "Gagal masuk. Silakan coba lagi.";
    showNotice(message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Masuk";
  }
});
