import mysqlPool from '../config/mysql-database.js';

export type LahanStatus = 'produktif' | 'tidak produktif';

export interface Lahan {
  id: number;
  petani_id: number;
  petani_nama?: string;
  nama_lahan: string;
  luas: number;
  lokasi: string | null;
  status: LahanStatus;
  created_at: Date;
  updated_at: Date;
}

export interface LahanInput {
  petani_id: number;
  nama_lahan: string;
  luas: number;
  lokasi?: string | null;
  status?: LahanStatus;
}

const lahanSelect = `
  SELECT l.*, p.nama AS petani_nama
  FROM lahan l
  INNER JOIN petani p ON p.id = l.petani_id
`;

export class LahanRepository {
  static async findAll(): Promise<Lahan[]> {
    const [rows] = await mysqlPool.execute(`${lahanSelect} ORDER BY l.created_at DESC`);
    return rows as Lahan[];
  }

  static async findById(id: number): Promise<Lahan | null> {
    const [rows] = await mysqlPool.execute(`${lahanSelect} WHERE l.id = ?`, [id]);
    const lahanRows = rows as Lahan[];
    return lahanRows[0] || null;
  }

  static async findByIdForUser(id: number, userId: number): Promise<Lahan | null> {
    const [rows] = await mysqlPool.execute(
      `${lahanSelect} INNER JOIN users u ON u.id = p.user_id WHERE l.id = ? AND u.id = ?`,
      [id, userId]
    );
    const lahanRows = rows as Lahan[];
    return lahanRows[0] || null;
  }

  static async findByUserId(userId: number): Promise<Lahan[]> {
    const [rows] = await mysqlPool.execute(
      `${lahanSelect} INNER JOIN users u ON u.id = p.user_id WHERE u.id = ? ORDER BY l.created_at DESC`,
      [userId]
    );
    return rows as Lahan[];
  }

  static async create(input: LahanInput): Promise<number> {
    const [result] = await mysqlPool.execute(
      `INSERT INTO lahan (petani_id, nama_lahan, luas, lokasi, status) VALUES (?, ?, ?, ?, ?)`,
      [input.petani_id, input.nama_lahan, input.luas, input.lokasi || null, input.status || 'produktif']
    );
    return (result as { insertId: number }).insertId;
  }

  static async update(id: number, input: Partial<LahanInput>): Promise<boolean> {
    const fields: string[] = [];
    const values: Array<number | string | null> = [];

    for (const [field, value] of Object.entries(input)) {
      if (value !== undefined && ['petani_id', 'nama_lahan', 'luas', 'lokasi', 'status'].includes(field)) {
        fields.push(`${field} = ?`);
        values.push(value as number | string | null);
      }
    }

    if (fields.length === 0) return false;
    values.push(id);
    const [result] = await mysqlPool.execute(`UPDATE lahan SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await mysqlPool.execute('DELETE FROM lahan WHERE id = ?', [id]);
    return (result as { affectedRows: number }).affectedRows > 0;
  }
}
