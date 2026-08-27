import { signIn } from "./auth-service.js";
import { supabase } from "./supabase.js";
import { requireSplashFirst } from "./guard.js";

if (!requireSplashFirst({ splash: "index.html" })) {
  await new Promise(() => {});
}

const $ = (selector) => document.querySelector(selector);

const form = $("#loginForm");
const notice = $("#notice");
const btn = $("#submitBtn");
const submitLabel = $("#submitLabel");
const password = $("#password");
const toggle = $("#togglePassword");
const emailInput = $("#email");

let loginMode = "user";

function getSafeNext() {
  const next = new URLSearchParams(window.location.search).get("next") || "home.html";
  if (/^[a-zA-Z0-9._-]+(?:\?[a-zA-Z0-9%&=._-]*)?$/.test(next) && !next.includes("://")) return next;
  return "home.html";
}

const COPY = {
  user: {
    eyebrow: "SECURE MEMBER ACCESS",
    title: "Selamat datang kembali.",
    lead: "Masuk untuk melanjutkan perjalanan Anda.",
    emailPlaceholder: "nama@instansi.go.id",
    submit: "Masuk ke LetsGo",
    rememberTitle: "Tetap masuk",
    rememberText: "Simpan sesi di perangkat ini.",
    securityTitle: "Akses aman",
    securityText: "Sesi Anda dilindungi oleh autentikasi LetsGo."
  },
  admin: {
    eyebrow: "AUTHORIZED ADMIN ACCESS",
    title: "Masuk ke Control Center.",
    lead: "Khusus administrator LetsGo yang telah terotorisasi.",
    emailPlaceholder: "admin@letsgo.co.id",
    submit: "Masuk sebagai Admin",
    rememberTitle: "Pertahankan sesi admin",
    rememberText: "Gunakan hanya pada perangkat terpercaya.",
    securityTitle: "Admin verification",
    securityText: "Akses diverifikasi melalui Supabase Auth dan app_admins."
  }
};

function showNotice(message, type = "error") {
  notice.textContent = message;
  notice.className = `notice show ${type}`;
}

function clearNotice() {
  notice.textContent = "";
  notice.className = "notice";
}

function setMode(mode) {
  loginMode = mode;
  const copy = COPY[mode];

  $("#userModeBtn").classList.toggle("active", mode === "user");
  $("#adminModeBtn").classList.toggle("active", mode === "admin");
  $("#userModeBtn").setAttribute("aria-selected", String(mode === "user"));
  $("#adminModeBtn").setAttribute("aria-selected", String(mode === "admin"));

  $("#modeEyebrow").textContent = copy.eyebrow;
  $("#loginTitle").textContent = copy.title;
  $("#loginLead").textContent = copy.lead;
  emailInput.placeholder = copy.emailPlaceholder;
  submitLabel.textContent = copy.submit;
  $("#rememberTitle").textContent = copy.rememberTitle;
  $("#rememberText").textContent = copy.rememberText;
  $("#securityTitle").textContent = copy.securityTitle;
  $("#securityText").textContent = copy.securityText;

  $("#userFooter").classList.toggle("hidden", mode !== "user");
  $("#adminFooter").classList.toggle("hidden", mode !== "admin");

  clearNotice();
}

async function checkAdmin(userId) {
  const { data, error } = await supabase
    .from("app_admins")
    .select("user_id, role, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function routeExistingSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;

    const admin = await checkAdmin(user.id).catch(() => null);

    if (admin) {
      window.location.replace("admin.html");
      return;
    }

    window.location.replace(getSafeNext());
  } catch (error) {
    console.warn("[LetsGo Login] session check:", error);
  }
}

$("#userModeBtn").addEventListener("click", () => setMode("user"));
$("#adminModeBtn").addEventListener("click", () => setMode("admin"));

toggle.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  toggle.textContent = show ? "Sembunyi" : "Lihat";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();

  $("#emailError").textContent = "";
  $("#passwordError").textContent = "";

  const email = emailInput.value.trim().toLowerCase();
  const pass = password.value;

  if (!email) {
    $("#emailError").textContent = "Email wajib diisi.";
    return;
  }

  if (pass.length < 6) {
    $("#passwordError").textContent = "Password minimal 6 karakter.";
    return;
  }

  btn.disabled = true;
  submitLabel.textContent = loginMode === "admin" ? "Memverifikasi admin..." : "Memproses...";

  try {
    const result = await signIn({ email, password: pass });

    if (loginMode === "admin") {
      const userId =
        result?.user?.id ||
        result?.data?.user?.id ||
        (await supabase.auth.getUser())?.data?.user?.id;

      if (!userId) {
        throw new Error("Sesi administrator tidak berhasil dibuat.");
      }

      const admin = await checkAdmin(userId);

      if (!admin) {
        await supabase.auth.signOut();
        throw new Error("Akun ini tidak memiliki akses administrator LetsGo.");
      }

      sessionStorage.setItem("letsgo_admin_profile", JSON.stringify({
        userId,
        email,
        role: admin.role,
        signedInAt: new Date().toISOString()
      }));

      showNotice("Akses admin terverifikasi. Membuka Control Center...", "success");
      setTimeout(() => window.location.replace("admin.html"), 220);
      return;
    }

    showNotice("Login berhasil. Menyiapkan LetsGo...", "success");
    setTimeout(() => window.location.replace(getSafeNext()), 180);

  } catch (error) {
    const rawMessage = error?.message || "";
    const message =
      rawMessage.toLowerCase().includes("email not confirmed")
        ? "Email belum dikonfirmasi. Buka email dari LetsGo lalu klik tautan verifikasi."
        : rawMessage.includes("Invalid login credentials")
          ? "Email atau password tidak sesuai."
          : rawMessage || "Gagal masuk. Silakan coba lagi.";

    showNotice(message);
  } finally {
    btn.disabled = false;
    submitLabel.textContent = COPY[loginMode].submit;
  }
});

const registerLink=document.querySelector("#userFooter a");
if(registerLink)registerLink.href=`register.html?next=${encodeURIComponent(getSafeNext())}`;

setMode("user");
routeExistingSession();
