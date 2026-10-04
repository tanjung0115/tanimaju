// Additional actual browser checks: filtered files and Admin forms at both widths.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { browserSession } from './browser-cdp.mjs';
const state = JSON.parse(await fs.readFile(new URL('../.validation/demo-state.json', import.meta.url), 'utf8'));
assert.equal(process.env.LOCAL_RUNTIME_DEMO, state.database);
const b = await browserSession();
const checks = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const downloads = new URL('../.validation/runtime-downloads/', import.meta.url);
await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: fileURLToPath(downloads), eventsEnabled: true });
await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
await b.send('Network.clearBrowserCookies');
const check = async (name, action) => {
  try { await action(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message }); }
  console.log(`${checks.at(-1).status}: ${name}${checks.at(-1).detail ? ' | ' + checks.at(-1).detail : ''}`);
};
const login = async (email, destination) => {
  await b.send('Network.clearBrowserCookies'); await b.navigate('/login');
  await b.fill('#email', email); await b.fill('#password', state.password);
  await b.click('button[type="submit"]'); await b.wait(`location.pathname===${JSON.stringify(destination)}`);
};
const download = async format => {
  const count = b.downloads.size;
  await b.fill('[aria-label="Format export"]', format); await b.button('Export');
  for (let i = 0; i < 100 && b.downloads.size <= count; i++) await pause(100);
  assert.ok(b.downloads.size > count);
  const item = [...b.downloads.values()].at(-1);
  for (let i = 0; i < 100 && item.state === 'inProgress'; i++) await pause(100);
  assert.equal(item.state, 'completed');
  const buffer = await fs.readFile(new URL(item.filename, downloads));
  const book = XLSX.read(buffer, { type: 'buffer' });
  return book.SheetNames.map(name => XLSX.utils.sheet_to_csv(book.Sheets[name])).join('\n');
};
try {
  await login(state.accounts.admin, '/admin');
  for (const [module, path, label] of [['panen','/admin/panen','Petani'],['aktivitas','/admin/aktivitas-pertanian','Petani'],['lahan','/admin/lahan','Petani']]) {
    await check(`Active ${module} owner filter in UI and downloaded CSV/XLSX`, async () => {
      await b.navigate(path); await b.wait('!!document.querySelector("details")');
      await pause(500); await b.click('details summary');
      const selector = `details select[aria-label="${label}"]`;
      await b.wait(`!![...document.querySelector(${JSON.stringify(selector)}).options].find(o=>o.value===${JSON.stringify(String(state.bPetani))})`);
      await b.fill(selector, state.bPetani); await pause(700);
      await b.wait(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(state.bPetani))}`);
      for (const format of ['csv','xlsx']) { const content = await download(format); assert.ok(!content.includes('Ratna Wulandari')); if(module!=='panen')assert.ok(content.includes('Dedi Setiawan')); }
    });
  }
  await check('Petani name search/sort matches both downloaded formats', async () => {
    await b.navigate('/admin/petani'); await b.fill('[aria-label="Cari data"]', 'Ratna'); await pause(700);
    await b.click('details summary'); await b.fill('[aria-label="Arah"]', 'ASC'); await pause(500);
    for (const format of ['csv','xlsx']) { const content = await download(format); assert.ok(content.includes('Ratna Wulandari')); assert.ok(!content.includes('Dedi Setiawan')); }
  });
  await check('Tanaman fertilizer filter matches both downloaded formats', async () => {
    await b.navigate('/admin/tanaman'); await b.click('details summary'); await b.fill('details [aria-label="Pupuk"]', 'Kompos dan NPK'); await pause(700);
    for(const format of ['csv','xlsx']) {const content=await download(format);assert.ok(content.includes('Padi Inpari 32'));assert.ok(!content.includes('Pagination'));}
  });
  await check('Bibit text/date filters and empty state', async () => {
    await b.navigate('/admin/bibit'); await b.click('details summary'); await b.fill('details [aria-label="Penyedia"]', 'Koperasi Tani Sukamaju'); await pause(600);
    await b.wait('document.body.innerText.includes("Koperasi Tani Sukamaju")');
    await b.fill('details [aria-label="Pemberian dari"]','2000-01-01');await b.fill('details [aria-label="Pemberian sampai"]','2000-01-02');await pause(600);
    await b.wait('document.body.innerText.includes("Tidak ada data yang sesuai dengan filter.")');
  });
  for(const width of [375,768]) await check(`Admin ${width}px tables/filters/forms/button navigation`, async () => {
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    for(const path of ['/admin','/admin/petani','/admin/tanaman','/admin/bibit','/admin/panen','/admin/lahan','/admin/aktivitas-pertanian','/admin/item','/admin/posts','/admin/user-approval','/admin/petani/create','/admin/tanaman/create','/admin/bibit/create','/admin/panen/create','/admin/item/create','/admin/posts/create']) {
      await b.navigate(path);await pause(500);
      await b.wait('!!document.querySelector("#dashboard-content")');
      assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Page overflow: '+path);
      assert.ok(await b.evaluate('document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'),'Main overflow: '+path);
      if(path.endsWith('/create')) {await b.button('Batal');await b.wait(`!location.pathname.endsWith('/create')`);}
    }
    await b.screenshot(new URL(`../docs/screenshots/runtime/admin-${width}.png`,import.meta.url));
  });
  await check('Petani all five real browser CSV/XLSX downloads are scoped', async () => {
    await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
    await login(state.accounts.a,'/petani');
    for(const module of ['panen','aktivitas','petani','tanaman','lahan'])for(const format of ['csv','xlsx']) {
      // This uses a real browser download; Panen/Petani export controls are not standalone Petani pages.
      const count=b.downloads.size;
      const status=await b.evaluate(`fetch('http://localhost:5310/api/reports/${module}/export?format=${format}&petani_id=${state.bPetani}',{credentials:'include'}).then(async r=>{if(!r.ok)return r.status;const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='petani-${module}.${format}';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return r.status})`);
      assert.equal(status,200);for(let i=0;i<100&&b.downloads.size<=count;i++)await pause(100);assert.ok(b.downloads.size>count);const item=[...b.downloads.values()].at(-1);for(let i=0;i<100&&item.state==='inProgress';i++)await pause(100);assert.equal(item.state,'completed');
      const book=XLSX.read(await fs.readFile(new URL(item.filename,downloads)),{type:'buffer'});const content=book.SheetNames.map(name=>XLSX.utils.sheet_to_csv(book.Sheets[name])).join('\n');assert.ok(!content.includes('Dedi Setiawan'));
    }
  });
  await check('Supplementary browser console/network is free of unexpected errors', async () => {
    assert.deepEqual(b.errors,[]);assert.deepEqual(b.networkIssues.filter(row=>!row.canceled&&!(row.status===401&&row.url.endsWith('/auth/me'))),[]);
    assert.deepEqual(b.consoleMessages.filter(row=>row.type==='error'&&!row.text.startsWith('Auth check failed:')),[]);
  });
} finally {
  await fs.writeFile(new URL('../docs/validation/runtime-extra-results.json',import.meta.url),JSON.stringify({database:state.database,checkedAt:new Date().toISOString(),checks,downloads:[...b.downloads.values()],exceptions:b.errors,console:b.consoleMessages,network:b.networkIssues},null,2)+'\n');await b.close();
}
if(checks.some(row=>row.status==='FAIL'))process.exitCode=1;
