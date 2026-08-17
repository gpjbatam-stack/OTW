import { requireAuth } from "./guard.js";
import { getMyProfile, updateMyProfile } from "./profile-service.js";

await requireAuth({ redirect: "login.html" });

const form = document.querySelector("#profileForm");
const notice = document.querySelector("#notice");
const btn = document.querySelector("#submitBtn");

function showNotice(message, type = "error") {
  notice.textContent = message;
  notice.className = `notice show ${type}`;
}

try {
  const profile = await getMyProfile();
  if (profile) {
    for (const key of [
      "full_name",
      "phone",
      "employee_number",
      "position_title",
      "department",
      "ktp_number",
    ]) {
      if (form.elements[key]) form.elements[key].value = profile[key] || "";
    }
  }
} catch (error) {
  showNotice(error.message || "Gagal memuat profil.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.className = "notice";

  const payload = {
    full_name: form.full_name.value.trim(),
    phone: form.phone.value.trim(),
    employee_number: form.employee_number.value.trim() || null,
    position_title: form.position_title.value.trim() || null,
    department: form.department.value.trim() || null,
    ktp_number: form.ktp_number.value.trim() || null,
  };

  if (payload.ktp_number && !/^\d{16}$/.test(payload.ktp_number)) {
    return showNotice("NIK KTP harus terdiri dari 16 digit.");
  }

  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    await updateMyProfile(payload);
    showNotice("Profil berhasil disimpan.", "success");
    setTimeout(() => window.location.replace("home.html"), 450);
  } catch (error) {
    showNotice(error.message || "Gagal menyimpan profil.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan & Lanjutkan";
  }
});
