import { signUp } from "./auth-service.js";
import { redirectIfAuthenticated } from "./guard.js";

const nextParam = new URLSearchParams(window.location.search).get("next") || "home.html";
const safeNext = (/^[a-zA-Z0-9._-]+(?:\?[a-zA-Z0-9%&=._-]*)?$/.test(nextParam) && !nextParam.includes("://"))
  ? nextParam
  : "home.html";

await redirectIfAuthenticated({ redirect: safeNext });

const form = document.querySelector("#registerForm");
const notice = document.querySelector("#notice");
const btn = document.querySelector("#submitBtn");
const passwordInput = document.querySelector("#password");
const togglePassword = document.querySelector("#togglePassword");

function showNotice(message, type = "error") {
  notice.textContent = message;
  notice.className = `notice show ${type}`;
  notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

togglePassword.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  togglePassword.textContent = show ? "Sembunyi" : "Lihat";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.className = "notice";

  const fullName = form.fullName.value.trim();
  const phone = form.phone.value.replace(/\s|-/g, "");
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;

  try {
    if (fullName.length < 3) throw new Error("Nama lengkap belum valid.");
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phone)) throw new Error("Nomor HP belum valid.");
    if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  } catch (error) {
    return showNotice(error.message);
  }

  btn.disabled = true;
  btn.textContent = "Membuat akun...";

  try {
    const result = await signUp({ fullName, email, phone, password });
    if (!result?.user) throw new Error("Akun gagal dibuat.");

    // With Confirm Email enabled Supabase intentionally returns no session.
    // Never treat that as a registration failure.
    if (!result.session) {
      sessionStorage.setItem("letsgo_pending_email", email);
      sessionStorage.setItem("letsgo_pending_next", safeNext);
      window.location.replace(`confirm-email.html?email=${encodeURIComponent(email)}&pending=1`);
      return;
    }

    // Defensive fallback if confirmation is disabled in Supabase.
    window.location.replace(safeNext);
  } catch (error) {
    const lower = String(error?.message || "").toLowerCase();
    const msg = lower.includes("already registered") || lower.includes("already been registered")
      ? "Email tersebut sudah terdaftar."
      : error?.message || "Registrasi gagal. Silakan coba lagi.";
    showNotice(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = "Daftar & Verifikasi Email";
  }
});
