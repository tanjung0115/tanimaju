import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import * as XLSX from 'xlsx';
import routes from '../dist/routes/mysql/reportRoutes.js';
import pool from '../dist/config/mysql-database.js';
import { UserRepository } from '../dist/repositories/UserRepository.js';
import { PetaniRepository } from '../dist/repositories/PetaniRepository.js';
import { generateToken } from '../dist/utils/jwt.js';
import { buildPanenList, buildAktivitasList, buildLahanList } from '../dist/repositories/listPlans.js';
import { createReportFile, csvCell, reportFilename } from '../dist/utils/reportExport.js';
const harvest = { id:1,tanggalPanen:new Date('2026-01-01T17:00:00Z'),petani_nama:'Andi',lahan_nama:null,lahan:'Sawah Legacy',tanaman_nama:'Padi',jumlahHasilPanen:'12.5',statusPenjualan:'Terjual',namaPembeli:'=HYPERLINK("evil")' };
function sheet(buffer) { const workbook=XLSX.read(buffer,{type:'buffer',cellStyles:true}); return {workbook,data:XLSX.utils.sheet_to_json(workbook.Sheets.Laporan,{header:1,defval:''})}; }
test('valid XLSX/CSV, numeric cells, Jakarta date, legacy fallback, empty headers, metadata', () => {
  const {workbook,data}=sheet(createReportFile('panen',[harvest],'xlsx','2026'));
  assert.equal(data[1][0],'2026-01-02'); assert.equal(data[1][2],'Sawah Legacy'); assert.equal(data[1][4],12.5);
  assert.equal(workbook.Sheets.Laporan.E2.t,'n'); assert.equal(workbook.Sheets.Laporan.G2.t,'s'); assert.equal(workbook.Sheets.Laporan.G2.f,undefined);
  assert.ok(workbook.Sheets.Informasi); assert.ok(workbook.Sheets.Laporan['!cols']);
  assert.equal(sheet(createReportFile('panen',[],'xlsx','Semua')).data.length,1);
  const csv=createReportFile('panen',[harvest],'csv','Semua').toString('utf8');
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"Sawah Legacy"')); assert.ok(csv.includes("'="));
  assert.equal(csvCell('line1\n"line2"'),'"line1\n""line2"""');
  for (const value of ['=cmd','+cmd','-cmd','@cmd',' \t=cmd']) assert.ok(csvCell(value).startsWith('"\''));
  assert.ok(!reportFilename('panen','csv','../evil','bad\r\n').includes('evil'));
  const activity=sheet(createReportFile('aktivitas',[{tanggal:'2026-10-03',dosis:null,nama_material:null,catatan:'Catatan'}],'xlsx','Semua')).data;
  assert.equal(activity[1][6],'');assert.equal(activity[1][7],'');
});
test('HTTP authorization, filter consistency, all pages, IDOR, input errors, row cap', async () => {
  const originalExecute=pool.execute; const originalUser=UserRepository.findById; const originalProfile=PetaniRepository.findByUserId;
  let calls=[]; let total=3; let rows=[harvest,{...harvest,id:2},{...harvest,id:3}];
  pool.execute=async(sql,values)=>{calls.push({sql,values});return [sql.startsWith('SELECT COUNT(*) AS total')?[{total}]:rows,[]];};
  const roles={1:'admin',2:'penyuluh',3:'petani',4:'user'};
  UserRepository.findById=async(id)=>({id,role:roles[id],email:'fixture@example.test'});
  PetaniRepository.findByUserId=async(id)=>id===3?{id:7,nama:'Andi'}:null;
  const app=express();app.use(cookieParser());app.use('/api/reports',routes);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/reports`;
  const request=(path,id=1)=>fetch(url+path,{headers:id?{authorization:`Bearer ${generateToken({userId:id,email:'fixture@example.test',role:roles[id]})}`}:{}});
  try {
    assert.equal((await request('/panen/export',0)).status,401);
    assert.equal((await request('/panen/export',4)).status,403);
    for (const id of [1,2]) {
      const response=await request('/panen/export?format=xlsx&page=99&limit=1',id);assert.equal(response.status,200);
      assert.ok(response.headers.get('content-disposition').includes('laporan-panen-'));
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.equal(sheet(Buffer.from(await response.arrayBuffer())).data.length,4);
    }
    assert.equal((await request('/panen/export?format=csv',2)).status,200);
    for (const query of ['format=pdf','format[]=csv','start_date=2026-02-30','start_date=2026-10-02&end_date=2026-10-01','status_penjualan=invalid','petani_id=1%20OR%201=1','sort_by=toString','jenis_aktivitas=bad']) assert.equal((await request(`/panen/export?${query}`)).status,400,query);
    assert.equal((await request('/unknown/export')).status,404);
    for (const [kind,builder] of [['panen',buildPanenList],['aktivitas',buildAktivitasList],['lahan',buildLahanList]]) {
      calls=[];
      const filters={petani_id:'999',lahan_id:'888',tanaman_id:'6',start_date:'2026-01-01',end_date:'2026-12-31',search:"' OR 1=1 --"};
      const expected=await builder({query:filters,user:{id:3,role:'petani'}});
      const response=await request(`/${kind}/export?${new URLSearchParams({...filters,format:'csv'})}`,3);assert.equal(response.status,200);
      assert.equal(calls.length,2);
      assert.deepEqual(calls[0].values,expected.values);
      assert.ok(calls[0].sql.includes(expected.where));assert.ok(!calls[0].sql.includes(filters.search));
      assert.ok(calls[0].values.includes(7));assert.ok(!calls[0].values.includes(999));
      assert.equal(calls[1].values.at(-1),'5001');
    }
    for (const kind of ['petani','tanaman','lahan']) {
      calls=[];const response=await request(`/${kind}/export?format=xlsx&start_date=2026-01-01&end_date=2026-12-31`);assert.equal(response.status,200);
      assert.ok(calls[1].sql.includes('COUNT(*)'));assert.ok(!calls[1].sql.includes('SUM('));
      assert.ok(calls[1].values.includes('2026-01-01'));
    }
    total=0;rows=[];assert.equal(sheet(Buffer.from(await (await request('/panen/export')).arrayBuffer())).data.length,1);
    total=5001;assert.equal((await request('/panen/export')).status,413);
    total=0;rows=[{...harvest,namaPembeli:'x'.repeat(32768)}];assert.equal((await request('/panen/export')).status,413);
  } finally {await new Promise(resolve=>server.close(resolve));pool.execute=originalExecute;UserRepository.findById=originalUser;PetaniRepository.findByUserId=originalProfile;}
});
