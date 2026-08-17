OTW REBUILD V1 — GITHUB READY
================================

STRUKTUR
Semua file diletakkan langsung di ROOT repository GitHub.
Tidak ada folder CSS, JS, atau assets pada tahap ini.

ALUR APLIKASI
index.html
  -> Splash premium
  -> cek session Supabase
  -> belum login: login.html
  -> sudah login tetapi profil belum lengkap: complete-account.html 
  -> sudah login dan profil lengkap: home.html

SUPABASE
Project URL sudah terpasang.
Publishable Key sudah terpasang di supabase.js.

PENTING
- Secret Key / service_role JANGAN pernah dimasukkan ke frontend.
- Secret Key yang pernah terekspos sebaiknya di-rotate/revoke dari dashboard Supabase.
- Flight API secret nanti ditempatkan server-side / Supabase Edge Function / Vault.

FILE UTAMA
index.html
splash.js

login.html
login.js

register.html
register.js

complete-account.html
complete-account.js

home.html
home.js

auth.css
supabase.js
auth-service.js
profile-service.js
guard.js

UPLOAD KE GITHUB
1. Buat / kosongkan repository OTW.
2. Upload SEMUA file hasil extract ZIP ini langsung ke root repository.
3. Commit.
4. Settings -> Pages.
5. Deploy from branch: main / root.
6. Buka GitHub Pages URL.

CATATAN
Home pada paket ini masih halaman fondasi.
Desain Home OTW final akan dibangun pada tahap selanjutnya.
