# Portfolio Summary & Interview Notes

## Recruiter-friendly summary

TaniMaju adalah aplikasi full-stack pengelolaan pertanian berbasis React, TypeScript, Express dan MySQL. Aplikasi menerapkan role-based access untuk Admin, Petani dan Penyuluh serta ownership di backend untuk data pertanian milik Petani. Pengelolaan Lahan, Siklus, Aktivitas dan Panen terhubung dengan dashboard, filtering, laporan Excel/CSV dan notifikasi persisten berbasis jadwal. Engineering validation mencakup migration, API/database integration, pengujian browser dan dokumentasi batas keamanan.

Summary ini menjelaskan project, bukan mengklaim semua codebase dibuat sendiri.

## Contribution statement

Pembagian kerja pribadi/tim belum diberikan, sehingga **jangan menyatakan "saya membangun seluruh project sendiri"**. Sebelum interview, pilih hanya bagian yang benar-benar Anda kerjakan/review dan bisa dijelaskan, lalu gunakan pola:

> Saya terlibat dalam pengembangan TaniMaju. Kontribusi saya berfokus pada [area yang benar-benar saya kerjakan], dengan tanggung jawab [implementasi/review/pengujian yang benar-benar saya lakukan]. Bagian [area tim] dikerjakan bersama anggota tim, dan saya menggunakan bantuan AI untuk [bagian yang sesuai fakta].

Ini template contribution, bukan pernyataan kontribusi yang sudah dikonfirmasi. Catatan di bawah adalah perubahan/kondisi repository yang terbukti, bukan atribusi otomatis kepada satu orang.

## Architecture

- Jelaskan empat layer: React/TypeScript -> Express REST API -> Repository -> MySQL.
- Frontend mengatur tampilan, form, filter URL, loading/error; backend menentukan authorization dan owner.
- Repository menyediakan query terparameter dan shared list/export plans; database menjaga FK serta uniqueness.
- Mengapa layer repository: menjaga SQL dan domain scope terpisah dari HTTP handler serta memudahkan integration testing.

## Database design

- User terhubung optional 1:1 ke Petani melalui user_id nullable unique.
- Petani -> Lahan -> Siklus Tanam -> Aktivitas; Tanaman melekat pada Siklus.
- Panen menunjuk master dan mempunyai optional FK Lahan/Siklus agar data legacy tetap valid.
- Activity Reminders adalah rencana, berbeda dari histori Aktivitas; Notification menyimpan status read/due/cancel.
- Unique event di database memberi dedup persisten; entity type/ID notification merupakan polymorphic reference yang direkonsiliasi scheduler.
- FK RESTRICT/CASCADE/SET NULL dipilih menurut relasi; destructive delete/cascade belum dijalankan dalam final pass.

## Role and ownership

Pertanyaan: "Apa bedanya role dan ownership?"

Role menentukan jenis aksi, misalnya Admin menulis master sedangkan Penyuluh read-only. Ownership menentukan baris yang dapat diakses Petani; akun login di server menjadi sumber user_id, bukan field dari request. Test dengan A/B, ID detail, perubahan parent reference dan filter export membuktikan data B tidak masuk ke scope A. Admin notification tetap milik akun Admin sendiri, walaupun Admin membaca semua farming.

Batas jujur: beberapa GET legacy tetap publik; jangan mengklaim seluruh data pertanian privat bagi anonymous. Itu kebijakan yang perlu diputuskan sebelum production/data pribadi.

## Security decisions

- Password bcrypt; registration Petani pending, approval/link eksplisit.
- JWT cookie HttpOnly/SameSite Lax; role/status dibaca dari DB saat request, bukan percaya claim role atau localStorage.
- Parameterized SQL dan sort whitelist; batas pagination/export; CSV formula escape.
- Upload MIME/extension allowlist, size cap, UUID filename, nosniff.
- Logout membersihkan cookie dan session. Jelaskan bahwa JWT bearer yang sudah dicuri belum otomatis direvoke; ini debt, bukan diklaim aman penuh.
- Header/basic input checks tidak menggantikan rate limiting, upload content inspection atau dependency audit.

## Concrete engineering challenge

Gunakan kasus yang benar-benar ditemukan pada final pass:

1. Mock tests/build hijau belum membuktikan SQL INSERT bekerja pada skema lengkap.
2. Fresh MySQL integration mengungkap optional foto Petani dikirim undefined serta placeholder Panen tidak sesuai jumlah kolom.
3. Date MySQL2 menjadi JS Date membuat perbandingan calendar string lewat tanpa menolak aktivitas sebelum tanam.
4. Perbaikan memakai NULL bind, jumlah placeholder yang benar dan DATE calendar string. Pengujian before-planting sekarang mengembalikan 400.
5. Browser menemukan login Petani/Penyuluh menuju halaman Admin. Redirect role memperbaiki alur dengan 21 browser checks PASS.

Jelaskan problem -> diagnosis -> perubahan kecil -> bukti hasil. Jangan menceritakannya sebagai kontribusi pribadi tanpa menyesuaikan attribution.

## Testing

| Bukti | Yang bisa diklaim |
| --- | --- |
| 16 Node tests | Validasi auth/role/filter/export/notification/upload/API helper dan date cases dengan HTTP/mock/fixture |
| 17 real API/MySQL groups | Fresh schema, create/read/update, ownership A/B, lima report formats, empat persisted reminder types, dedup/read state |
| 21 Chrome groups | Form/register/approval/login tiga role, farming, dashboard delta, export, bell/read-all, mobile drawer |
| INFORMATION_SCHEMA | 13 migration, 16 tabel, 17 FK, ownership unique dan notification dedup index |
| Build/typecheck/scoped lint | PASS pada cakupan yang dinyatakan |

Bedakan fixture dari persistence. Jangan mengklaim successful delete, semua browser, production deployment, manual human sign-off atau lint seluruh repo lulus. Full lint tetap 35 errors/9 warnings.

## Improvements and tradeoffs

Peningkatan repository mencakup ownership/detail scope, predictable API errors, native validation/submit lock, upload hardening dasar, pagination/filter/report scope, persisted reminders, mobile layout, typing dan regression tests. Final pass memvalidasi migration serta workflow dengan data nyata dummy, kemudian menyiapkan screenshot dan dokumentasi.

Tradeoff penting: mempertahankan data Panen legacy; runner portable column guard tetapi recovery partial DDL masih manual; scheduler in-process sederhana namun perlu coordination/observability bila beberapa instance; upload lokal cukup untuk demo namun belum storage production.

## Short answers to prepare

- "Mengapa notification tidak dibuat dari histori?" Histori adalah kejadian yang sudah dicatat; reminder memerlukan jadwal eksplisit atau tanggal siklus.
- "Bagaimana mencegah reminder ganda?" Unique event database + INSERT dedup; integration membuktikan ID tetap sama setelah scheduler ulang dan read state bertahan.
- "Apakah ini production-ready?" Siap demo lokal dengan dummy data; public/private policy, JWT revocation, deployment/security/dependency review masih perlu dikerjakan.
- "Apa yang ingin diperbaiki berikutnya?" Prioritaskan privacy/auth/session, lint/dependency review dan operational testing sebelum fitur tambahan.

Buka [DEMO.md](DEMO.md), [ARCHITECTURE.md](ARCHITECTURE.md), dan [TECHNICAL-DEBT.md](TECHNICAL-DEBT.md) untuk angka dan batas bukti saat interview.
