// Real HTTP/MySQL checks, explicitly limited to the existing disposable demo.
// Run from backend. Existing records are never deleted; IDs created here are tracked.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
dotenv.config({ quiet: true });
const state = JSON.parse(await fs.readFile(new URL('../../.validation/demo-state.json', import.meta.url), 'utf8'));
assert.match(state.database, /^tanimaju_demo_[a-z0-9_]+$/);
assert.equal(process.env.MYSQL_DATABASE, state.database);
assert.equal(process.env.LOCAL_RUNTIME_WRITE, 'demo-only');
const pool = (await import('../dist/config/mysql-database.js')).default;
const { generateReminders, jakartaTimestamp } = await import('../dist/services/reminderScheduler.js');
const checks = [], requests = [], created = [];
const base = 'http://localhost:5310/api';
const suffix = String(Date.now());
const today = jakartaTimestamp(new Date()).slice(0, 10);
const fixture = { database: state.database, today, suffix, paginationPlants: [] };
const request = async (path, cookie, method = 'GET', body, status = 200) => {
  const multipart = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(!multipart && body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? multipart ? body : JSON.stringify(body) : undefined });
  const data = await response.json();
  requests.push({ path, method, status: response.status, expected: status });
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
const check = async (name, fn) => { try { await fn(); checks.push({ name, status: 'PASS' }); } catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); } console.log(`${checks.at(-1).status}: ${name}`); };
const idOf = data => Number(data.id ?? data._id ?? data.userId);
const create = async (path, body, cookie) => { const id = idOf((await request('/' + path, cookie, 'POST', body, 201)).data); assert.ok(id > 0); created.push({ path, id }); return id; };
const list = data => Array.isArray(data) ? data : data.data;
const [db] = await pool.query('SELECT DATABASE() AS name, VERSION() AS version');
assert.equal(db[0].name, state.database);
const [migrations] = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
assert.equal(migrations.length, 13);
const login = async email => (await request('/auth/login', '', 'POST', { email, password: state.password })).cookie;
const admin = await login(state.accounts.admin), a = await login(state.accounts.a), b = await login(state.accounts.b), penyuluh = await login(state.accounts.penyuluh);
assert.equal((await request('/auth/me', admin)).data.user?.role ?? (await request('/auth/me', admin)).data.role, 'admin');
assert.equal(Number((await request(`/petani/${state.aPetani}`, admin)).data.user_id), state.aUser);
try {
  await check('Schema 001-013, important tables and three linked demo roles', async () => {
    for (const name of ['users','petani','tanaman','bibit','lahan','panen','siklus_tanam','aktivitas_pertanian','notifications','products','posts']) await pool.query(`SELECT COUNT(*) FROM \`${name}\``);
  });
  const graph = {};
  const petani = { nama: 'CRUD Runtime ' + suffix, alamat: 'Data dummy', nomorKontak: '' };
  const tanaman = { namaTanaman: 'CRUD Runtime ' + suffix, pupuk: 'Kompos' };
  const bibit = { tanaman: 'Padi', sumber: 'Demo', namaPenyedia: 'CRUD Runtime ' + suffix, tanggalPemberian: today };
  const crud = async (path, input, update, key) => { const id = await create(path, input, admin); graph[key] = id; await request(`/${path}/${id}`, admin); await request(`/${path}/${id}`, admin, 'PUT', update); await request(`/${path}/${id}`, admin); };
  await check('Petani create/read/edit real API', () => crud('petani', petani, { ...petani, alamat: 'Diperbarui' }, 'petani'));
  await check('Tanaman create/read/edit real API', () => crud('tanaman', tanaman, { ...tanaman, pupuk: 'NPK' }, 'tanaman'));
  await check('Bibit create/read/edit real API', () => crud('bibit', bibit, { ...bibit, sumber: 'Diperbarui' }, 'bibit'));
  const land = { petani_id: graph.petani, nama_lahan: 'CRUD Runtime ' + suffix, luas: 0.5, lokasi: 'Demo', status: 'produktif' };
  await check('Lahan create/read/edit real API', () => crud('lahan', land, { ...land, luas: 0.75 }, 'lahan'));
  const cycle = { lahan_id: graph.lahan, tanaman_id: graph.tanaman, tanggal_tanam: today, perkiraan_tanggal_panen: today, status: 'aktif', catatan: 'CRUD runtime' };
  await check('Siklus create/read/edit real API (existing UI has no editor)', () => crud('siklus-tanam', cycle, { ...cycle, catatan: 'Diperbarui' }, 'cycle'));
  const activity = { siklus_tanam_id: graph.cycle, jenis_aktivitas: 'monitoring', tanggal: today, kondisi: 'CRUD runtime ' + suffix };
  await check('Aktivitas create/read/edit real API (existing UI has no editor)', () => crud('aktivitas-pertanian', activity, { ...activity, kondisi: 'Diperbarui' }, 'activity'));
  const harvest = { petani: graph.petani, tanaman: graph.tanaman, bibit: graph.bibit, lahan: land.nama_lahan, lahanId: graph.lahan, siklusTanamId: graph.cycle, pupuk: 'Kompos', jumlahHasilPanen: 123, tanggalPanen: today, statusPenjualan: 'Belum Terjual', namaPembeli: '' };
  await check('Panen linked create/read/edit real API', () => crud('panen', harvest, { ...harvest, jumlahHasilPanen: 124 }, 'panen'));
  await check('Admin deletes ONLY the seven newly created dummy records', async () => {
    for (const [path, key] of [['panen','panen'],['aktivitas-pertanian','activity'],['siklus-tanam','cycle'],['lahan','lahan'],['bibit','bibit'],['tanaman','tanaman'],['petani','petani']]) { assert.ok(created.some(row => row.path === path && row.id === graph[key])); await request(`/${path}/${graph[key]}`, admin, 'DELETE'); await request(`/${path}/${graph[key]}`, admin, 'GET', undefined, 404); }
  });
  await check('Real two-page search/pagination and sorting fixtures', async () => {
    for (let i = 0; i < 21; i++) fixture.paginationPlants.push(await create('tanaman', { namaTanaman: `Pagination ${suffix} ${String(i).padStart(2,'0')}`, pupuk: 'Demo' }, admin));
    const first = (await request(`/tanaman?search=Pagination%20${suffix}&limit=10&page=1&sort_by=id&sort_order=ASC`, admin)).data;
    const second = (await request(`/tanaman?search=Pagination%20${suffix}&limit=10&page=2&sort_by=id&sort_order=ASC`, admin)).data;
    assert.equal(first.pagination.total, 21); assert.equal(first.data.length, 10); assert.equal(second.data.length, 10); assert.notEqual(first.data[0].id, second.data[0].id);
  });
  await check('Public Product and Blog seeded via image upload, edit and fetch', async () => {
    const image = await fs.readFile(new URL('../../public/images/home/placeholder-1.jpg', import.meta.url));
    for (const [path, key] of [['products','product'],['posts','post']]) {
      const title = key === 'product' ? 'Beras Inpari 32 - Demo Lokal' : 'Monitoring Sawah Sukamaju - Demo Lokal';
      const existing = list((await request('/' + path, admin)).data).find(row => row.title === title);
      if (existing) { fixture[key] = existing.id; fixture[key + 'Title'] = title; continue; }
      const form = new FormData(); form.set('title', title);
      if (key === 'product') { form.set('price','15000'); form.set('description','Beras dari petani demo Sukamaju.'); form.set('info','Kemasan 1 kg. Data fiktif untuk demo lokal.'); form.set('whatsappNumber','000000000000'); form.set('imageSrc',new Blob([image],{type:'image/jpeg'}),'demo-sawah.jpg'); }
      else { form.set('date',today); form.set('author','Tim Demo TaniMaju'); form.set('category','News'); form.set('content','Monitoring tanaman dan irigasi pada sawah demo Sukamaju. Seluruh data artikel ini fiktif.'); form.set('tags','["demo","pertanian"]'); form.set('image',new Blob([image],{type:'image/jpeg'}),'demo-sawah.jpg'); form.set('authorImage',new Blob([image],{type:'image/jpeg'}),'demo-author.jpg'); }
      fixture[key] = await create(path,form,admin); fixture[key + 'Title'] = title;
      const changed = new FormData(); changed.set('title',title); if(key === 'post')changed.set('content','Monitoring tanaman dan irigasi. Artikel fiktif untuk demo lokal.'); else changed.set('price','16000');
      await request(`/${path}/${fixture[key]}`,admin,'PUT',changed);
      const fetched = (await request(`/${path}/${fixture[key]}`, '')).data;
      const uploaded = await fetch('http://localhost:5310' + (fetched.imageSrc ?? fetched.image)); assert.equal(uploaded.status,200); assert.ok((await uploaded.arrayBuffer()).byteLength>0);
    }
  });
  await check('Petani A own new cycle/activity plus date validation', async () => {
    fixture.land = await create('lahan',{petani_id:state.aPetani,nama_lahan:'Runtime Ratna ' + suffix,luas:0.4,lokasi:'Demo runtime',status:'produktif'},admin);
    fixture.cycle = await create('siklus-tanam',{lahan_id:fixture.land,tanaman_id:state.tanaman,tanggal_tanam:today,perkiraan_tanggal_panen:today,status:'aktif',catatan:'Runtime reminder verification'},a);
    fixture.activity = await create('aktivitas-pertanian',{siklus_tanam_id:fixture.cycle,jenis_aktivitas:'monitoring',tanggal:today,kondisi:'Runtime Ratna ' + suffix},a);
    await request('/aktivitas-pertanian',a,'POST',{siklus_tanam_id:fixture.cycle,jenis_aktivitas:'monitoring',tanggal:'2000-01-01',kondisi:'Invalid'},400);
  });
  await check('Actual IDOR: A cannot read/update B land, cycle, activity', async () => {
    for (const [path,id] of [['lahan',state.bLand],['siklus-tanam',state.bCycle],['aktivitas-pertanian',state.bActivity]]) { await request(`/${path}/${id}`,a,'GET',undefined,404); const rows=list((await request(`/${path}?petani_id=${state.bPetani}&limit=100`,a)).data); assert.ok(rows.every(row=>Number(row.petani_id)===state.aPetani)); }
    await request(`/lahan/${state.bLand}`,a,'PUT',{},403);
    await request(`/siklus-tanam/${state.bCycle}`,a,'PUT',{lahan_id:state.bLand,tanaman_id:state.tanaman,tanggal_tanam:today},404);
    await request(`/aktivitas-pertanian/${state.bActivity}`,a,'PUT',{siklus_tanam_id:state.bCycle,jenis_aktivitas:'monitoring',tanggal:today,kondisi:'Attempt'},404);
  });
  await check('Penyuluh reads all permitted lists; POST/PUT/DELETE and users denied', async () => {
    for (const [path,id] of [['petani',state.aPetani],['tanaman',state.tanaman],['bibit',state.bibit],['lahan',state.aLand],['panen',state.panen],['siklus-tanam',state.aCycle],['aktivitas-pertanian',state.aActivity]]) { await request('/'+path,penyuluh); for(const method of ['POST','PUT','DELETE'])await request('/'+path+(method==='POST'?'':'/'+id),penyuluh,method,method==='DELETE'?undefined:{},403); }
    await request('/auth/users',penyuluh,'GET',undefined,403); await request('/auth/pending-users',penyuluh,'GET',undefined,403);
  });
  await check('Dashboard aggregates equal MySQL, empty date range has no harvest', async () => {
    const dashboard=(await request(`/dashboard/admin?start_date=${today.slice(0,7)}-01&end_date=${today}`,admin)).data;
    const [count]=await pool.execute('SELECT COUNT(*) AS n FROM panen WHERE tanggalPanen BETWEEN ? AND ?',[today.slice(0,7)+'-01',today]);
    assert.equal(dashboard.summary.panen_dalam_periode,Number(count[0].n));
    const empty=(await request('/dashboard/admin?start_date=2000-01-01&end_date=2000-01-02',admin)).data; assert.equal(empty.summary.panen_dalam_periode,0); assert.equal(empty.harvestTrend.length,0);
    const own=(await request('/dashboard/petani',a)).data; assert.equal(own.linked,true); assert.ok(!JSON.stringify(own).includes('Dedi Setiawan'));
  });
  await check('All five CSV/XLSX exports parse, respect filters and Petani ownership', async () => {
    for(const module of ['panen','aktivitas','petani','tanaman','lahan']) for(const format of ['csv','xlsx']) for(const [label,cookie] of [['admin',admin],['petani',a]]) {
      const response=await fetch(`${base}/reports/${module}/export?format=${format}&petani_id=${state.bPetani}`,{headers:{Cookie:cookie}}); assert.equal(response.status,200);
      const buffer=Buffer.from(await response.arrayBuffer());const book=XLSX.read(buffer,{type:'buffer'});assert.ok(book.SheetNames.length>0);const text=book.SheetNames.map(name=>XLSX.utils.sheet_to_csv(book.Sheets[name])).join('\n');
      if(label==='petani')assert.ok(!text.includes('Dedi Setiawan'),'Export B data leaked: '+module);
      await fs.mkdir(new URL('../../.validation/runtime-downloads/',import.meta.url),{recursive:true}); await fs.writeFile(new URL(`../../.validation/runtime-downloads/api-${label}-${module}.${format}`,import.meta.url),buffer);
      if(label==='admin' && ['panen','aktivitas','petani','lahan'].includes(module)) assert.ok(!text.includes('Ratna Wulandari'),'Admin petani_id filter ignored: '+module);
    }
    for(const module of ['panen','aktivitas','petani','tanaman','lahan']) {const response=await fetch(`${base}/reports/${module}/export?format=csv&search=never-match-${suffix}`,{headers:{Cookie:admin}});assert.equal(response.status,200);const book=XLSX.read(Buffer.from(await response.arrayBuffer()),{type:'buffer'});const sheet=book.Sheets[book.SheetNames[0]];assert.equal(XLSX.utils.sheet_to_json(sheet).length,0);}
  });
  await check('Four notification types persisted; generation repeated without duplicate', async () => {
    for(const jenis_aktivitas of ['pemupukan','pengobatan'])await create('reminders',{siklus_tanam_id:fixture.cycle,jenis_aktivitas,tanggal_rencana:today,nama_material:'Runtime demo'},a);
    const config={enabled:true,intervalMinutes:1,hour:0,catchupHours:48,plantingDays:[0],harvestDays:[0],activityDays:[0]};await generateReminders(new Date(),config);
    const [before]=await pool.query('SELECT COUNT(*) AS n FROM notifications');await generateReminders(new Date(),config);const [after]=await pool.query('SELECT COUNT(*) AS n FROM notifications');assert.equal(after[0].n,before[0].n);
    const [rows]=await pool.execute('SELECT id,type FROM notifications WHERE user_id=? AND event_date=? AND cancelled_at IS NULL AND scheduled_at<=NOW()',[state.aUser,today]); for(const type of ['jadwal_tanam','pemupukan','pengobatan','perkiraan_panen'])assert.ok(rows.some(row=>row.type===type),type);
    fixture.notification=rows.find(row=>row.type==='jadwal_tanam').id;await request(`/notifications/${fixture.notification}/read`,b,'PUT',undefined,404);
    const notifications=list((await request('/notifications?limit=100',a)).data);const [owned]=await pool.execute('SELECT id FROM notifications WHERE user_id=?',[state.aUser]);assert.ok(notifications.every(row=>owned.some(item=>item.id===row.id)));
  });
} finally {
  await fs.writeFile(new URL('../../.validation/runtime-fixture.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
  await fs.writeFile(new URL('../../docs/validation/runtime-api-results.json',import.meta.url),JSON.stringify({database:state.database,checkedAt:new Date().toISOString(),mysql:db[0].version,checks,requests,created,retained:'Public demo content, pagination fixtures and Ratna runtime reminders retained for browser checks; no pre-existing record deleted.'},null,2)+'\n');
  await pool.end();
}
if(checks.some(row=>row.status==='FAIL'))process.exitCode=1;
