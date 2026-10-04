import mysqlPool from '../config/mysql-database.js';

export type SiklusStatus = 'aktif' | 'selesai' | 'dibatalkan';

export interface SiklusTanam {
  id: number;
  lahan_id: number;
  petani_id: number;
  petani_nama?: string;
  nama_lahan?: string;
  tanaman_id: number;
  tanaman_nama?: string;
  tanggal_tanam: string;
  luas_tanam: number | null;
  perkiraan_tanggal_panen: string | null;
  status: SiklusStatus;
  catatan: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SiklusTanamInput {
  lahan_id: number;
  tanaman_id: number;
  tanggal_tanam: string;
  luas_tanam?: number | null;
  perkiraan_tanggal_panen?: string | null;
  status?: SiklusStatus;
  catatan?: string | null;
}

const selectQuery = `
  SELECT s.*, l.petani_id, l.nama_lahan, p.nama AS petani_nama, t.namaTanaman AS tanaman_nama
  FROM siklus_tanam s
  INNER JOIN lahan l ON l.id = s.lahan_id
  INNER JOIN petani p ON p.id = l.petani_id
  INNER JOIN tanaman t ON t.id = s.tanaman_id
`;

export class SiklusTanamRepository {
  static async findAll(): Promise<SiklusTanam[]> {
    const [rows] = await mysqlPool.execute(`${selectQuery} ORDER BY s.tanggal_tanam DESC, s.id DESC`);
    return rows as SiklusTanam[];
  }

  static async findById(id: number): Promise<SiklusTanam | null> {
    const [rows] = await mysqlPool.execute(`${selectQuery} WHERE s.id = ?`, [id]);
    return (rows as SiklusTanam[])[0] || null;
  }

  static async findByIdForUser(id: number, userId: number): Promise<SiklusTanam | null> {
    const [rows] = await mysqlPool.execute(
      `${selectQuery} INNER JOIN users u ON u.id = p.user_id WHERE s.id = ? AND u.id = ?`,
      [id, userId]
    );
    return (rows as SiklusTanam[])[0] || null;
  }

  static async findByUserId(userId: number): Promise<SiklusTanam[]> {
    const [rows] = await mysqlPool.execute(
      `${selectQuery} INNER JOIN users u ON u.id = p.user_id WHERE u.id = ? ORDER BY s.tanggal_tanam DESC, s.id DESC`,
      [userId]
    );
    return rows as SiklusTanam[];
  }

  static async create(input: SiklusTanamInput): Promise<number> {
    const [result] = await mysqlPool.execute(
      `INSERT INTO siklus_tanam (lahan_id, tanaman_id, tanggal_tanam, luas_tanam, perkiraan_tanggal_panen, status, catatan) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.lahan_id, input.tanaman_id, input.tanggal_tanam, input.luas_tanam ?? null, input.perkiraan_tanggal_panen ?? null, input.status || 'aktif', input.catatan ?? null]
    );
    return (result as { insertId: number }).insertId;
  }

  static async update(id: number, input: SiklusTanamInput): Promise<boolean> {
    const [result] = await mysqlPool.execute(
      `UPDATE siklus_tanam SET lahan_id = ?, tanaman_id = ?, tanggal_tanam = ?, luas_tanam = ?, perkiraan_tanggal_panen = ?, status = ?, catatan = ?, updated_at = NOW() WHERE id = ?`,
      [input.lahan_id, input.tanaman_id, input.tanggal_tanam, input.luas_tanam ?? null, input.perkiraan_tanggal_panen ?? null, input.status || 'aktif', input.catatan ?? null, id]
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await mysqlPool.execute('DELETE FROM siklus_tanam WHERE id = ?', [id]);
    return (result as { affectedRows: number }).affectedRows > 0;
  }
}
