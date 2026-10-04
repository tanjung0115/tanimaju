// Opt-in integration pass. Writes ONLY to a new, explicitly named demo database.
// Run from backend after build + migrations. No DROP/TRUNCATE/DELETE or cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
dotenv.config({ quiet: true });
const database = process.env.MYSQL_DATABASE;
assert.match(database ?? '', /^tanimaju_demo_[a-z0-9_]+$/);
assert.equal(process.env.FINAL_VALIDATION_WRITE, 'new-demo-only');
const pool = (await import('../dist/config/mysql-database.js')).default;
const { generateReminders, jakartaTimestamp } = await import('../dist/services/reminderScheduler.js');
const output = new URL('../../docs/validation/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const checks = [];
const check = async (name, action) => {
  try { await action(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  console.log(`${checks.at(-1).status}: ${name}`);
};
const [schema] = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
assert.equal(schema.length, 13);
const [tables] = await pool.query('SHOW TABLES');
const [version] = await pool.query('SELECT VERSION() AS version');
const [users] = await pool.query('SELECT COUNT(*) AS n FROM users');
assert.equal(Number(users[0].n), 0, 'Use a fresh demo DB; this pass never overwrites existing data.');
for (const row of tables) {
  const name = Object.values(row)[0];
  assert.match(name, /^[a-z_]+$/);
  if (name === 'schema_migrations') continue;
  const [counts] = await pool.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
  assert.equal(Number(counts[0].n), 0, `Demo table ${name} must be empty.`);
}
checks.push({ name: 'Fresh migration 001-013 and 16 tables', status: tables.length === 16 ? 'PASS' : 'FAIL' });
const password = 'DemoTani2026!'; // PUBLIC DUMMY password, never use outside disposable local demo.
const hash = await bcrypt.hash(password, 10);
await pool.execute("INSERT INTO users (username,email,password,role,status,is_active) VALUES (?,?,?,'admin','approved',1)", ['Admin Demo', 'admin@demo.tanimaju.test', hash]);
await pool.execute("INSERT INTO users (username,email,password,role,status,is_active) VALUES (?,?,?,'penyuluh','approved',1)", ['Penyuluh Demo', 'penyuluh@demo.tanimaju.test', hash]);
const server = spawn(process.execPath, ['dist/server.js'], { env: { ...process.env, PORT: '5310', CLIENT_URL: 'http://localhost:5180', REMINDERS_ENABLED: 'false', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
const base = 'http://localhost:5310/api';
const request = async (path, cookie = '', method = 'GET', body, status = 200) => {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
  return { data: result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
let ready = false;
for (let i = 0; i < 60; i++) {
  // Do not accidentally send writes to another server already occupying this port.
  try { ready = server.exitCode === null && serverLog.includes('Server running on http://localhost:5310') && (await fetch('http://localhost:5310')).ok; } catch {}
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!ready) { server.kill(); await pool.end(); throw new Error('Isolated API did not start. Port 5310 must be free.'); }
const login = async email => (await request('/auth/login', '', 'POST', { email, password })).cookie;
const idOf = data => Number(data.id ?? data._id ?? data.userId ?? data.user?.id);
const today = jakartaTimestamp(new Date()).slice(0, 10);
const day = offset => new Date(new Date(`${today}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
const state = { database, date: today, password, accounts: { admin: 'admin@demo.tanimaju.test', a: 'ratna@demo.tanimaju.test', b: 'dedi@demo.tanimaju.test', penyuluh: 'penyuluh@demo.tanimaju.test' } };
try {
  const admin = await login(state.accounts.admin);
  const penyuluh = await login(state.accounts.penyuluh);
  await check('Register creates pending account; pending cannot login; admin approval', async () => {
    for (const [key, nama] of [['a', 'Ratna Wulandari'], ['b', 'Dedi Setiawan']]) {
      const registered = await request('/auth/register', '', 'POST', { nama, email: state.accounts[key], password, role: 'admin' }, 201);
      state[key + 'User'] = idOf(registered.data);
      await request('/auth/login', '', 'POST', { email: state.accounts[key], password }, 401);
      await request('/auth/update-user-status', admin, 'PUT', { userId: state[key + 'User'], status: 'approved', role: 'petani' });
    }
  });
  const a = await login(state.accounts.a);
  const b = await login(state.accounts.b);
  await check('Admin Petani create/read/update and explicit account link', async () => {
    for (const [key, nama] of [['a', 'Ratna Wulandari'], ['b', 'Dedi Setiawan']]) {
      const created = await request('/petani', admin, 'POST', { nama, alamat: 'Desa Sukamaju (data demo)', nomorKontak: '' }, 201);
      state[key + 'Petani'] = idOf(created.data);
      await request(`/petani/${state[key + 'Petani']}/link-user`, admin, 'PUT', { userId: state[key + 'User'] });
      await request(`/petani/${state[key + 'Petani']}`, admin, 'PUT', { alamat: 'Desa Sukamaju, Kabupaten Bandung (demo)' });
    }
  });
  await check('Admin Tanaman and Bibit create/read/update', async () => {
    state.tanaman = idOf((await request('/tanaman', admin, 'POST', { namaTanaman: 'Padi Inpari 32', pupuk: 'NPK dan kompos' }, 201)).data);
    state.bibit = idOf((await request('/bibit', admin, 'POST', { tanaman: 'Padi Inpari 32', sumber: 'Koperasi desa', namaPenyedia: 'Koperasi Tani Sukamaju', tanggalPemberian: day(-60) }, 201)).data);
    await request(`/tanaman/${state.tanaman}`, admin, 'PUT', { namaTanaman: 'Padi Inpari 32', pupuk: 'Kompos dan NPK' });
    await request(`/bibit/${state.bibit}`, admin, 'PUT', { tanaman: 'Padi Inpari 32', namaPenyedia: 'Koperasi Tani Sukamaju', sumber: 'Koperasi desa (demo)', tanggalPemberian: day(-60) });
  });
  await check('Admin Lahan create/read/update', async () => {
    for (const [key, nama] of [['a', 'Sukabirus'], ['b', 'Sukapura']]) {
      const input = { petani_id: state[key + 'Petani'], nama_lahan: nama, luas: key === 'a' ? 1.8 : 1.2, lokasi: 'Desa Sukamaju (demo)', status: 'produktif' };
      state[key + 'Land'] = idOf((await request('/lahan', admin, 'POST', input, 201)).data);
      await request(`/lahan/${state[key + 'Land']}`, admin, 'PUT', { ...input, lokasi: 'Blok Utara, Desa Sukamaju (demo)' });
    }
  });
  await check('Admin/Petani Siklus create/read/update on actual schema', async () => {
    for (const [key, cookie] of [['a', a], ['b', b]]) {
      const input = { lahan_id: state[key + 'Land'], tanaman_id: state.tanaman, tanggal_tanam: day(-60), perkiraan_tanggal_panen: day(1), status: 'aktif', luas_tanam: 1, catatan: 'Musim tanam demo' };
      state[key + 'Cycle'] = idOf((await request('/siklus-tanam', cookie, 'POST', input, 201)).data);
      await request(`/siklus-tanam/${state[key + 'Cycle']}`, cookie, 'PUT', { ...input, catatan: 'Musim tanam demo, monitoring rutin' });
    }
    state.plantingCycle = idOf((await request('/siklus-tanam', admin, 'POST', { lahan_id: state.aLand, tanaman_id: state.tanaman, tanggal_tanam: today, perkiraan_tanggal_panen: day(95), catatan: 'Persiapan tanam berikutnya' }, 201)).data);
  });
  await check('Admin/Petani Aktivitas create/read/update', async () => {
    for (const [key, cookie] of [['a', a], ['b', b]]) {
      const input = { siklus_tanam_id: state[key + 'Cycle'], jenis_aktivitas: 'monitoring', tanggal: today, kondisi: 'Daun sehat, irigasi lancar', catatan: 'Pemeriksaan rutin' };
      state[key + 'Activity'] = idOf((await request('/aktivitas-pertanian', cookie, 'POST', input, 201)).data);
      await request(`/aktivitas-pertanian/${state[key + 'Activity']}`, cookie, 'PUT', { ...input, kondisi: 'Daun sehat, irigasi stabil' });
    }
  });
  await check('Date validation rejects activity before planting', async () => {
    await request('/aktivitas-pertanian', a, 'POST', { siklus_tanam_id: state.aCycle, jenis_aktivitas: 'monitoring', tanggal: day(-65), kondisi: 'Invalid date demo' }, 400);
  });
  await check('Admin Panen create/read/update (legacy and cycle link)', async () => {
    const input = { petani: state.aPetani, tanaman: state.tanaman, bibit: state.bibit, lahan: 'Sukabirus', pupuk: 'NPK', jumlahHasilPanen: 4800, tanggalPanen: today, statusPenjualan: 'Belum Terjual', namaPembeli: '' };
    state.panen = idOf((await request('/panen', admin, 'POST', input, 201)).data);
    await request(`/panen/${state.panen}`, admin, 'PUT', { ...input, jumlahHasilPanen: 4850 });
    const cycle = idOf((await request('/siklus-tanam', admin, 'POST', { lahan_id: state.aLand, tanaman_id: state.tanaman, tanggal_tanam: day(-100), status: 'selesai' }, 201)).data);
    await request('/panen', admin, 'POST', { ...input, lahanId: state.aLand, siklusTanamId: cycle, jumlahHasilPanen: 3200 }, 201);
  });
  await check('Admin and personal dashboards run aggregate SQL', async () => {
    await request('/dashboard/admin', admin);
    const data = (await request('/dashboard/petani', a)).data;
    assert.equal(data.linked, true);
    assert.ok(!JSON.stringify(data).includes('Dedi Setiawan'));
  });
  await check('Ownership: list/detail/update/create scope cannot reach Petani B', async () => {
    await request(`/petani/${state.bPetani}`, a, 'GET', undefined, 404);
    for (const [path, id] of [['lahan', state.bLand], ['siklus-tanam', state.bCycle], ['aktivitas-pertanian', state.bActivity]]) {
      await request(`/${path}/${id}`, a, 'GET', undefined, 404);
      const rows = (await request(`/${path}?page=1&limit=20&petani_id=${state.bPetani}`, a)).data;
      // Petani filters are deliberately ignored in favor of the enforced owner.
      assert.ok(rows.data.every(row => row.petani_id === state.aPetani));
    }
    await request(`/lahan/${state.bLand}`, a, 'PUT', { petani_id: state.bPetani, nama_lahan: 'Attempt', luas: 1 }, 403);
    await request(`/siklus-tanam/${state.bCycle}`, a, 'PUT', { lahan_id: state.bLand, tanaman_id: state.tanaman, tanggal_tanam: today }, 404);
    await request(`/aktivitas-pertanian/${state.bActivity}`, a, 'PUT', { siklus_tanam_id: state.bCycle, tanggal: today, jenis_aktivitas: 'monitoring', kondisi: 'Attempt' }, 404);
    await request('/siklus-tanam', a, 'POST', { lahan_id: state.bLand, tanaman_id: state.tanaman, tanggal_tanam: today }, 400);
    await request('/aktivitas-pertanian', a, 'POST', { siklus_tanam_id: state.bCycle, tanggal: today, jenis_aktivitas: 'monitoring', kondisi: 'Attempt' }, 400);
  });
  await check('Penyuluh reads agricultural data, cannot invoke admin/farming actions', async () => {
    for (const path of ['lahan', 'siklus-tanam', 'aktivitas-pertanian']) {
      await request('/' + path, penyuluh);
      await request('/' + path, penyuluh, 'POST', {}, 403);
    }
    await request('/dashboard/admin', penyuluh, 'GET', undefined, 403);
    await request('/auth/users', penyuluh, 'GET', undefined, 403);
  });
  await check('All five reports CSV/XLSX; Petani cannot export B even with injected filter', async () => {
    for (const kind of ['panen', 'aktivitas', 'petani', 'tanaman', 'lahan']) {
      for (const format of ['csv', 'xlsx']) {
        const response = await fetch(`${base}/reports/${kind}/export?format=${format}`, { headers: { Cookie: admin } });
        assert.equal(response.status, 200, `${kind} ${format}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.ok(bytes.length > 30);
        if (format === 'xlsx') assert.equal(bytes.subarray(0, 2).toString(), 'PK');
      }
      const response = await fetch(`${base}/reports/${kind}/export?format=csv&petani_id=${state.bPetani}`, { headers: { Cookie: a } });
      assert.equal(response.status, 200);
      const csv = await response.text();
      assert.ok(!csv.includes('Dedi Setiawan') && !csv.includes('Sukapura'), kind);
    }
  });
  await check('Explicit pemupukan/pengobatan schedules persist and obey ownership', async () => {
    for (const type of ['pemupukan', 'pengobatan']) {
      await request('/reminders', a, 'POST', { siklus_tanam_id: state.aCycle, jenis_aktivitas: type, tanggal_rencana: today, nama_material: type === 'pemupukan' ? 'Kompos organik' : 'Pestisida nabati' }, 201);
    }
    await request('/reminders', a, 'POST', { siklus_tanam_id: state.bCycle, jenis_aktivitas: 'pemupukan', tanggal_rencana: today }, 404);
  });
  const config = { enabled: true, intervalMinutes: 30, hour: 0, catchupHours: 48, plantingDays: [0], harvestDays: [1], activityDays: [0] };
  await check('Persistent four reminder types, unique-key dedup across connections', async () => {
    await generateReminders(new Date(), config);
    let [rows] = await pool.execute('SELECT id,type,user_id FROM notifications WHERE user_id=? AND cancelled_at IS NULL ORDER BY id', [state.aUser]);
    assert.deepEqual(new Set(rows.map(row => row.type)), new Set(['jadwal_tanam', 'perkiraan_panen', 'pemupukan', 'pengobatan']));
    state.aNotification = rows[0].id;
    const original = rows.map(row => row.id);
    await generateReminders(new Date(), config);
    const separate = await mysql.createConnection({ host: process.env.MYSQL_HOST || 'localhost', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '', database });
    [rows] = await separate.execute('SELECT id FROM notifications WHERE user_id=? AND cancelled_at IS NULL ORDER BY id', [state.aUser]);
    await separate.end();
    assert.deepEqual(rows.map(row => row.id), original);
  });
  await check('Notification unread count/read/read-all persist; cross-user read denied', async () => {
    assert.equal((await request('/notifications/unread-count', a)).data.unreadCount, 4);
    await request(`/notifications/${state.aNotification}/read`, b, 'PUT', undefined, 404);
    await request(`/notifications/${state.aNotification}/read`, a, 'PUT');
    assert.equal((await request('/notifications/unread-count', a)).data.unreadCount, 3);
    await generateReminders(new Date(), config);
    assert.equal((await request('/notifications/unread-count', a)).data.unreadCount, 3);
    await request('/notifications/read-all', a, 'PUT');
    assert.equal((await request('/notifications/unread-count', a)).data.unreadCount, 0);
    const [rows] = await pool.execute('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NOT NULL', [state.aUser]);
    assert.equal(Number(rows[0].n), 4);
    const own = (await request('/notifications', b)).data.data;
    const [bRows] = await pool.execute('SELECT id FROM notifications WHERE user_id=? AND cancelled_at IS NULL', [state.bUser]);
    const bIds = new Set(bRows.map(row => row.id));
    assert.ok(own.every(row => bIds.has(row.id)));
    // New dummy event leaves unread content for the portfolio screenshots, without resetting read history.
    for (const jenis_aktivitas of ['pemupukan', 'pengobatan']) await request('/reminders', a, 'POST', { siklus_tanam_id: state.aCycle, jenis_aktivitas, tanggal_rencana: today, nama_material: jenis_aktivitas === 'pemupukan' ? 'NPK - rencana demo lanjutan' : 'Pestisida nabati - rencana demo lanjutan' }, 201);
    await generateReminders(new Date(), config);
  });
  await check('Logout clears cookie and unauthenticated /me is rejected', async () => {
    const response = await request('/auth/logout', a, 'POST');
    assert.equal(response.cookie, 'authToken=');
    await request('/auth/me', '', 'GET', undefined, 401);
  });
} finally {
  server.kill();
  await pool.end();
  await fs.writeFile(new URL('api-results.json', output), JSON.stringify({ database, engine: version[0].version, checkedAt: new Date().toISOString(), migrations: schema.map(row => row.name), tables: tables.length, checks, limitations: ['No successful DELETE executed: no destructive operations authorized.', 'Browser evidence is recorded separately.', 'Demo accounts use public dummy credentials.'] }, null, 2) + '\n');
  await fs.mkdir(new URL('../../.validation/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../../.validation/demo-state.json', import.meta.url), JSON.stringify(state, null, 2));
  await fs.writeFile(new URL('../../.validation/api-server.log', import.meta.url), serverLog);
}
if (checks.some(row => row.status === 'FAIL')) process.exitCode = 1;
