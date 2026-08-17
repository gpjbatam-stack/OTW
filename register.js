import { signUp } from "./auth-service.js";
import { redirectIfAuthenticated } from "./guard.js";

await redirectIfAuthenticated({ redirect: "home.html" });

const form = document.querySelector("#registerForm");
const notice = document.querySelector("#notice");
const btn = document.querySelector("#submitBtn");

function showNotice(message, type = "error") {
  notice.textContent = message;
  notice.className = `notice show ${type}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.className = "notice";

  const fullName = form.fullName.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (fullName.length < 3) return showNotice("Nama lengkap belum valid.");
  if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phone.replace(/\s|-/g, ""))) {
    return showNotice("Nomor HP belum valid.");
  }
  if (password.length < 8) return showNotice("Password minimal 8 karakter.");

  btn.disabled = true;
  btn.textContent = "Membuat akun...";

  try {
    const result = await signUp({ fullName, email, phone, password });

    if (result.session) {
      window.location.replace("complete-account.html");
      return;
    }

    showNotice(
      "Akun berhasil dibuat. Periksa email untuk verifikasi, lalu masuk ke OTW.",
      "success"
    );
    form.reset();
  } catch (error) {
    const msg =
      error?.message?.includes("already registered")
        ? "Email tersebut sudah terdaftar."
        : error?.message || "Registrasi gagal. Silakan coba lagi.";
    showNotice(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = "Buat Akun";
  }
});
