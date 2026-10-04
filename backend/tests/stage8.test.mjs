import test from 'node:test';
import assert from 'node:assert/strict';
import { parseListQuery, pagination } from '../dist/utils/listQuery.js';
import pool from '../dist/config/mysql-database.js';
import { PetaniRepository } from '../dist/repositories/PetaniRepository.js';
import petani from '../dist/routes/mysql/petaniRoutes.js';
import tanaman from '../dist/routes/mysql/tanamanRoutes.js';
import bibit from '../dist/routes/mysql/bibitRoutes.js';
import panen from '../dist/routes/mysql/panenRoutes.js';
import lahan from '../dist/routes/mysql/lahanRoutes.js';
import siklus from '../dist/routes/mysql/siklusTanamRoutes.js';
import aktivitas from '../dist/routes/mysql/aktivitasPertanianRoutes.js';
const parse = query => parseListQuery({ query }, { nama: 'nama' }, 'nama');
test('defaults, maximum limit, total and empty pagination', () => {
  assert.equal(parse({}).limit, 20);
  assert.equal(parse({ limit: '10000' }).limit, 100);
  assert.deepEqual(pagination(2, 20, 41), { page: 2, limit: 20, total: 41, totalPages: 3 });
  assert.equal(pagination(1, 20, 0).totalPages, 0);
});
test('invalid page, limit, sort, date, IDs, repeated parameters rejected', () => {
  for (const query of [{page:'0'}, {page:'1x'}, {page:'1.2'}, {page:'1e2'}, {limit:'0'}, {limit:'-1'}, {sort_by:'toString'}, {sort_by:'nama; DROP TABLE petani'}, {sort_order:'sideways'}, {start_date:'2026-02-30'}, {start_date:''}, {harvest_start_date:'bad'}, {start_date:'2026-10-02',end_date:'2026-10-01'}, {petani_id:'2 OR 1=1'}, {lahan_id:'0'}, {page:['1','2']}]) assert.ok('error' in parse(query), JSON.stringify(query));
  assert.ok(!('error' in parse({start_date:'2024-02-29'})));
});
async function invoke(router, query, user, path = '/') {
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route.stack.at(-1).handle;
  let code = 200; let body;
  const response = { status(value) { code = value; return this; }, json(value) { body = value; return this; } };
  await handler({query, user, params: {id:'2'}}, response);
  return {code, body};
}
test('SQL list queries parameterize combined filters and use identical count criteria', async () => {
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, values) => { calls.push({sql,values}); return [sql.includes('COUNT(*)') ? [{total:41}] : [], []]; };
  try {
    for (const router of [tanaman,bibit,panen,lahan,siklus,aktivitas]) {
      calls.length = 0;
      const search = "x' OR 1=1 --";
      const result = await invoke(router, {page:'2',limit:'20',search,petani_id:'9',lahan_id:'7',tanaman_id:'3',siklus_tanam_id:'4',start_date:'2026-01-01',end_date:'2026-10-01',status:'produktif',status_siklus:'aktif',jenis_aktivitas:'monitoring',status_penjualan:'Terjual',tanaman:'Padi',sumber:'Bantuan',nama_penyedia:'Andi'}, {id:1,role:'admin'});
      assert.equal(result.code,200);
      assert.deepEqual(result.body.pagination,pagination(2,20,41));
      const data = calls.find(call => call.sql.includes('LIMIT'));
      const count = calls.find(call => call.sql.includes('COUNT(*)'));
      assert.ok(!data.sql.includes(search));
      assert.ok(data.values.includes(`%${search}%`));
      assert.deepEqual(data.values.slice(-2),['20','20']);
      assert.deepEqual(data.values.slice(0,-2),count.values);
      assert.equal(data.sql.split('WHERE')[1].split('ORDER BY')[0].trim(),count.sql.split('WHERE')[1].trim());
      assert.ok(!data.sql.includes('catatan LIKE'));
    }
  } finally {pool.execute = original;}
});
test('farmer owner always comes from account, conflicting IDs cannot broaden SQL scope', async () => {
  const original = pool.execute; const originalProfile = PetaniRepository.findByUserId;
  let calls = [];
  pool.execute = async (sql,values) => {calls.push({sql,values}); return [sql.includes('COUNT(*)') ? [{total:0}] : [],[]];};
  PetaniRepository.findByUserId = async id => {assert.equal(id,99);return {id:5,nama:'Owner'};};
  try {
    for (const router of [panen,lahan,siklus,aktivitas]) {
      calls = [];
      const result = await invoke(router,{page:'1',petani_id:'999',lahan_id:'888'},{id:99,role:'petani'});
      assert.equal(result.code,200);
      const data = calls.find(call => call.sql.includes('LIMIT'));
      assert.ok(data.sql.includes('petani_id = ?'));
      assert.equal(data.values[0],5);
      assert.ok(!data.values.includes(999));
      if (router !== lahan) assert.ok(data.values.includes(888));
    }
    calls = [];
    await invoke(panen,{}, {id:99,role:'petani'});
    assert.ok(calls[0].sql.includes('petani_id = ?'));
    const profile = await invoke(petani,{page:'1',search:'Other'},{id:99,role:'petani'});
    assert.equal(profile.body.data.length,1);
    assert.equal(profile.body.data[0].nama,'Owner');
    PetaniRepository.findByUserId = async () => null;
    assert.equal((await invoke(lahan,{page:'1'},{id:99,role:'petani'})).body.pagination.total,0);
  } finally {pool.execute = original;PetaniRepository.findByUserId = originalProfile;}
});
test('legacy harvest filter requires null FK and keeps left joins; invalid dates return 400', async () => {
  const original = pool.execute; const calls=[];
  pool.execute = async(sql,values) => {calls.push({sql,values});return [sql.includes('COUNT(*)')?[{total:0}]:[],[]];};
  try {
    assert.equal((await invoke(panen,{page:'1',legacy_lahan:'Sawah Lama'})).code,200);
    assert.ok(calls[0].sql.includes('p.lahan_id IS NULL AND p.lahan LIKE ?'));
    assert.ok(calls[0].sql.includes('LEFT JOIN lahan'));
    assert.equal((await invoke(panen,{page:'1',start_date:'invalid'})).code,400);
    assert.equal((await invoke(siklus,{page:'1',harvest_start_date:'2026-10-02',harvest_end_date:'2026-10-01'},{id:1,role:'admin'})).code,400);
  } finally {pool.execute=original;}
});
