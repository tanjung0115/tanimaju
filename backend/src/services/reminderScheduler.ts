import pool from '../config/mysql-database.js';
import { TIMEZONE_NAME } from '../utils/timezone.js';
export type ReminderConfig = { enabled: boolean; intervalMinutes: number; hour: number; catchupHours: number; plantingDays: number[]; harvestDays: number[]; activityDays: number[] };
const numberSetting = (value: string | undefined, fallback: number, min: number, max: number) => { const number=Number(value); return value !== undefined && Number.isInteger(number) && number >= min && number <= max ? number : fallback; };
const daySetting = (value: string | undefined, fallback: number[]) => { const values=(value ?? '').split(',').map(item=>Number(item.trim())); return value && values.every(day=>Number.isInteger(day) && day>=0 && day<=30) ? [...new Set(values)] : fallback; };
export function reminderConfig(env: NodeJS.ProcessEnv = process.env): ReminderConfig {
  return { enabled:env.REMINDERS_ENABLED !== 'false', intervalMinutes:numberSetting(env.REMINDER_INTERVAL_MINUTES,30,1,1440), hour:numberSetting(env.REMINDER_HOUR_WIB,9,0,23), catchupHours:numberSetting(env.REMINDER_CATCHUP_HOURS,48,1,168), plantingDays:daySetting(env.REMINDER_PLANTING_DAYS,[1,0]), harvestDays:daySetting(env.REMINDER_HARVEST_DAYS,[7,3,1]), activityDays:daySetting(env.REMINDER_ACTIVITY_DAYS,[1,0]) };
}
export function jakartaTimestamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE',{timeZone:TIMEZONE_NAME,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(type:string)=>parts.find(part=>part.type===type)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
const ownerJoin = "INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN petani p ON p.id = l.petani_id INNER JOIN users u ON u.id = p.user_id";
const eligibleOwner = "u.role = 'petani' AND u.is_active = 1 AND (u.status = 'approved' OR u.status IS NULL) AND s.status = 'aktif'";
const noHarvest = 'NOT EXISTS (SELECT 1 FROM panen h WHERE h.siklus_tanam_id = s.id)';
const noPlanting = "NOT EXISTS (SELECT 1 FROM aktivitas_pertanian a WHERE a.siklus_tanam_id = s.id AND a.jenis_aktivitas = 'penanaman' AND a.tanggal <= ?)";
export async function generateReminders(now = new Date(), config = reminderConfig()): Promise<void> {
  if (!config.enabled) return;
  const timestamp = jakartaTimestamp(now);
  const today = timestamp.slice(0,10);
  // Cancel unread reminders when a source is completed/cancelled/deleted/rescheduled or ownership changed.
  await pool.execute(`UPDATE notifications n SET cancelled_at = ?, updated_at = ? WHERE n.read_at IS NULL AND n.cancelled_at IS NULL AND (
    (n.related_entity_type = 'siklus_tanam' AND NOT EXISTS (
      SELECT 1 FROM siklus_tanam s ${ownerJoin} WHERE s.id = n.related_entity_id AND u.id = n.user_id AND ${eligibleOwner}
      AND ((n.type = 'jadwal_tanam' AND s.tanggal_tanam = n.event_date AND ${noPlanting}) OR (n.type = 'perkiraan_panen' AND s.perkiraan_tanggal_panen = n.event_date AND ${noHarvest}))
    )) OR (n.related_entity_type = 'activity_reminder' AND NOT EXISTS (
      SELECT 1 FROM activity_reminders r INNER JOIN siklus_tanam s ON s.id = r.siklus_tanam_id ${ownerJoin}
      WHERE r.id = n.related_entity_id AND u.id = n.user_id AND ${eligibleOwner} AND r.status = 'terjadwal' AND r.tanggal_rencana = n.event_date AND r.jenis_aktivitas = n.type
    ))
  )`,[timestamp,timestamp,today]);
  const rules = [
    {type:'jadwal_tanam', title:'Pengingat Jadwal Tanam', entity:'siklus_tanam', id:'s.id', date:'s.tanggal_tanam', base:`FROM siklus_tanam s ${ownerJoin}`, extra:noPlanting, extraValues:[today], days:config.plantingDays},
    {type:'perkiraan_panen', title:'Pengingat Perkiraan Panen', entity:'siklus_tanam', id:'s.id', date:'s.perkiraan_tanggal_panen', base:`FROM siklus_tanam s ${ownerJoin}`, extra:noHarvest, extraValues:[], days:config.harvestDays},
    ...['pemupukan','pengobatan'].map(type=>({type,title:type==='pemupukan'?'Pengingat Pemupukan':'Pengingat Pengobatan/Pestisida',entity:'activity_reminder',id:'r.id',date:'r.tanggal_rencana',base:`FROM activity_reminders r INNER JOIN siklus_tanam s ON s.id = r.siklus_tanam_id ${ownerJoin}`,extra:"r.status = 'terjadwal' AND r.jenis_aktivitas = ?",extraValues:[type],days:config.activityDays})),
  ];
  for (const rule of rules) for (const lead of rule.days) {
    const scheduled = `TIMESTAMP(DATE_SUB(${rule.date}, INTERVAL ? DAY), ?)`;
    await pool.execute(`INSERT INTO notifications (user_id,type,title,message,related_entity_type,related_entity_id,event_date,scheduled_at,created_at,updated_at)
      SELECT u.id, ?, ?, CONCAT(?, ' | ', l.nama_lahan, ' / ', t.namaTanaman, ' pada ', DATE_FORMAT(${rule.date}, '%Y-%m-%d'), ' (H-', ?, ').'), ?, ${rule.id}, ${rule.date}, ${scheduled}, ?, ?
      ${rule.base} INNER JOIN tanaman t ON t.id = s.tanaman_id
      WHERE ${eligibleOwner} AND ${rule.extra} AND ${rule.date} >= ?
      AND ${scheduled} <= ? AND ${scheduled} >= DATE_SUB(?, INTERVAL ? HOUR)
      ON DUPLICATE KEY UPDATE id = notifications.id`,
      [rule.type,rule.title,rule.title,lead,rule.entity,lead,`${String(config.hour).padStart(2,'0')}:00:00`,timestamp,timestamp,...rule.extraValues,today,lead,`${String(config.hour).padStart(2,'0')}:00:00`,timestamp,lead,`${String(config.hour).padStart(2,'0')}:00:00`,timestamp,config.catchupHours]);
  }
}
export function startReminderScheduler(config = reminderConfig()): (() => void) | null {
  if (!config.enabled) return null;
  let running = false;
  let stopped = false;
  let missingSchemaLogged = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await generateReminders(new Date(),config); missingSchemaLogged=false; }
    catch (error) {
      const code = (error as {code?:string}).code;
      if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') {
        if (!missingSchemaLogged) console.warn('Reminder scheduler belum aktif: jalankan migration prerequisite dan 013 pada database target.');
        missingSchemaLogged=true;
      } else console.error('Reminder scheduler failed:',error);
    } finally { running=false; }
  };
  void tick();
  const timer = setInterval(()=>{void tick();},config.intervalMinutes*60*1000);
  timer.unref();
  return () => { stopped=true;clearInterval(timer); };
}
