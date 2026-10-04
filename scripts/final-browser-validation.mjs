// Run only against the isolated demo API/UI and isolated Chrome profile described in DEMO.md.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { browserSession } from './browser-cdp.mjs';
const state = JSON.parse(await fs.readFile(new URL('../.validation/demo-state.json', import.meta.url), 'utf8'));
assert.match(state.database, /^tanimaju_demo_/);
assert.equal(process.env.FINAL_BROWSER_DEMO, state.database);
const b = await browserSession();
const downloadDirectory = new URL('../.validation/downloads/', import.meta.url);
await fs.mkdir(downloadDirectory, { recursive: true });
await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: fileURLToPath(downloadDirectory), eventsEnabled: true });
await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
await b.send('Network.clearBrowserCookies');
const screenshots = new URL('../docs/screenshots/', import.meta.url);
await fs.mkdir(screenshots, { recursive: true });
const checks = [];
const check = async (name, action) => {
  try { await action(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  console.log(`${checks.at(-1).status}: ${name}`);
};
const hasText = text => `document.body.innerText.includes(${JSON.stringify(text)})`;
const screenshot = async name => { await new Promise(resolve => setTimeout(resolve, 1800)); await b.screenshot(new URL(name + '.png', screenshots)); };
const login = async (email, path) => {
  await b.send('Network.clearBrowserCookies');
  await b.navigate('/login');
  await b.fill('#email', email); await b.fill('#password', state.password);
  await b.click('button[type="submit"]');
  await b.wait(`location.pathname === ${JSON.stringify(path)}`);
};
const ready = async text => {
  await b.wait(hasText(text));
  await b.wait(`!document.body.innerText.includes('Memuat data...') && !document.body.innerText.includes('Memuat dashboard...')`);
};
const select = async (selector, value) => {
  await b.wait(`!![...document.querySelector(${JSON.stringify(selector)}).options].find(el => el.value === ${JSON.stringify(String(value))})`);
  await b.fill(selector, value);
};
const radix = async (id, label) => {
  await b.click('#' + id);
  await b.wait(`!![...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()===${JSON.stringify(label)})`);
  await b.evaluate(`(() => { const el=[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()===${JSON.stringify(label)}); el.setAttribute('data-cdp-option','true'); })()`);
  await b.click('[data-cdp-option="true"]');
};
try {
  await check('Landing page renders public content', async () => {
    await b.navigate('/'); await ready('Healthy & Sustainable');
    await b.wait('[...document.images].filter(i=>i.getBoundingClientRect().top < innerHeight).every(i=>i.complete)', 20000);
    await screenshot('landing-page');
  });
  const suffix = String(Date.now()).slice(-6);
  const email = `sari${suffix}@demo.tanimaju.test`;
  const name = `Sari Handayani ${suffix}`;
  await check('Register form, pending approval and denied pending login', async () => {
    await b.navigate('/register');
    await b.fill('#namaLengkap', name); await b.fill('#email', email); await b.fill('#password', state.password);
    await b.click('button[type="submit"]');
    await b.wait(hasText('Please wait for admin approval'));
    await b.wait('location.pathname === "/login"');
    await b.wait('document.title === "Login - TaniMaju"');
    await b.fill('#email', email); await b.fill('#password', state.password);
    await b.click('button[type="submit"]'); await b.wait('!!document.querySelector("[role=alert]")');
    assert.equal(await b.evaluate('location.pathname'), '/login');
  });
  await check('Admin login opens populated dashboard', async () => {
    await login(state.accounts.admin, '/admin'); await ready('Total Petani');
    assert.equal(await b.evaluate('document.querySelectorAll("[role=alert]").length'), 0);
    await screenshot('admin-dashboard');
  });
  await check('Admin approval with confirmation dialog', async () => {
    await b.navigate('/admin/user-approval'); await ready(email);
    await b.evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(el=>el.innerText.includes(${JSON.stringify(email)})); const button=[...row.querySelectorAll('button')].find(el=>el.textContent.includes('Approve')); button.setAttribute('data-approve-demo','true'); })()`);
    await b.click('[data-approve-demo="true"]'); await b.wait(hasText('Konfirmasi Persetujuan'));
    await b.button('Konfirmasi');
    await b.wait(`![...document.querySelectorAll('tr')].find(el=>el.innerText.includes(${JSON.stringify(email)}))?.innerText.includes('Pending')`);
  });
  await check('Admin creates Petani without photo and links approved user', async () => {
    await b.navigate('/admin/petani/create');
    await b.fill('#nama', name); await b.fill('#alamat', 'Desa Sukamaju (data demo)'); await b.fill('#nomorKontak', '000000000000');
    await b.click('[data-form-submit]'); await b.wait('location.pathname === "/admin/petani"'); await ready(name);
    await b.navigate('/admin/user-approval'); await ready(email);
    await b.evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(el=>el.innerText.includes(${JSON.stringify(email)})); row.querySelector('select').setAttribute('data-link-demo','true'); })()`);
    await b.wait(`!![...document.querySelector('[data-link-demo="true"]').options].find(el=>el.textContent===${JSON.stringify(name)})`);
    const id = await b.evaluate(`[...document.querySelector('[data-link-demo="true"]').options].find(el=>el.textContent===${JSON.stringify(name)}).value`);
    await b.fill('[data-link-demo="true"]', id);
    await b.wait(`[...document.querySelectorAll('tr')].find(el=>el.innerText.includes(${JSON.stringify(email)}))?.innerText.includes('Terhubung')`);
  });
  await check('Admin Tanaman create form and persisted list', async () => {
    await b.navigate('/admin/tanaman/create'); await b.fill('#namaTanaman', 'Jagung Manis Demo'); await radix('pupuk', 'Kompos');
    await b.click('[data-form-submit]'); await b.wait('location.pathname === "/admin/tanaman"'); await ready('Jagung Manis Demo');
  });
  await check('Admin Bibit create form and persisted list', async () => {
    await b.navigate('/admin/bibit/create');
    for (const [id, value] of [['tanaman', 'Jagung Manis Demo'], ['sumber', 'Koperasi desa'], ['namaPenyedia', 'Koperasi Jagung Demo'], ['tanggalPemberian', state.date]]) await b.fill('#' + id, value);
    await b.click('[data-form-submit]'); await b.wait('location.pathname === "/admin/bibit"'); await ready('Koperasi Jagung Demo');
  });
  const landName = 'Blok Timur Demo ' + suffix;
  await check('Admin Lahan create/edit and live list refresh', async () => {
    await b.navigate('/admin/lahan'); await ready('Sukabirus');
    await select('form select[aria-label="Petani"]', state.aPetani);
    await b.fill('[aria-label="Nama lahan"]', landName); await b.fill('[aria-label="Luas (ha)"]', '0.75'); await b.fill('form [aria-label="Lokasi"]', 'Desa Sukamaju (demo)');
    await b.button('Tambah'); await ready(landName);
    await b.evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(el=>el.innerText.includes(${JSON.stringify(landName)})); [...row.querySelectorAll('button')].find(el=>el.innerText.includes('Edit')).setAttribute('data-edit-demo','true'); })()`);
    await b.click('[data-edit-demo="true"]'); await b.fill('form [aria-label="Lokasi"]', 'Blok Timur, Desa Sukamaju (demo)'); await b.button('Simpan');
    await ready('Blok Timur, Desa Sukamaju (demo)'); await screenshot('lahan');
  });
  await check('Admin Siklus Tanam form creates persisted cycle', async () => {
    await b.navigate('/admin/aktivitas-pertanian'); await ready('Siklus Tanam Baru');
    await select('form select[aria-label="Lahan"]', state.aLand); await select('form select[aria-label="Tanaman"]', state.tanaman);
    await b.fill('[aria-label="Tanggal tanam"]', state.date); await b.fill('[aria-label="Perkiraan tanggal panen"]', state.date);
    await b.button('Simpan Siklus'); await b.wait(`document.querySelector('[aria-label="Tanggal tanam"]').value === ''`);
  });
  await check('Admin Aktivitas form creates monitoring event', async () => {
    await select('form select[aria-label="Siklus Tanam"]', state.aCycle); await b.fill('form select[aria-label="Jenis aktivitas"]', 'monitoring');
    await b.fill('[aria-label="Tanggal aktivitas"]', state.date); await b.fill('[aria-label="Kondisi lahan/tanaman"]', 'Irigasi lancar - browser demo');
    await b.button('Simpan Aktivitas'); await ready('Irigasi lancar - browser demo');
    await b.evaluate('document.querySelector("main").scrollTop = 0'); await screenshot('aktivitas-pertanian');
  });
  await check('Admin Panen form persists and dashboard updates', async () => {
    const before = await b.evaluate(`fetch('http://localhost:5310/api/dashboard/admin',{credentials:'include'}).then(r=>r.json()).then(r=>r.summary.panen_bulan_ini)`);
    await b.navigate('/admin/panen/create');
    await b.fill('#tanggalPanen', state.date);
    await radix('petani', 'Ratna Wulandari'); await radix('lahan', 'Sukabirus'); await radix('bibit', 'Koperasi Tani Sukamaju'); await radix('tanaman', 'Padi Inpari 32'); await radix('pupuk', 'NPK');
    await b.fill('#jumlahHasilPanen', '2750'); await radix('status', 'Belum Terjual');
    await b.click('[data-form-submit]'); await b.wait('location.pathname === "/admin/panen"'); await ready('2750');
    const after = await b.evaluate(`fetch('http://localhost:5310/api/dashboard/admin',{credentials:'include'}).then(r=>r.json()).then(r=>r.summary.panen_bulan_ini)`);
    assert.equal(after, before + 1);
  });
  await check('Admin report/export downloads CSV via UI', async () => {
    await b.navigate('/admin/panen'); await ready('2750');
    await b.fill('[aria-label="Format export"]', 'csv'); await b.button('Export'); await b.wait(hasText('Laporan berhasil diunduh'));
    await b.evaluate('document.querySelector("details").open = true');
    await b.evaluate('document.querySelector("main").scrollTop = 0'); await screenshot('reporting-export');
  });
  await check('Admin notification bell shows own empty state', async () => {
    await b.click('button[aria-label^="Notifikasi,"]'); await b.wait(hasText('Belum ada notifikasi.')); await b.button('Close');
  });
  await check('Admin logout clears authenticated UI', async () => {
    await b.click('[aria-label="Logout"]'); await b.wait('location.pathname === "/login" || location.pathname === "/"');
    await b.navigate('/admin'); await b.wait('location.pathname === "/login"');
  });
  await check('Petani login opens personal dashboard and only own panels', async () => {
    await login(state.accounts.a, '/petani'); await ready('Ratna Wulandari'); await ready('Panen Terbaru');
    assert.ok(!(await b.evaluate('document.body.innerText')).includes('Dedi Setiawan'));
    await screenshot('petani-dashboard');
  });
  await check('Petani Lahan Saya/Siklus Saya/Aktivitas Saya/Panen Saya', async () => {
    await b.navigate('/admin/lahan'); await ready('Sukabirus');
    assert.ok(!(await b.evaluate('document.body.innerText')).includes('Sukapura'));
    assert.equal(await b.evaluate('document.querySelectorAll("form").length'), 0);
    await b.navigate('/admin/aktivitas-pertanian'); await ready('Irigasi lancar - browser demo');
    assert.ok(!(await b.evaluate('document.body.innerText')).includes('Dedi Setiawan'));
    await b.navigate('/admin/panen'); await b.wait('location.pathname === "/unauthorized"');
    await b.navigate('/petani'); await ready('Panen Terbaru'); // Panen Saya is a dashboard panel; the master Panen route is Admin/Penyuluh.
  });
  await check('Petani can submit own activity and export scoped data via UI', async () => {
    await b.navigate('/admin/aktivitas-pertanian'); await ready('Catat Aktivitas');
    await select('form select[aria-label="Siklus Tanam"]', state.aCycle); await b.fill('form select[aria-label="Jenis aktivitas"]', 'monitoring');
    await b.fill('[aria-label="Tanggal aktivitas"]', state.date); await b.fill('[aria-label="Kondisi lahan/tanaman"]', 'Pemeriksaan Petani - browser demo');
    await b.button('Simpan Aktivitas'); await ready('Pemeriksaan Petani - browser demo');
    await b.fill('[aria-label="Format export"]', 'csv'); await b.button('Export'); await b.wait(hasText('Laporan berhasil diunduh'));
  });
  await check('Petani notification panel, unread count, read and read-all', async () => {
    await b.navigate('/petani'); await ready('Ratna Wulandari');
    await b.wait(`!!document.querySelector('button[aria-label^="Notifikasi,"]')`);
    await b.click('button[aria-label^="Notifikasi,"]'); await b.wait(hasText('Pengingat Pemupukan')); await b.wait('!document.body.innerText.includes("Memuat notifikasi...")');
    await screenshot('notification');
    const unreadBefore = await b.evaluate(`Number(document.querySelector('button[aria-label^="Notifikasi,"]').getAttribute('aria-label').match(/[0-9]+/)[0])`);
    await b.button('Tandai dibaca');
    await b.wait(`Number(document.querySelector('button[aria-label^="Notifikasi,"]').getAttribute('aria-label').match(/[0-9]+/)[0]) === ${unreadBefore - 1}`);
    if (unreadBefore > 1) { await b.button('Tandai semua dibaca'); await b.wait(`document.querySelector('button[aria-label^="Notifikasi,"]').getAttribute('aria-label').includes('0 belum dibaca')`); }
    await b.button('Close');
  });
  await check('Mobile dashboard/drawer keyboard, no page overflow (390px)', async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await b.navigate('/petani'); await ready('Ratna Wulandari');
    assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await screenshot('petani-mobile');
    await b.click('[aria-label="Buka navigasi"]'); await b.wait('!!document.querySelector("[role=dialog]")');
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await b.wait('!document.querySelector("[role=dialog]")');
  });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await check('Penyuluh login, read-only farming and blocked admin route', async () => {
    await login(state.accounts.penyuluh, '/admin/lahan'); await ready('Sukapura');
    assert.equal(await b.evaluate('document.querySelectorAll("form").length'), 0);
    await b.navigate('/admin/aktivitas-pertanian'); await ready('Siklus Tanam');
    assert.equal(await b.evaluate('document.querySelectorAll("form").length'), 0);
    await b.navigate('/admin/user-approval'); await b.wait('location.pathname === "/unauthorized"');
  });
  await check('No uncaught browser JavaScript exceptions', async () => { assert.deepEqual(b.errors, []); });
} finally {
  await fs.writeFile(new URL('../docs/validation/browser-results.json', import.meta.url), JSON.stringify({ database: state.database, checkedAt: new Date().toISOString(), browser: 'Chrome headless via CDP; real React UI + Express + MySQL', checks, limitations: ['Automated browser interaction; human manual sign-off remains pending.', 'No successful destructive actions executed.', 'Screenshot data is fictitious.'] }, null, 2) + '\n');
  await b.close();
}
if (checks.some(row => row.status === 'FAIL')) process.exitCode = 1;
