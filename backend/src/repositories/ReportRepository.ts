import type { Request } from 'express';
import pool from '../config/mysql-database.js';
import { buildPanenList, buildAktivitasList, buildLahanList, buildPetaniList, buildTanamanList, buildSiklusList, type ListPlan } from './listPlans.js';

export type ReportKind = 'panen' | 'aktivitas' | 'petani' | 'tanaman' | 'lahan';
export type ReportRow = Record<string, unknown>;
export const MAX_EXPORT_ROWS = 5000;
export class ExportTooLargeError extends Error {}
export function withQuery(req: Request, query: Request['query']): Request {
  const next = Object.create(req) as Request;
  Object.defineProperty(next, 'query', { value: query });
  return next;
}
const builders = { panen: buildPanenList, aktivitas: buildAktivitasList, petani: buildPetaniList, tanaman: buildTanamanList, lahan: buildLahanList };
function childRequest(req: Request) {
  // Search and parent status apply to the parent list; dates apply to each event's actual date.
  const query = { ...req.query };
  delete query.search; delete query.sort_by; delete query.sort_order; delete query.status; delete query.pupuk; delete query.lokasi;
  return withQuery(req, query);
}
function correlated(plan: ListPlan, relation: string, expression = 'COUNT(*)') {
  return { sql: `(SELECT ${expression} ${plan.base} ${plan.where || 'WHERE 1 = 1'} AND ${relation})`, values: plan.values };
}
export async function readReport(req: Request, kind: ReportKind): Promise<ReportRow[]> {
  const query: Request['query'] = { ...req.query, page: '1', limit: '20' };
  delete query.format;
  const scoped = withQuery(req, query);
  const plan = await builders[kind](scoped);
  let parentWhere = plan.where;
  let parentValues = [...plan.values];
  const child = childRequest(scoped);
  const summaries: Array<{ key: string; sql: string; values: Array<string | number> }> = [];
  if (kind === 'petani' || kind === 'tanaman' || kind === 'lahan') {
    const [harvest, cycle] = await Promise.all([buildPanenList(child), buildSiklusList(child)]);
    const relation = kind === 'petani' ? 'petani_id' : kind === 'tanaman' ? 'tanaman_id' : 'lahan_id';
    summaries.push({ key: 'jumlah_panen', ...correlated(harvest, `p.${relation} = r.id`) });
    summaries.push({ key: 'jumlah_siklus', ...correlated(cycle, `${relation === 'petani_id' ? 'l' : 's'}.${relation} = r.id`) });
    if (kind === 'petani') {
      const [land, activity] = await Promise.all([buildLahanList(child), buildAktivitasList(child)]);
      summaries.push({ key: 'jumlah_lahan', ...correlated(land, 'l.petani_id = r.id') });
      summaries.push({ key: 'lahan_nama_list', ...correlated(land, 'l.petani_id = r.id', 'LEFT(CAST(JSON_ARRAYAGG(l.nama_lahan) AS CHAR), 32768)') });
      summaries.push({ key: 'jumlah_aktivitas', ...correlated(activity, 'l.petani_id = r.id') });
    }
    if (kind === 'tanaman') {
      summaries.push({ key: 'jumlah_petani', ...correlated(cycle, 's.tanaman_id = r.id', 'COUNT(DISTINCT l.petani_id)') });
      if (req.user?.role === 'petani' || req.query.petani_id !== undefined) {
        // A farmer may see only crops they actually grow, while all counts remain ownership scoped.
        const existsCycle = correlated(cycle, 's.tanaman_id = tanaman.id');
        const existsHarvest = correlated(harvest, 'p.tanaman_id = tanaman.id');
        parentWhere += `${parentWhere ? ' AND' : 'WHERE'} (${existsCycle.sql} > 0 OR ${existsHarvest.sql} > 0)`;
        parentValues = [...parentValues, ...existsCycle.values, ...existsHarvest.values];
      }
    }
  }
  const [counts] = await pool.execute(`SELECT COUNT(*) AS total ${plan.base} ${parentWhere}`, parentValues);
  if (Number((counts as Array<{total: number}>)[0].total) > MAX_EXPORT_ROWS) throw new ExportTooLargeError('Hasil melebihi 5.000 baris. Persempit filter sebelum export.');
  const orderKey = plan.queryOptions.sortBy.split('.').slice(-1)[0];
  // The column is solely from the same sorting whitelist as the list.
  const extra = summaries.map(item => `, ${item.sql} AS ${item.key}`).join('');
  const values = [...summaries.flatMap(item => item.values), ...parentValues, String(MAX_EXPORT_ROWS + 1)];
  // Bound large TEXT before transfer, retaining one extra character so oversized cells fail explicitly.
  const projection = kind === 'aktivitas' ? plan.select.replace('a.*', 'a.id, a.siklus_tanam_id, a.jenis_aktivitas, a.tanggal, a.nama_material, a.dosis, a.satuan, a.tujuan, a.kondisi, LEFT(a.catatan, 32768) AS catatan, a.created_at') : plan.select;
  const [rows] = await pool.execute(`SELECT r.*${extra} FROM (SELECT ${projection} ${plan.base} ${parentWhere} ORDER BY ${plan.queryOptions.sortBy} ${plan.queryOptions.sortOrder} LIMIT ?) r ORDER BY r.${orderKey} ${plan.queryOptions.sortOrder}`, values);
  if ((rows as ReportRow[]).length > MAX_EXPORT_ROWS) throw new ExportTooLargeError('Hasil melebihi 5.000 baris. Persempit filter sebelum export.');
  return rows as ReportRow[];
}
