import { petaniSearch } from '../utils/petaniSearch.js';
// backend/src/repositories/PetaniRepository.ts
import { executeQuery, executeModifyQuery } from '../config/mysql-database.js';
import { Petani } from '../models/mysql/interfaces.js';
import { ListQuery } from '../utils/listQuery.js';

export class PetaniRepository {
  
  static async findAll(): Promise<Petani[]> {
    const query = 'SELECT * FROM petani ORDER BY created_at DESC';
    return await executeQuery(query);
  }

  static async findPage(queryOptions: ListQuery, petaniId?: number): Promise<{ data: Petani[]; total: number }> {
    const { where, values } = petaniSearch(queryOptions, petaniId);
    const rows = await executeQuery<Petani>(
      `SELECT * FROM petani ${where} ORDER BY ${queryOptions.sortBy} ${queryOptions.sortOrder} LIMIT ? OFFSET ?`,
      [...values, String(queryOptions.limit), String(queryOptions.offset)]
    );
    const countRows = await executeQuery<{ total: number }>(`SELECT COUNT(*) AS total FROM petani ${where}`, values);
    return { data: rows, total: Number(countRows[0]?.total || 0) };
  }

  static async findById(id: number): Promise<Petani | null> {
    const query = 'SELECT * FROM petani WHERE id = ?';
    const rows = await executeQuery<Petani>(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async findByUserId(userId: number): Promise<Petani | null> {
    const query = 'SELECT * FROM petani WHERE user_id = ?';
    const rows = await executeQuery<Petani>(query, [userId]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async linkUser(id: number, userId: number): Promise<boolean> {
    const query = 'UPDATE petani SET user_id = ?, updated_at = NOW() WHERE id = ? AND user_id IS NULL';
    const result = await executeModifyQuery(query, [userId, id]);
    return result.affectedRows > 0;
  }

  static async create(petaniData: Omit<Petani, 'id'>): Promise<number> {
    const query = `
      INSERT INTO petani (nama, alamat, nomorKontak, foto)
      VALUES (?, ?, ?, ?)
    `;
    
    const result = await executeModifyQuery(query, [
      petaniData.nama,
      petaniData.alamat ?? null,
      petaniData.nomorKontak ?? null,
      petaniData.foto ?? null
    ]);
    
    return result.insertId;
  }

  static async update(id: number, petaniData: Partial<Petani>): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    
    Object.entries(petaniData).forEach(([key, value]) => {
      if (key !== 'id' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    if (fields.length === 0) return false;
    
    const query = `UPDATE petani SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    
    const result = await executeModifyQuery(query, values);
    return result.affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM petani WHERE id = ?';
    const result = await executeModifyQuery(query, [id]);
    return result.affectedRows > 0;
  }

  static async search(searchTerm: string): Promise<Petani[]> {
    const query = `
      SELECT * FROM petani 
      WHERE nama LIKE ? OR alamat LIKE ?
      ORDER BY created_at DESC
    `;
    return await executeQuery(query, [`%${searchTerm}%`, `%${searchTerm}%`]);
  }
}
