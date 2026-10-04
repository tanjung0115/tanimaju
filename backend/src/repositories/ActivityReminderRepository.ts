import { jakartaTimestamp } from '../services/reminderScheduler.js';
import pool from '../config/mysql-database.js';
import type { ListQuery } from '../utils/listQuery.js';
import { pagination } from '../utils/listQuery.js';
export type ReminderStatus = 'terjadwal' | 'selesai' | 'dibatalkan';
export type ActivityReminderInput = { siklus_tanam_id: number; jenis_aktivitas: 'pemupukan' | 'pengobatan'; tanggal_rencana: string; nama_material: string | null; catatan: string | null };
export type ActivityReminder = ActivityReminderInput & { id: number; status: ReminderStatus; petani_nama: string; nama_lahan: string; tanaman_nama: string };
const base = 'FROM activity_reminders r INNER JOIN siklus_tanam s ON s.id = r.siklus_tanam_id INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN petani p ON p.id = l.petani_id INNER JOIN tanaman t ON t.id = s.tanaman_id';
export class ActivityReminderRepository {
  static async list(userId: number | null, query: ListQuery) {
    const where = userId === null ? '' : 'WHERE p.user_id = ?';
    const values = userId === null ? [] : [userId];
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total ${base} ${where}`,values);
    const [rows] = await pool.execute(`SELECT r.*, p.nama AS petani_nama, l.nama_lahan, t.namaTanaman AS tanaman_nama ${base} ${where} ORDER BY r.tanggal_rencana ASC, r.id DESC LIMIT ? OFFSET ?`,[...values,String(query.limit),String(query.offset)]);
    return {data:(rows as ActivityReminder[]).map(row => ({...row,tanggal_rencana:typeof row.tanggal_rencana === 'string' ? row.tanggal_rencana.slice(0,10) : jakartaTimestamp(new Date(row.tanggal_rencana)).slice(0,10)})),pagination:pagination(query.page,query.limit,Number((counts as Array<{total:number}>)[0].total))};
  }
  static async findForUser(id: number, userId: number | null) {
    const [rows] = await pool.execute(`SELECT r.*, p.nama AS petani_nama, l.nama_lahan, t.namaTanaman AS tanaman_nama ${base} WHERE r.id = ?${userId === null ? '' : ' AND p.user_id = ?'}`,userId === null ? [id] : [id,userId]);
    return (rows as ActivityReminder[])[0] ?? null;
  }
  static async create(input: ActivityReminderInput, createdBy: number, isAdmin = false) {
    const [result] = await pool.execute(`INSERT INTO activity_reminders (siklus_tanam_id, jenis_aktivitas, tanggal_rencana, nama_material, catatan, created_by) SELECT s.id, ?, ?, ?, ?, ? FROM siklus_tanam s INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN petani p ON p.id = l.petani_id WHERE s.id = ? AND s.status = 'aktif' AND s.tanggal_tanam <= ?${isAdmin ? '' : ' AND p.user_id = ?'}`,[input.jenis_aktivitas,input.tanggal_rencana,input.nama_material,input.catatan,createdBy,input.siklus_tanam_id,input.tanggal_rencana,...(isAdmin?[]:[createdBy])]);
    return (result as {insertId:number}).insertId;
  }
  static async setStatus(id: number, userId: number | null, status: ReminderStatus) {
    const [result] = await pool.execute(`UPDATE activity_reminders r INNER JOIN siklus_tanam s ON s.id = r.siklus_tanam_id INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN petani p ON p.id = l.petani_id SET r.status = ?, r.updated_at = NOW() WHERE r.status = 'terjadwal' AND r.id = ?${userId === null ? '' : ' AND p.user_id = ?'}`,[status,id,...(userId === null ? [] : [userId])]);
    if ((result as {affectedRows:number}).affectedRows > 0 && status !== 'terjadwal') await pool.execute(`UPDATE notifications SET cancelled_at = NOW(), updated_at = NOW() WHERE related_entity_type = 'activity_reminder' AND related_entity_id = ? AND read_at IS NULL AND cancelled_at IS NULL${userId === null ? '' : ' AND user_id = ?'}`,userId === null ? [id] : [id,userId]);
    return (result as {affectedRows:number}).affectedRows > 0;
  }
}
