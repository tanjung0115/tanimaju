// Regression for editing an API-linked harvest through the existing legacy form.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { browserSession } from './browser-cdp.mjs';
const state=JSON.parse(await fs.readFile(new URL('../.validation/demo-state.json',import.meta.url),'utf8'));
assert.equal(process.env.LOCAL_RUNTIME_DEMO,state.database);
const expectBug=process.argv.includes('--expect-bug');
const legacy=process.argv.includes('--legacy');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta'}).format(new Date());
const base='http://localhost:5310/api';
const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:state.accounts.admin,password:state.password})});
assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
const request=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,`${method} ${path}: ${r.status}`);return r.json();};
const created=[];
const cycle=await request('/siklus-tanam','POST',{lahan_id:state.aLand,tanaman_id:state.tanaman,tanggal_tanam:today,status:'selesai',catatan:'Disposable regression: linked Panen edit'});created.push({path:'siklus-tanam',id:cycle.id});
const harvest=await request('/panen','POST',{petani:state.aPetani,tanaman:state.tanaman,bibit:state.bibit,lahan:'Sukabirus',...(legacy?{}:{lahanId:state.aLand,siklusTanamId:cycle.id}),pupuk:'NPK',jumlahHasilPanen:2000,tanggalPanen:today,statusPenjualan:'Belum Terjual',namaPembeli:''});created.push({path:'panen',id:harvest.id});
const b=await browserSession();
let result;
try {
  await b.send('Network.clearBrowserCookies');await b.navigate('/login');await b.fill('#email',state.accounts.admin);await b.fill('#password',state.password);await b.click('button[type="submit"]');await b.wait('location.pathname==="/admin"');
  await b.navigate('/admin/panen/edit/'+harvest.id);await b.wait(`Number(document.querySelector('#amount')?.value)===2000`);await b.fill('#amount','2001');await b.click('[data-form-submit]');await b.wait('location.pathname==="/admin/panen"');
  const saved=await request('/panen/'+harvest.id);assert.equal(Number(saved.jumlahHasilPanen),2001);
  if(expectBug||legacy){assert.equal(saved.lahan_id,null);assert.equal(saved.siklus_tanam_id,null);}else{assert.equal(saved.lahan_id,state.aLand);assert.equal(saved.siklus_tanam_id,cycle.id);const exported=await fetch(base+`/reports/panen/export?format=csv&lahan_id=${state.aLand}&siklus_tanam_id=${cycle.id}`,{headers:{Cookie:cookie}});assert.equal(exported.status,200);assert.ok((await exported.text()).includes('2001'));}
  assert.deepEqual(b.errors,[]);assert.deepEqual(b.networkIssues.filter(row=>!row.canceled&&row.status!==401),[]);
  result={name:legacy?'Legacy Panen remains editable with nullable links':'Linked Panen retains land/cycle when amount edited in browser',status:expectBug?'BUG_REPRODUCED':'PASS',checkedAt:new Date().toISOString(),before:{lahan_id:legacy?null:state.aLand,siklus_tanam_id:legacy?null:cycle.id},after:{lahan_id:saved.lahan_id,siklus_tanam_id:saved.siklus_tanam_id},created};
  console.log(JSON.stringify(result));
} finally {
  await b.close();
  for(const path of ['panen','siklus-tanam']){const row=created.find(row=>row.path===path);if(row)await request('/'+path+'/'+row.id,'DELETE');}
  if(result){const file=new URL('../docs/validation/linked-harvest-regression.json',import.meta.url);let history=[];try{history=JSON.parse(await fs.readFile(file,'utf8')).checks;}catch{}history.push(result);await fs.writeFile(file,JSON.stringify({database:state.database,checks:history,cleanup:'Only the two new regression rows deleted; no pre-existing record modified.'},null,2)+'\n');}
}
