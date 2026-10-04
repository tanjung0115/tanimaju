import mysqlPool from '../config/mysql-database.js';

export type AktivitasJenis = 'penanaman' | 'pemupukan' | 'pengobatan' | 'monitoring';

export interface AktivitasPertanian {
  id: number;
  siklus_tanam_id: number;
  panen_id: number | null;
  jenis_aktivitas: AktivitasJenis;
  tanggal: string;
  nama_material: string | null;
  dosis: number | null;
  satuan: string | null;
  tujuan: string | null;
  kondisi: string | null;
  catatan: string | null;
  petani_id: number;
  petani_nama?: string;
  lahan_id?: number;
  nama_lahan?: string;
  tanaman_id?: number;
  tanaman_nama?: string;
  siklus_status?: string;
}

export interface AktivitasPertanianInput {
  siklus_tanam_id: number;
  panen_id?: number | null;
  jenis_aktivitas: AktivitasJenis;
  tanggal: string;
  nama_material?: string | null;
  dosis?: number | null;
  satuan?: string | null;
  tujuan?: string | null;
  kondisi?: string | null;
  catatan?: string | null;
}

const selectQuery = `
  SELECT a.*, s.status AS siklus_status, l.petani_id, l.id AS lahan_id, l.nama_lahan,
         p.nama AS petani_nama, s.tanaman_id, t.namaTanaman AS tanaman_nama
  FROM aktivitas_pertanian a
  INNER JOIN siklus_tanam s ON s.id = a.siklus_tanam_id
  INNER JOIN lahan l ON l.id = s.lahan_id
  INNER JOIN petani p ON p.id = l.petani_id
  INNER JOIN tanaman t ON t.id = s.tanaman_id
`;

export class AktivitasPertanianRepository {
  static async findAll(): Promise<AktivitasPertanian[]> {
    const [rows] = await mysqlPool.execute(`${selectQuery} ORDER BY a.tanggal DESC, a.id DESC`);
    return rows as AktivitasPertanian[];
  }

  static async findById(id: number): Promise<AktivitasPertanian | null> {
    const [rows] = await mysqlPool.execute(`${selectQuery} WHERE a.id = ?`, [id]);
    return (rows as AktivitasPertanian[])[0] || null;
  }

  static async findByIdForUser(id: number, userId: number): Promise<AktivitasPertanian | null> {
    const [rows] = await mysqlPool.execute(
      `${selectQuery} INNER JOIN users u ON u.id = p.user_id WHERE a.id = ? AND u.id = ?`,
      [id, userId]
    );
    return (rows as AktivitasPertanian[])[0] || null;
  }

  static async findByUserId(userId: number): Promise<AktivitasPertanian[]> {
    const [rows] = await mysqlPool.execute(
      `${selectQuery} INNER JOIN users u ON u.id = p.user_id WHERE u.id = ? ORDER BY a.tanggal DESC, a.id DESC`,
      [userId]
    );
    return rows as AktivitasPertanian[];
  }

  static async create(input: AktivitasPertanianInput): Promise<number> {
    const [result] = await mysqlPool.execute(
      `INSERT INTO aktivitas_pertanian (siklus_tanam_id, panen_id, jenis_aktivitas, tanggal, nama_material, dosis, satuan, tujuan, kondisi, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.siklus_tanam_id, input.panen_id ?? null, input.jenis_aktivitas, input.tanggal, input.nama_material ?? null, input.dosis ?? null, input.satuan ?? null, input.tujuan ?? null, input.kondisi ?? null, input.catatan ?? null]
    );
    return (result as { insertId: number }).insertId;
  }

  static async update(id: number, input: AktivitasPertanianInput): Promise<boolean> {
    const [result] = await mysqlPool.execute(
      `UPDATE aktivitas_pertanian SET siklus_tanam_id = ?, panen_id = ?, jenis_aktivitas = ?, tanggal = ?, nama_material = ?, dosis = ?, satuan = ?, tujuan = ?, kondisi = ?, catatan = ?, updated_at = NOW() WHERE id = ?`,
      [input.siklus_tanam_id, input.panen_id ?? null, input.jenis_aktivitas, input.tanggal, input.nama_material ?? null, input.dosis ?? null, input.satuan ?? null, input.tujuan ?? null, input.kondisi ?? null, input.catatan ?? null, id]
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await mysqlPool.execute('DELETE FROM aktivitas_pertanian WHERE id = ?', [id]);
    return (result as { affectedRows: number }).affectedRows > 0;
  }
}
