import { signUp } from "./auth-service.js";
import { redirectIfAuthenticated } from "./guard.js";
import { supabase } from "./supabase.js";

const nextParam = new URLSearchParams(window.location.search).get("next") || "home.html";
const safeNext = (/^[a-zA-Z0-9._-]+(?:\?[a-zA-Z0-9%&=._-]*)?$/.test(nextParam) && !nextParam.includes("://"))
  ? nextParam
  : "home.html";

await redirectIfAuthenticated({ redirect: safeNext });

const form = document.querySelector("#registerForm");
const notice = document.querySelector("#notice");
const btn = document.querySelector("#submitBtn");
const fileInput = document.querySelector("#ktpFile");
const fileTitle = document.querySelector("#fileTitle");
const preview = document.querySelector("#preview");
const previewImg = document.querySelector("#previewImg");
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

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) {
    fileTitle.textContent = "Pilih foto KTP";
    preview.classList.remove("show");
    return;
  }

  fileTitle.textContent = file.name;

  if (file.type.startsWith("image/")) {
    previewImg.src = URL.createObjectURL(file);
    preview.classList.add("show");
  }
});

function validateKtpFile(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!file) throw new Error("Foto KTP wajib diunggah.");
  if (!allowed.includes(file.type)) throw new Error("Format foto KTP harus JPG, PNG, atau WEBP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran foto KTP maksimal 5 MB.");
}

async function uploadKtp(userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/ktp-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("ktp-documents")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  const { data, error: updateError } = await supabase
    .from("profiles")
    .update({ ktp_url: path })
    .eq("id", userId)
    .select("id")
    .single();

  if (updateError) {
    await supabase.storage.from("ktp-documents").remove([path]);
    throw updateError;
  }

  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.className = "notice";

  const fullName = form.fullName.value.trim();
  const phone = form.phone.value.replace(/\s|-/g, "");
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const ktpFile = fileInput.files?.[0];

  try {
    if (fullName.length < 3) throw new Error("Nama lengkap belum valid.");
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(phone)) {
      throw new Error("Nomor HP belum valid.");
    }
    if (password.length < 8) throw new Error("Password minimal 8 karakter.");
    validateKtpFile(ktpFile);
  } catch (error) {
    return showNotice(error.message);
  }

  btn.disabled = true;
  btn.textContent = "Menyiapkan akun...";

  try {
    const result = await signUp({ fullName, email, phone, password });

    if (!result.user) {
      throw new Error("Akun gagal dibuat.");
    }

    if (!result.session) {
      throw new Error(
        "Supabase masih mewajibkan verifikasi email. Matikan Confirm Email pada Authentication > Providers > Email."
      );
    }

    btn.textContent = "Mengunggah KTP...";
    await uploadKtp(result.user.id, ktpFile);

    showNotice("Akun LetsGo berhasil dibuat.", "success");
    setTimeout(() => window.location.replace(safeNext), 350);
  } catch (error) {
    const msg =
      error?.message?.toLowerCase().includes("already registered")
        ? "Email tersebut sudah terdaftar."
        : error?.message || "Registrasi gagal. Silakan coba lagi.";
    showNotice(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = "Daftar & Masuk";
  }
});
