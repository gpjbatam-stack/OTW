import { supabase } from "./supabase.js";
import { resendSignupConfirmation } from "./auth-service.js";
import { refreshGuestQuoteAfterAuth } from "./auth-requote.js";

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
  const safeNext = "home.html";

  // Supabase detectSessionInUrl:true exchanges the confirmation callback for a session.
  // Wait briefly for that exchange, then validate against the Auth server.
  for(let attempt=0;attempt<12;attempt++){
    const {data:{session}}=await supabase.auth.getSession();
    if(session?.user){
      const {data,error}=await supabase.auth.getUser();
      if(!error&&data?.user?.email_confirmed_at){
        eyebrow.textContent="EMAIL VERIFIED";
        title.textContent="Email berhasil dikonfirmasi";
        lead.innerHTML="Akun LetsGo Anda sudah aktif. Anda akan langsung diarahkan untuk melanjutkan.";
        icon.textContent="✓";
        resendBtn.style.display="none";
        loginBtn.textContent="Lanjut ke LetsGo";
        loginBtn.href=safeNext;
        hint.textContent="Verifikasi berhasil. Sesi login Anda sudah aktif.";
        sessionStorage.removeItem("letsgo_pending_email");
        sessionStorage.removeItem("letsgo_pending_next");
        // Registration confirmation still lands on Home as required,
        // but refresh the guest quote first so the server stores it for this user.
        try {
          await refreshGuestQuoteAfterAuth();
        } catch (quoteError) {
          console.warn("[LetsGo Requote after confirmation]", quoteError);
          sessionStorage.setItem("letsgo_requote_error", quoteError?.message || "Penerbangan perlu dicari ulang.");
        }
        setTimeout(()=>window.location.replace(safeNext),350);
        return;
      }
    }
    await new Promise(resolve=>setTimeout(resolve,150));
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
    await resendSignupConfirmation(email, "home.html");
    showNotice("Email konfirmasi berhasil dikirim ulang.");
  } catch (error) {
    showNotice(error?.message || "Email konfirmasi gagal dikirim ulang.", "error");
  } finally {
    resendBtn.disabled = false;
    resendBtn.textContent = "Kirim ulang email";
  }
});

detectConfirmedSession();
