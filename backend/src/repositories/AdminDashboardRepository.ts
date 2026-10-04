import mysqlPool from '../config/mysql-database.js';

export interface DashboardDateFilter {
  startDate?: string;
  endDate?: string;
}

const panenDateClause = (filter: DashboardDateFilter): { sql: string; params: string[] } => {
  if (!filter.startDate || !filter.endDate) return { sql: '', params: [] };
  return { sql: ' AND p.tanggalPanen BETWEEN ? AND ?', params: [filter.startDate, filter.endDate] };
};

const activityDateClause = (filter: DashboardDateFilter): { sql: string; params: string[] } => {
  if (!filter.startDate || !filter.endDate) return { sql: '', params: [] };
  return { sql: ' AND a.tanggal BETWEEN ? AND ?', params: [filter.startDate, filter.endDate] };
};

export class AdminDashboardRepository {
  static async getDashboard(filter: DashboardDateFilter) {
    const panenDate = panenDateClause(filter);
    const activityDate = activityDateClause(filter);

    const [summaryRows, currentMonthRows, currentYearRows, harvestTrendRows, harvestByCropRows, topFarmerRows, landStatusRows, cycleStatusRows, recentActivityRows, recentHarvestRows, fertilizerRows, treatmentRows] = await Promise.all([
      mysqlPool.execute(`
        SELECT
          (SELECT COUNT(*) FROM petani) AS total_petani,
          (SELECT COUNT(*) FROM lahan) AS total_lahan,
          (SELECT COUNT(*) FROM lahan WHERE status = 'produktif') AS lahan_produktif,
          (SELECT COUNT(*) FROM siklus_tanam WHERE status = 'aktif') AS siklus_aktif,
          (SELECT COUNT(*) FROM panen p WHERE 1 = 1${panenDate.sql}) AS panen_dalam_periode
      `, panenDate.params),
      mysqlPool.execute(`SELECT COUNT(*) AS total FROM panen WHERE tanggalPanen >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND tanggalPanen < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)`),
      mysqlPool.execute(`SELECT COUNT(*) AS total FROM panen WHERE tanggalPanen >= DATE_FORMAT(CURDATE(), '%Y-01-01') AND tanggalPanen < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-01-01'), INTERVAL 1 YEAR)`),
      mysqlPool.execute(`
        SELECT DATE_FORMAT(p.tanggalPanen, '%Y-%m') AS periode, COUNT(*) AS total
        FROM panen p
        WHERE p.tanggalPanen IS NOT NULL${panenDate.sql}
        GROUP BY DATE_FORMAT(p.tanggalPanen, '%Y-%m')
        ORDER BY periode
      `, panenDate.params),
      mysqlPool.execute(`
        SELECT COALESCE(t.namaTanaman, 'Tanaman tidak diketahui') AS tanaman, COUNT(*) AS total
        FROM panen p
        LEFT JOIN tanaman t ON t.id = p.tanaman_id
        WHERE 1 = 1${panenDate.sql}
        GROUP BY t.id, t.namaTanaman
        ORDER BY total DESC
      `, panenDate.params),
      mysqlPool.execute(`
        SELECT COALESCE(pt.nama, 'Petani tidak diketahui') AS petani, COUNT(*) AS total
        FROM panen p
        LEFT JOIN petani pt ON pt.id = p.petani_id
        WHERE 1 = 1${panenDate.sql}
        GROUP BY pt.id, pt.nama
        ORDER BY total DESC
        LIMIT 10
      `, panenDate.params),
      mysqlPool.execute(`SELECT status, COUNT(*) AS total FROM lahan GROUP BY status ORDER BY status`),
      mysqlPool.execute(`SELECT status, COUNT(*) AS total FROM siklus_tanam GROUP BY status ORDER BY status`),
      mysqlPool.execute(`
        SELECT a.id, a.tanggal, a.jenis_aktivitas, a.nama_material, a.kondisi, a.catatan,
               p.nama AS petani, l.nama_lahan, t.namaTanaman AS tanaman
        FROM aktivitas_pertanian a
        INNER JOIN siklus_tanam s ON s.id = a.siklus_tanam_id
        INNER JOIN lahan l ON l.id = s.lahan_id
        INNER JOIN petani p ON p.id = l.petani_id
        INNER JOIN tanaman t ON t.id = s.tanaman_id
        WHERE 1 = 1${activityDate.sql}
        ORDER BY a.tanggal DESC, a.id DESC
        LIMIT 10
      `, activityDate.params),
      mysqlPool.execute(`
        SELECT p.id, p.tanggalPanen AS tanggal, pt.nama AS petani,
               COALESCE(l.nama_lahan, p.lahan, '-') AS lahan,
               COALESCE(t.namaTanaman, '-') AS tanaman,
               p.jumlahHasilPanen AS jumlah, p.statusPenjualan AS status_penjualan
        FROM panen p
        LEFT JOIN petani pt ON pt.id = p.petani_id
        LEFT JOIN lahan l ON l.id = p.lahan_id
        LEFT JOIN tanaman t ON t.id = p.tanaman_id
        WHERE 1 = 1${panenDate.sql}
        ORDER BY p.tanggalPanen DESC, p.id DESC
        LIMIT 10
      `, panenDate.params),
      mysqlPool.execute(`
        SELECT a.nama_material AS material, COUNT(*) AS total
        FROM aktivitas_pertanian a
        WHERE a.jenis_aktivitas = 'pemupukan' AND a.nama_material IS NOT NULL${activityDate.sql}
        GROUP BY a.nama_material
        ORDER BY total DESC
        LIMIT 10
      `, activityDate.params),
      mysqlPool.execute(`
        SELECT a.nama_material AS material, COUNT(*) AS total
        FROM aktivitas_pertanian a
        WHERE a.jenis_aktivitas = 'pengobatan' AND a.nama_material IS NOT NULL${activityDate.sql}
        GROUP BY a.nama_material
        ORDER BY total DESC
        LIMIT 10
      `, activityDate.params),
    ]);

    return {
      summary: {
        ...(summaryRows[0] as Array<Record<string, number>>)[0],
        panen_bulan_ini: (currentMonthRows[0] as Array<{ total: number }>)[0]?.total || 0,
        panen_tahun_ini: (currentYearRows[0] as Array<{ total: number }>)[0]?.total || 0,
      },
      harvestTrend: harvestTrendRows[0],
      harvestByCrop: harvestByCropRows[0],
      topFarmers: topFarmerRows[0],
      landStatus: landStatusRows[0],
      cropCycles: cycleStatusRows[0],
      recentActivities: recentActivityRows[0],
      recentHarvests: recentHarvestRows[0],
      fertilizerStats: fertilizerRows[0],
      treatmentStats: treatmentRows[0],
    };
  }
}
