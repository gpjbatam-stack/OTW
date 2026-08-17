import { signIn } from "./auth-service.js";
import { redirectIfAuthenticated } from "./guard.js";

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

  btn.disabled = true;
  btn.textContent = "Memproses...";

  try {
    await signIn({
      email: form.email.value.trim().toLowerCase(),
      password: form.password.value,
    });

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
