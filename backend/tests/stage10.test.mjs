import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import pool from '../dist/config/mysql-database.js';
import notificationRoutes from '../dist/routes/mysql/notificationRoutes.js';
import reminderRoutes from '../dist/routes/mysql/reminderRoutes.js';
import { UserRepository } from '../dist/repositories/UserRepository.js';
import { SiklusTanamRepository } from '../dist/repositories/SiklusTanamRepository.js';
import { generateToken } from '../dist/utils/jwt.js';
import { generateReminders, jakartaTimestamp, reminderConfig, startReminderScheduler } from '../dist/services/reminderScheduler.js';

test('WIB boundaries, configuration, SQL rule sources and durable deduplication', async()=>{
  assert.equal(jakartaTimestamp(new Date('2026-12-31T17:00:00Z')),'2027-01-01 00:00:00');
  assert.deepEqual(reminderConfig({}).harvestDays,[7,3,1]);
  assert.deepEqual(reminderConfig({REMINDER_HARVEST_DAYS:'3,3,0'}).harvestDays,[3,0]);
  assert.equal(reminderConfig({REMINDER_INTERVAL_MINUTES:'bad'}).intervalMinutes,30);
  const migration=await fs.readFile(new URL('../src/database/migrations/013_create_notifications_and_activity_reminders.sql',import.meta.url),'utf8');
  assert.ok(migration.includes('UNIQUE KEY unique_notification_event'));
  assert.ok(migration.includes('REFERENCES users(id)'));assert.ok(!migration.includes('DROP TABLE'));
  const original=pool.execute;const calls=[];
  pool.execute=async(sql,values)=>{calls.push({sql,values});return [{affectedRows:0},[]];};
  try {
    await generateReminders(new Date('2026-10-03T03:00:00Z'),reminderConfig({}));
    assert.equal(calls.filter(call=>call.sql.startsWith('INSERT')).length,9);
    assert.ok(calls[0].sql.includes('cancelled_at'));
    for(const call of calls.filter(call=>call.sql.startsWith('INSERT'))){
      assert.ok(call.sql.includes('ON DUPLICATE KEY UPDATE id = notifications.id'));
      assert.ok(call.sql.includes("u.role = 'petani'"));assert.ok(call.sql.includes("s.status = 'aktif'"));
      assert.ok(call.sql.includes('AND s.')||call.sql.includes('AND r.'));
      if(call.values[0]==='pemupukan'||call.values[0]==='pengobatan')assert.ok(call.sql.includes("FROM activity_reminders r"));
    }
    calls.length=0;await generateReminders(new Date(),reminderConfig({REMINDERS_ENABLED:'false'}));assert.equal(calls.length,0);
  }finally{pool.execute=original;}
});
test('scheduler skips overlapping runs and stops cleanly without a cron dependency',async()=>{
  const originalExecute=pool.execute,originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;
  let callback;let executions=0;let release;
  pool.execute=async()=>{executions++;await new Promise(resolve=>{release=resolve;});return [{affectedRows:0},[]];};
  globalThis.setInterval=cb=>{callback=cb;return {unref(){}};};globalThis.clearInterval=()=>{};
  try{
    const stop=startReminderScheduler({...reminderConfig({}),plantingDays:[],harvestDays:[],activityDays:[]});
    assert.equal(executions,1);callback();assert.equal(executions,1);release();await new Promise(resolve=>setImmediate(resolve));
    callback();assert.equal(executions,2);stop();release();await new Promise(resolve=>setImmediate(resolve));callback();assert.equal(executions,2);
  }finally{pool.execute=originalExecute;globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;}
});
test('HTTP notification ownership/read/count and explicit activity schedule authorization',async()=>{
  const original=pool.execute,originalUser=UserRepository.findById,originalCycle=SiklusTanamRepository.findByIdForUser;
  const roles={1:'admin',2:'penyuluh',3:'petani',4:'petani',5:'user'};
  UserRepository.findById=async id=>({id,role:roles[id],email:'test@example.test'});
  SiklusTanamRepository.findByIdForUser=async(id,userId)=>id===201&&userId===3?{id:201,status:'aktif',tanggal_tanam:'2020-01-01'}:null;
  const notices=[{id:11,user_id:3,title:'Owner A',read_at:null},{id:12,user_id:4,title:'Owner B',read_at:null},{id:13,user_id:3,title:'Second',read_at:null}];
  const calls=[];
  pool.execute=async(sql,values)=>{
    calls.push({sql,values});
    if(sql.includes('FROM notifications')||sql.startsWith('UPDATE notifications')){
      assert.ok(sql.includes('user_id = ?'),'Every owner API read/write has SQL ownership');
      if(sql.startsWith('UPDATE')&&sql.includes('related_entity_type'))return [{affectedRows:0},[]];
      if(sql.startsWith('UPDATE')){
        const one=sql.includes('WHERE id = ?');const owner=values[one?1:0];let changed=0;
        for(const row of notices)if(row.user_id===owner&&(!one||row.id===values[0])&&!row.read_at){row.read_at='2026-10-03';changed++;}
        return [{affectedRows:changed},[]];
      }
      const one=sql.includes('WHERE id = ?');const owner=values[one?1:0];
      const matches=notices.filter(row=>row.user_id===owner&&(!one||row.id===values[0])&&(!sql.includes('read_at IS NULL')||!row.read_at));
      return [sql.includes('COUNT(*)')?[{total:matches.length}]:matches,[]];
    }
    if(sql.startsWith('INSERT INTO activity_reminders')){assert.ok(sql.includes('p.user_id = ?'));assert.equal(values.at(-1),3);return [{insertId:401},[]];}
    if(sql.startsWith('UPDATE activity_reminders')){assert.ok(sql.includes('p.user_id = ?'));return [{affectedRows:1},[]];}
    if(sql.includes('FROM activity_reminders'))return [sql.includes('COUNT(*)')?[{total:1}]:[{id:401,status:'terjadwal',tanggal_rencana:'2099-01-02',petani_nama:'Andi'}],[]];
    throw new Error('Unexpected query');
  };
  const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/notifications',notificationRoutes);app.use('/api/reminders',reminderRoutes);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=(path,id=3,method='GET',body)=>fetch(base+path,{method,headers:{...(id?{authorization:`Bearer ${generateToken({userId:id,email:'test@example.test',role:roles[id]})}`} :{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await request('/notifications',0)).status,401);
    const list=await (await request('/notifications?user_id=4')).json();assert.deepEqual(list.data.map(row=>row.id),[11,13]);assert.equal(list.pagination.total,2);
    assert.equal((await (await request('/notifications/unread-count')).json()).unreadCount,2);
    assert.equal((await request('/notifications/12/read',3,'PUT')).status,404);assert.equal(notices[1].read_at,null);
    assert.equal((await request('/notifications/11/read',3,'PUT')).status,200);
    assert.equal((await request('/notifications/11/read',3,'PUT')).status,200);
    assert.equal((await (await request('/notifications/unread-count')).json()).unreadCount,1);
    assert.equal((await request('/notifications/read-all',3,'PUT')).status,200);assert.equal(notices[1].read_at,null);
    assert.equal((await (await request('/notifications/unread-count')).json()).unreadCount,0);
    for(const id of [1,2,5])assert.equal((await (await request('/notifications',id)).json()).data.length,0);
    assert.equal((await request('/notifications?page=0')).status,400);
    const body={siklus_tanam_id:201,jenis_aktivitas:'pemupukan',tanggal_rencana:'2099-01-02',nama_material:'Kompos',user_id:4};
    assert.equal((await request('/reminders',2,'POST',body)).status,403);
    assert.equal((await request('/reminders',5)).status,403);
    assert.equal((await request('/reminders',3,'POST',{...body,siklus_tanam_id:202})).status,404);
    assert.equal((await request('/reminders',3,'POST',{...body,tanggal_rencana:'2020-02-30'})).status,400);
    assert.equal((await request('/reminders',3,'POST',{...body,jenis_aktivitas:['pemupukan']})).status,400);
    assert.equal((await request('/reminders',3,'POST',body)).status,201);
    assert.equal((await request('/reminders/401/status',3,'PUT',{status:'selesai'})).status,200);
    assert.equal((await request('/reminders/401/status',2,'PUT',{status:'dibatalkan'})).status,403);
    assert.ok(!calls.some(call=>call.sql.startsWith('INSERT INTO aktivitas_pertanian')));
  }finally{await new Promise(resolve=>server.close(resolve));pool.execute=original;UserRepository.findById=originalUser;SiklusTanamRepository.findByIdForUser=originalCycle;}
});
