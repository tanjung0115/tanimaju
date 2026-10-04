import pool from '../config/mysql-database.js';
import type { ListQuery } from '../utils/listQuery.js';
import { pagination } from '../utils/listQuery.js';
export type PersistentNotification = { id: number; type: string; title: string; message: string; related_entity_type: string; related_entity_id: number; event_date: string; scheduled_at: Date; read_at: Date | null; created_at: Date };
const visible = 'user_id = ? AND cancelled_at IS NULL AND scheduled_at <= NOW()';
export class NotificationRepository {
  static async list(userId: number, query: ListQuery, unreadOnly: boolean) {
    const where = `${visible}${unreadOnly ? ' AND read_at IS NULL' : ''}`;
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`, [userId]);
    const [rows] = await pool.execute(`SELECT id, type, title, message, related_entity_type, related_entity_id, event_date, scheduled_at, read_at, created_at FROM notifications WHERE ${where} ORDER BY scheduled_at DESC, id DESC LIMIT ? OFFSET ?`, [userId, String(query.limit), String(query.offset)]);
    return { data: rows as PersistentNotification[], pagination: pagination(query.page, query.limit, Number((counts as Array<{total:number}>)[0].total)) };
  }
  static async unreadCount(userId: number) {
    const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM notifications WHERE ${visible} AND read_at IS NULL`, [userId]);
    return Number((rows as Array<{total:number}>)[0].total);
  }
  static async markRead(id: number, userId: number): Promise<boolean> {
    // The owner predicate is part of the UPDATE, even for Admin.
    await pool.execute(`UPDATE notifications SET read_at = COALESCE(read_at, NOW()), updated_at = NOW() WHERE id = ? AND ${visible}`, [id, userId]);
    const [rows] = await pool.execute(`SELECT id FROM notifications WHERE id = ? AND ${visible}`, [id, userId]);
    return (rows as Array<{id:number}>).length > 0;
  }
  static async markAllRead(userId: number) {
    const [result] = await pool.execute(`UPDATE notifications SET read_at = NOW(), updated_at = NOW() WHERE ${visible} AND read_at IS NULL`, [userId]);
    return (result as {affectedRows:number}).affectedRows;
  }
}
