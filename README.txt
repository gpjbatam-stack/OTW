LETSGO — FLOW REVISION 2026-08-24

ACTIVE FLOW:
flight-detail.html -> passenger-details.html -> flight-review.html -> detail-pesanan.html

CHANGES:
1. Bagasi/asuransi dipilih langsung di Flight Detail.
2. Passenger Details langsung ke Flight Review.
3. flight-addons.* dihapus dari flow dan tidak disertakan.
4. flight-booking.* dihapus dari flow dan tidak disertakan.
5. Konfirmasi pada Flight Review langsung INSERT ke flight_orders lalu menuju Detail Pesanan.
6. Branding UI dikonversi ke LetsGo.
7. Storage key lama berawalan otw_ tetap dibaca/dipakai secara internal untuk kompatibilitas dengan halaman lama/upstream. Tidak tampil ke pengguna.
8. Nomor pengajuan baru menggunakan prefix LG-.

REPLACE FILES:
- flight-detail.html/css/js
- passenger-details.html/css/js
- flight-review.html/css/js

DELETE FROM REPOSITORY:
- flight-addons.html/css/js
- flight-booking.html/css/js
