import { supabase } from "./supabase.js";
import { resendSignupConfirmation } from "./auth-service.js";

const params = new URLSearchParams(window.location.search);
const email = params.get("email") || sessionStorage.getItem("letsgo_pending_email") || "";
const emailText = document.querySelector("#emailText");
const title = document.querySelector("#title");
const lead = document.querySelector("#lead");
const eyebrow = document.querySelector("#eyebrow");
const icon = document.querySelector("#stateIcon");
const notice = document.querySelector("#notice");
const resendBtn = document.querySelector("#resendBtn");
const loginBtn = document.querySelector("#loginBtn");
const hint = document.querySelector("#hint");

if (email) emailText.textContent = email;

function showNotice(message, type="success"){
  notice.textContent = message;
  notice.className = `notice show ${type}`;
}

async function detectConfirmedSession(){
  // Supabase JS with detectSessionInUrl:true processes confirmation callback.
  // Give it a moment, then validate against Auth server.
  await new Promise(resolve => setTimeout(resolve, 120));
  const { data, error } = await supabase.auth.getUser();

  if (!error && data?.user?.email_confirmed_at) {
    eyebrow.textContent = "EMAIL VERIFIED";
    title.textContent = "Email berhasil dikonfirmasi";
    lead.innerHTML = "Akun LetsGo Anda sudah aktif. Silakan lanjut masuk untuk menggunakan seluruh fitur perjalanan.";
    icon.textContent = "✓";
    resendBtn.classList.add("hidden");
    resendBtn.style.display = "none";
    loginBtn.textContent = "Masuk ke LetsGo";
    loginBtn.href = "login.html";
    hint.textContent = "Verifikasi berhasil dan akun Anda siap digunakan.";
    sessionStorage.removeItem("letsgo_pending_email");
    sessionStorage.removeItem("letsgo_pending_next");
    // End callback session so the normal login screen remains the explicit entry point.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
}

resendBtn.addEventListener("click", async () => {
  if (!email) {
    showNotice("Alamat email tidak ditemukan. Silakan kembali ke halaman Daftar.", "error");
    return;
  }

  resendBtn.disabled = true;
  resendBtn.textContent = "Mengirim...";
  try {
    await resendSignupConfirmation(email);
    showNotice("Email konfirmasi berhasil dikirim ulang.");
  } catch (error) {
    showNotice(error?.message || "Email konfirmasi gagal dikirim ulang.", "error");
  } finally {
    resendBtn.disabled = false;
    resendBtn.textContent = "Kirim ulang email";
  }
});

detectConfirmedSession();
