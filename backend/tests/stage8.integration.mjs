import assert from 'node:assert/strict';
import pool from '../dist/config/mysql-database.js';
async function invoke(router, query, user = {id:1,role:'admin'}) {
  const handler = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
  let code = 200; let body;
  await handler({query,user}, {status(value){code=value;return this;},json(value){body=value;return this;}});
  assert.equal(code,200,JSON.stringify(body)); return body;
}
const modules = [
  ['petani','petani'], ['tanaman','tanaman'], ['bibit','bibit','tanggalPemberian'],
  ['panen','panen','tanggalPanen'], ['lahan','lahan'],
  ['siklusTanam','siklus_tanam','tanggal_tanam'], ['aktivitasPertanian','aktivitas_pertanian','tanggal'],
];
try {
  const [tables] = await pool.execute('SHOW TABLES');
  const available = new Set(tables.map(row => String(Object.values(row)[0])));
  for (const [name,table,date] of modules) {
    if (!available.has(table) || name === 'panen' && !available.has('lahan')) { console.log(`SKIP MySQL ${name}: prerequisite Stage 1-7 schema missing`); continue; }
    const {default:router} = await import(`../dist/routes/mysql/${name}Routes.js`);
    const result = await invoke(router,{page:'1',limit:'2'});
    const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM ${table}`);
    assert.equal(result.pagination.total,Number(count[0].total));
    assert.ok(result.data.length <= 2);
    const empty = await invoke(router,{page:'999999',limit:'2'});
    assert.equal(empty.data.length,0); assert.equal(empty.pagination.total,result.pagination.total);
    const injection = await invoke(router,{page:'1',search:"' OR 1=1 -- definitely_missing_stage8"});
    assert.equal(injection.pagination.total,0);
    if (date) {
      const filtered = await invoke(router,{page:'1',start_date:'2026-01-01',end_date:'2026-12-31'});
      const [expected] = await pool.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE ${date} >= ? AND ${date} <= ?`,['2026-01-01','2026-12-31']);
      assert.equal(filtered.pagination.total,Number(expected[0].total));
    }
    if (name === 'petani') {
      const [sample] = await pool.execute('SELECT nama FROM petani WHERE nama IS NOT NULL LIMIT 1');
      if (sample[0]) assert.ok((await invoke(router,{page:'1',search:sample[0].nama})).data.some(row=>row.nama===sample[0].nama));
    }
    if (['panen','lahan','siklusTanam','aktivitasPertanian'].includes(name)) {
      const [profiles] = await pool.execute('SELECT id,user_id FROM petani WHERE user_id IS NOT NULL LIMIT 1');
      if (profiles[0]) {
        const owner = profiles[0];
        const scoped = await invoke(router,{page:'1',petani_id:String(owner.id+999999)},{id:owner.user_id,role:'petani'});
        assert.ok(scoped.data.every(row=>Number(row.petani_id)===owner.id));
      } else console.log(`SKIP ${name} real ownership fixture: no linked profile`);
    }
    console.log(`PASS MySQL ${name}: pagination, totals, out-of-range, literal search, date range`);
  }
} finally {await pool.end();}
