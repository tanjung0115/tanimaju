# Validation Evidence

Pass runtime 3–4 Oktober 2026: [laporan](../../LOCAL-RUNTIME-VALIDATION.md), [17/17 API](runtime-api-results.json), [43/43 browser](runtime-browser-results.json), [10/10 tambahan](runtime-extra-results.json), [reproduksi/fix Panen](linked-harvest-regression.json), [live state](runtime-live-state.json), [cleanup/persiapan](runtime-preparation.json). DELETE hanya dummy baru; batas tanpa DELETE berikut berlaku untuk pass portfolio terdahulu.

Bukti final 3 Oktober 2026 pada database dummy terpisah; tidak berisi secret.

- [api-results.json](api-results.json): 17/17 real Express/MySQL groups; migration list/engine.
- [browser-results.json](browser-results.json): 21/21 Chrome CDP real UI groups.
- [browser-downloads.json](browser-downloads.json): native CSV/XLSX downloads completed dan isi file diverifikasi di folder project.
- [schema.json](schema.json): metadata INFORMATION_SCHEMA, 16 tabel/17 FK/unique keys.
- [demo-preparation.json](demo-preparation.json): pending Agus/unlinked profile dan new unread event, tanpa reset history.

Test standar Tahap 8-11 tetap fixture/mocks (16/16); SQL stage9/10 memakai SELECT-only fixtures. Hasil browser adalah otomatis, sign-off manusia belum dilakukan. Tidak menjalankan successful delete/drop/truncate. Artefak ini adalah snapshot hasil run, bukan klaim seluruh codepath atau deployment.

[Laporan final](../../FINAL-VALIDATION.md), [checklist](../../REGRESSION-CHECKLIST.md), [debt](../../TECHNICAL-DEBT.md).
