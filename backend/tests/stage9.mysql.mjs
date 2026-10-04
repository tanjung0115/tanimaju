import assert from 'node:assert/strict';
import pool from '../dist/config/mysql-database.js';
import { readReport } from '../dist/repositories/ReportRepository.js';
import { buildPanenList } from '../dist/repositories/listPlans.js';
import { createReportFile } from '../dist/utils/reportExport.js';
import * as XLSX from 'xlsx';
// Read-only CTE fixtures shadow table names only for the duration of each SELECT.
// No CREATE/INSERT/UPDATE/migrations; the real development schema and data remain untouched.
const fixtures = `WITH
petani AS (
 SELECT 7 id, 3 user_id, 'Andi' nama, 'Desa A' alamat, '123' nomorKontak, CAST('2026-01-01' AS DATETIME) created_at
 UNION ALL SELECT 8,4,'Budi','Desa B','456',CAST('2026-01-01' AS DATETIME)
),
tanaman AS (
 SELECT 6 id,'Padi' namaTanaman,'Organik' pupuk,CAST('2026-01-01' AS DATETIME) created_at
 UNION ALL SELECT 10,'Jagung','Organik',CAST('2026-01-01' AS DATETIME)
),
lahan AS (
 SELECT 88 id,7 petani_id,'Sawah A' nama_lahan,CAST(1.5 AS DECIMAL(12,2)) luas,'Desa A' lokasi,'produktif' status,CAST('2026-01-01' AS DATETIME) created_at
 UNION ALL SELECT 89,8,'Sawah B',2.0,'Desa B','produktif',CAST('2026-01-01' AS DATETIME)
),
bibit AS (SELECT 1 id,'Penyedia' namaPenyedia),
panen AS (
 SELECT 101 id,7 petani_id,6 tanaman_id,1 bibit_id,NULL lahan_id,'Sawah Lama' lahan,CAST('2026-01-02' AS DATE) tanggalPanen,CAST(12.5 AS DECIMAL(12,2)) jumlahHasilPanen,'Terjual' statusPenjualan,'Pembeli A' namaPembeli
 UNION ALL SELECT 102,7,6,1,88,'Legacy Name',CAST('2026-02-02' AS DATE),3.0,'Belum Terjual',''
 UNION ALL SELECT 103,8,10,1,89,'Legacy B',CAST('2026-03-02' AS DATE),9.0,'Terjual','Pembeli B'
),
siklus_tanam AS (
 SELECT 201 id,88 lahan_id,6 tanaman_id,CAST('2026-01-01' AS DATE) tanggal_tanam,CAST('2026-04-01' AS DATE) perkiraan_tanggal_panen,'aktif' status,CAST('2026-01-01' AS DATETIME) created_at
 UNION ALL SELECT 202,89,10,CAST('2026-02-01' AS DATE),CAST('2026-05-01' AS DATE),'aktif',CAST('2026-02-01' AS DATETIME)
),
aktivitas_pertanian AS (
 SELECT 301 id,201 siklus_tanam_id,'pemupukan' jenis_aktivitas,CAST('2026-01-02' AS DATE) tanggal,'Kompos' nama_material,CAST(2.5 AS DECIMAL(12,2)) dosis,'kg' satuan,NULL kondisi,NULL tujuan,'Catatan A' catatan,CAST('2026-01-01' AS DATETIME) created_at
 UNION ALL SELECT 302,202,'monitoring',CAST('2026-02-02' AS DATE),NULL,NULL,NULL,'Baik',NULL,'Catatan B',CAST('2026-02-01' AS DATETIME)
) `;
const execute = pool.execute.bind(pool);
pool.execute = (sql,values) => execute(fixtures + sql,values);
const req = (query={},role='admin') => ({query,user:{id:role==='petani'?3:1,role}});
try {
  const [realTables] = await execute('SHOW TABLES');
  const available = new Set(realTables.map(row=>String(Object.values(row)[0])));
  console.log('Real-schema full report tests:',available.has('lahan')?'schema present':'SKIP prerequisite lahan missing; using SELECT-only CTE fixtures');
  const all=await readReport(req({page:'99',limit:'1'}),'panen');assert.equal(all.length,3);
  const owned=await readReport(req({petani_id:'8'},'petani'),'panen');assert.deepEqual(owned.map(row=>row.id).sort(),[101,102]);
  for (const kind of ['lahan','aktivitas']) {
    const result=await readReport(req({petani_id:'8'},'petani'),kind);assert.equal(result.length,1);assert.equal(result[0].petani_id,7);
    assert.equal((await readReport(req({lahan_id:'89'},'petani'),kind)).length,0);
  }
  const filter={start_date:'2026-01-01',end_date:'2026-01-31',petani_id:'7',tanaman_id:'6',status_penjualan:'Terjual'};
  const matched=await readReport(req(filter),'panen');assert.equal(matched.length,1);assert.equal(matched[0].id,101);
  const plan=await buildPanenList(req(filter));
  const [listed]=await pool.execute(`SELECT ${plan.select} ${plan.base} ${plan.where} ORDER BY ${plan.queryOptions.sortBy} ${plan.queryOptions.sortOrder} LIMIT ? OFFSET ?`,[...plan.values,'20','0']);
  assert.deepEqual(matched.map(row=>row.id),listed.map(row=>row.id));
  assert.equal((await readReport(req({legacy_lahan:'Sawah Lama'}),'panen'))[0].id,101);
  const workbook=XLSX.read(createReportFile('panen',matched,'xlsx','Januari'),{type:'buffer'});
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Laporan)[0].Lahan,'Sawah Lama');
  const farmers=await readReport(req({petani_id:'7'}),'petani');assert.equal(farmers.length,1);
  assert.equal(farmers[0].jumlah_panen,2);assert.equal(farmers[0].jumlah_siklus,1);assert.equal(farmers[0].jumlah_aktivitas,1);assert.equal(farmers[0].jumlah_lahan,1);
  assert.deepEqual(JSON.parse(farmers[0].lahan_nama_list),['Sawah A']);
  const crops=await readReport(req({},'petani'),'tanaman');assert.equal(crops.length,1);assert.equal(crops[0].id,6);assert.equal(crops[0].jumlah_panen,2);assert.equal(crops[0].jumlah_petani,1);
  const lands=await readReport(req({lahan_id:'88'}),'lahan');assert.equal(lands.length,1);assert.equal(lands[0].jumlah_panen,1);assert.equal(lands[0].jumlah_siklus,1);
  const activity=await readReport(req({jenis_aktivitas:'pemupukan',start_date:'2026-01-01',end_date:'2026-01-31',petani_id:'7',tanaman_id:'6',lahan_id:'88'}),'aktivitas');assert.equal(activity.length,1);assert.equal(Number(activity[0].dosis),2.5);
  assert.equal((await readReport(req({search:'nothing matches'}),'panen')).length,0);
  assert.equal((await readReport(req({search:"' OR 1=1 --"}),'panen')).length,0);
  for (const kind of ['panen','aktivitas','petani','tanaman','lahan']) assert.equal((await readReport({query:{},user:{id:999,role:'petani'}},kind)).length,0);
  assert.equal((await readReport(req({petani_id:'7',start_date:'2026-02-01',end_date:'2026-02-28'}),'petani'))[0].jumlah_panen,1);
  console.log('PASS MySQL read-only fixtures: all five reports, list/export matching, aggregate counts/names, dates, combined filters, legacy, ownership conflicts and empty results');
} finally {pool.execute=execute;await pool.end();}
