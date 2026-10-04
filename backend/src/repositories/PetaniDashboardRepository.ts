import mysqlPool from '../config/mysql-database.js';
import { PetaniRepository } from './PetaniRepository.js';

export interface PetaniDashboardDateFilter { startDate?: string; endDate?: string; }

const dateClause = (alias: string, filter: PetaniDashboardDateFilter): { sql: string; params: string[] } => {
  if (!filter.startDate || !filter.endDate) return { sql: '', params: [] };
  return { sql: ` AND ${alias} BETWEEN ? AND ?`, params: [filter.startDate, filter.endDate] };
};

export class PetaniDashboardRepository {
  static async getDashboard(userId: number, filter: PetaniDashboardDateFilter) {
    const petani = await PetaniRepository.findByUserId(userId);
    if (!petani?.id) return null;
    const petaniId = petani.id;
    const panenDate = dateClause('p.tanggalPanen', filter);
    const activityDate = dateClause('a.tanggal', filter);

    const [summaryRows, monthRows, yearRows, landRows, cycleRows, activityRows, harvestRows, trendRows, activityTypeRows, cropRows] = await Promise.all([
      mysqlPool.execute(`SELECT COUNT(*) AS total_lahan, SUM(status = 'produktif') AS lahan_produktif, (SELECT COUNT(*) FROM siklus_tanam s INNER JOIN lahan sl ON sl.id = s.lahan_id WHERE sl.petani_id = ? AND s.status = 'aktif') AS siklus_aktif, (SELECT COUNT(*) FROM panen p WHERE p.petani_id = ?${panenDate.sql}) AS panen_dalam_periode FROM lahan WHERE petani_id = ?`, [petaniId, petaniId, ...panenDate.params, petaniId]),
      mysqlPool.execute('SELECT COUNT(*) AS total FROM panen WHERE petani_id = ? AND tanggalPanen >= DATE_FORMAT(CURDATE(), \'%Y-%m-01\') AND tanggalPanen < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)', [petaniId]),
      mysqlPool.execute('SELECT COUNT(*) AS total FROM panen WHERE petani_id = ? AND tanggalPanen >= DATE_FORMAT(CURDATE(), \'%Y-01-01\') AND tanggalPanen < DATE_ADD(DATE_FORMAT(CURDATE(), \'%Y-01-01\'), INTERVAL 1 YEAR)', [petaniId]),
      mysqlPool.execute('SELECT id, nama_lahan, luas, lokasi, status FROM lahan WHERE petani_id = ? ORDER BY updated_at DESC LIMIT 5', [petaniId]),
      mysqlPool.execute(`SELECT s.id, s.tanggal_tanam, s.perkiraan_tanggal_panen, s.status, l.nama_lahan, t.namaTanaman AS tanaman FROM siklus_tanam s INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN tanaman t ON t.id = s.tanaman_id WHERE l.petani_id = ? AND s.status = 'aktif' ORDER BY COALESCE(s.perkiraan_tanggal_panen, s.tanggal_tanam) ASC LIMIT 10`, [petaniId]),
      mysqlPool.execute(`SELECT a.id, a.tanggal, a.jenis_aktivitas, a.nama_material, a.kondisi, a.catatan, l.nama_lahan, t.namaTanaman AS tanaman FROM aktivitas_pertanian a INNER JOIN siklus_tanam s ON s.id = a.siklus_tanam_id INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN tanaman t ON t.id = s.tanaman_id WHERE l.petani_id = ?${activityDate.sql} ORDER BY a.tanggal DESC, a.id DESC LIMIT 10`, [petaniId, ...activityDate.params]),
      mysqlPool.execute(`SELECT p.id, p.tanggalPanen AS tanggal, COALESCE(l.nama_lahan, p.lahan, '-') AS lahan, COALESCE(t.namaTanaman, '-') AS tanaman, p.jumlahHasilPanen AS jumlah, p.statusPenjualan AS status_penjualan FROM panen p LEFT JOIN lahan l ON l.id = p.lahan_id LEFT JOIN tanaman t ON t.id = p.tanaman_id WHERE p.petani_id = ?${panenDate.sql} ORDER BY p.tanggalPanen DESC, p.id DESC LIMIT 10`, [petaniId, ...panenDate.params]),
      mysqlPool.execute(`SELECT DATE_FORMAT(p.tanggalPanen, '%Y-%m') AS periode, COUNT(*) AS total FROM panen p WHERE p.petani_id = ? AND p.tanggalPanen IS NOT NULL${panenDate.sql} GROUP BY DATE_FORMAT(p.tanggalPanen, '%Y-%m') ORDER BY periode`, [petaniId, ...panenDate.params]),
      mysqlPool.execute(`SELECT a.jenis_aktivitas, COUNT(*) AS total FROM aktivitas_pertanian a INNER JOIN siklus_tanam s ON s.id = a.siklus_tanam_id INNER JOIN lahan l ON l.id = s.lahan_id WHERE l.petani_id = ?${activityDate.sql} GROUP BY a.jenis_aktivitas ORDER BY total DESC`, [petaniId, ...activityDate.params]),
      mysqlPool.execute(`SELECT COALESCE(t.namaTanaman, 'Tanaman tidak diketahui') AS tanaman, COUNT(*) AS total FROM panen p LEFT JOIN tanaman t ON t.id = p.tanaman_id WHERE p.petani_id = ?${panenDate.sql} GROUP BY t.id, t.namaTanaman ORDER BY total DESC`, [petaniId, ...panenDate.params]),
    ]);

    return {
      profile: petani,
      summary: {
        ...(summaryRows[0] as Array<Record<string, number>>)[0],
        panen_bulan_ini: (monthRows[0] as Array<{ total: number }>)[0]?.total || 0,
        panen_tahun_ini: (yearRows[0] as Array<{ total: number }>)[0]?.total || 0,
      },
      lahan: landRows[0],
      activeCycles: cycleRows[0],
      recentActivities: activityRows[0],
      recentHarvests: harvestRows[0],
      harvestTrend: trendRows[0],
      activityByType: activityTypeRows[0],
      harvestByCrop: cropRows[0],
    };
  }
}
