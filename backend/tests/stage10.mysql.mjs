import assert from 'node:assert/strict';
import pool from '../dist/config/mysql-database.js';
import { generateReminders,reminderConfig } from '../dist/services/reminderScheduler.js';
import { NotificationRepository } from '../dist/repositories/NotificationRepository.js';
const execute=pool.execute.bind(pool);
// CTE fixtures are SELECT-only. No migration or development data writes occur.
const cte=`WITH users AS (
 SELECT 3 id,'petani' role,1 is_active,'approved' status UNION ALL SELECT 4,'petani',1,'approved' UNION ALL SELECT 1,'admin',1,'approved' UNION ALL SELECT 5,'petani',0,'approved'
),petani AS (
 SELECT 7 id,3 user_id UNION ALL SELECT 8,4 UNION ALL SELECT 9,NULL UNION ALL SELECT 10,1 UNION ALL SELECT 11,5
),lahan AS (
 SELECT 88 id,7 petani_id,'Sawah A' nama_lahan UNION ALL SELECT 89,8,'Sawah B' UNION ALL SELECT 90,9,'Unlinked' UNION ALL SELECT 91,10,'Admin land' UNION ALL SELECT 92,11,'Inactive'
),tanaman AS (SELECT 6 id,'Padi' namaTanaman),siklus_tanam AS (
 SELECT 201 id,88 lahan_id,6 tanaman_id,CAST('2026-10-04' AS DATE) tanggal_tanam,CAST('2026-10-10' AS DATE) perkiraan_tanggal_panen,'aktif' status
 UNION ALL SELECT 202,89,6,CAST('2026-09-01' AS DATE),CAST('2026-10-06' AS DATE),'aktif'
 UNION ALL SELECT 203,88,6,CAST('2026-09-01' AS DATE),CAST('2026-10-10' AS DATE),'aktif'
 UNION ALL SELECT 204,91,6,CAST('2026-10-04' AS DATE),CAST('2026-10-10' AS DATE),'aktif'
 UNION ALL SELECT 205,90,6,CAST('2026-10-04' AS DATE),CAST('2026-10-10' AS DATE),'aktif'
 UNION ALL SELECT 206,92,6,CAST('2026-10-04' AS DATE),CAST('2026-10-10' AS DATE),'aktif'
 UNION ALL SELECT 207,88,6,CAST('2026-09-01' AS DATE),CAST('2026-09-30' AS DATE),'aktif'
 UNION ALL SELECT 208,88,6,CAST('2026-10-03' AS DATE),CAST('2026-10-20' AS DATE),'aktif'
 UNION ALL SELECT 209,88,6,CAST('2026-10-04' AS DATE),CAST('2026-10-10' AS DATE),'dibatalkan'
),panen AS (SELECT 1 id,203 siklus_tanam_id),aktivitas_pertanian AS (
 SELECT 1 id,208 siklus_tanam_id,'penanaman' jenis_aktivitas,CAST('2026-10-03' AS DATE) tanggal
 UNION ALL SELECT 2,202,'pemupukan',CAST('2026-10-03' AS DATE)
),activity_reminders AS (
 SELECT 401 id,202 siklus_tanam_id,'pemupukan' jenis_aktivitas,CAST('2026-10-04' AS DATE) tanggal_rencana,'terjadwal' status
 UNION ALL SELECT 402,202,'pengobatan',CAST('2026-10-03' AS DATE),'terjadwal'
 UNION ALL SELECT 403,202,'pemupukan',CAST('2026-10-04' AS DATE),'dibatalkan'
 UNION ALL SELECT 404,202,'pemupukan',CAST('2026-09-03' AS DATE),'terjadwal'
),notifications AS (
 SELECT 501 id,3 user_id,'jadwal_tanam' type,'siklus_tanam' related_entity_type,201 related_entity_id,CAST('2026-10-02' AS DATE) event_date,CAST('2026-10-01 09:00:00' AS DATETIME) scheduled_at,NULL read_at,NULL cancelled_at,'Changed date' title,'Changed date' message,CAST('2026-10-01' AS DATETIME) created_at
 UNION ALL SELECT 502,4,'pemupukan','activity_reminder',401,CAST('2026-10-04' AS DATE),CAST('2026-10-03 09:00:00' AS DATETIME),NULL,NULL,'Owner B','Owner B',CAST('2026-10-03' AS DATETIME)
 UNION ALL SELECT 503,3,'jadwal_tanam','siklus_tanam',201,CAST('2026-10-04' AS DATE),CAST('2026-10-03 09:00:00' AS DATETIME),CAST('2026-10-03 09:30:00' AS DATETIME),NULL,'Read','Read',CAST('2026-10-03' AS DATETIME)
) `;
function columns(text){
 const result=[];let start=0,depth=0,quote=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==="'")quote=!quote;if(!quote){if(ch==='(')depth++;if(ch===')')depth--;if(ch===','&&depth===0){result.push(text.slice(start,i).trim());start=i+1;}}}
 result.push(text.slice(start).trim());return result;
}
const key=row=>[row.user_id,row.type,row.related_entity_type,row.related_entity_id,String(row.event_date),String(row.scheduled_at)].join('|');
const persisted=new Map();let invalidated=[];
pool.execute=async(sql,values)=>{
 if(sql.startsWith('INSERT INTO notifications')){
   const select=sql.slice(sql.indexOf('SELECT u.id'),sql.indexOf('ON DUPLICATE KEY'));
   const from=select.indexOf('\n      FROM');
   const fields=columns(select.slice(7,from));
   const labels=['user_id','type','title','message','related_entity_type','related_entity_id','event_date','scheduled_at','created_at','updated_at'];
   assert.equal(fields.length,10);
   const aliased='SELECT '+fields.map((field,index)=>`${field} AS ${labels[index]}`).join(', ')+select.slice(from);
   const [rows]=await execute(cte+aliased,values);
   for(const row of rows)if(!persisted.has(key(row)))persisted.set(key(row),row);
   return [{affectedRows:rows.length},[]];
 }
 if(sql.startsWith('UPDATE notifications n')){
   const select='SELECT n.id FROM notifications n WHERE '+sql.split('WHERE n.read_at')[1].replace(/^/,'n.read_at');
   const [rows]=await execute(cte+select,values.slice(2));invalidated=rows.map(row=>row.id);return [{affectedRows:rows.length},[]];
 }
 return execute(cte+sql.replaceAll('NOW()',"TIMESTAMP('2026-10-03 10:00:00')"),values);
};
try{
 const [tables]=await execute('SHOW TABLES');const names=new Set(tables.map(row=>String(Object.values(row)[0])));
 console.log('Persistent development-schema test:',names.has('notifications')?'schema available':'SKIP migration 013 not applied; no schema changes performed');
 const config={...reminderConfig({}),catchupHours:1};
 await generateReminders(new Date('2026-10-03T03:00:00Z'),config);
 assert.deepEqual(invalidated,[501]);
 const rows=[...persisted.values()];
 assert.equal(rows.length,5);
 assert.ok(rows.every(row=>[3,4].includes(row.user_id)));
 assert.deepEqual(rows.filter(row=>row.type==='perkiraan_panen').map(row=>row.related_entity_id).sort(),[201,202]);
 assert.deepEqual(rows.filter(row=>row.type==='jadwal_tanam').map(row=>row.related_entity_id),[201]);
 assert.deepEqual(rows.filter(row=>row.related_entity_type==='activity_reminder').map(row=>row.related_entity_id).sort(),[401,402]);
 await generateReminders(new Date('2026-10-03T03:00:00Z'),config);assert.equal(persisted.size,5);
 persisted.clear();await generateReminders(new Date('2026-10-03T01:00:00Z'),config);assert.equal(persisted.size,0);
 assert.equal(await NotificationRepository.unreadCount(3),1);
 const mine=await NotificationRepository.list(3,{page:1,limit:20},false);assert.deepEqual(mine.data.map(row=>row.id).sort(),[501,503]);
 assert.equal((await NotificationRepository.list(99,{page:1,limit:20},false)).data.length,0);
 console.log('PASS MySQL SELECT-only rule fixtures: planting/fertilizer/treatment/harvest, no historical/closed/harvested/inactive/admin/unlinked reminders, due-hour WIB, invalidation, owner-scoped list/count. Dedup persistence emulated using migration unique key.');
}finally{pool.execute=execute;await pool.end();}
