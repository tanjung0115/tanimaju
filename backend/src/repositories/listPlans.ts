import { petaniSearch } from '../utils/petaniSearch.js';
import type { Request } from 'express';
import { parseListQuery, type ListQuery } from '../utils/listQuery.js';
import { PetaniRepository } from './PetaniRepository.js';

export class ListValidationError extends Error {}
export type ListPlan = { queryOptions: ListQuery; values: Array<string | number>; where: string; base: string; select: string };
export function validateFilterEnums(req: Request) {
  const enums: Record<string, string[]> = { status: ['produktif', 'tidak produktif'], status_siklus: ['aktif', 'selesai', 'dibatalkan'], status_penjualan: ['Terjual', 'Belum Terjual'], jenis_aktivitas: ['penanaman', 'pemupukan', 'pengobatan', 'monitoring'] };
  for (const [key, allowed] of Object.entries(enums)) if (req.query[key] !== undefined && !allowed.includes(String(req.query[key]))) throw new ListValidationError(`Invalid ${key}`);
}

export async function buildPanenList(req: Request): Promise<ListPlan> {
  const queryOptions = parseListQuery(req, { tanggal_panen: 'p.tanggalPanen', jumlah_hasil: 'p.jumlahHasilPanen', id: 'p.id' }, 'tanggal_panen');
      if ('error' in queryOptions) throw new ListValidationError(queryOptions.error);
    validateFilterEnums(req);
      const conditions: string[] = [];
      const values: Array<string | number> = [];
      if (req.user?.role === 'petani') {
        const profile = await PetaniRepository.findByUserId(req.user.id);
        if (!profile?.id) { conditions.push('1 = 0'); }
        else { conditions.push('p.petani_id = ?'); values.push(profile.id); }
      } else if (req.query.petani_id !== undefined) { conditions.push('p.petani_id = ?'); values.push(Number.parseInt(String(req.query.petani_id), 10)); }
      if (req.query.tanaman_id !== undefined) { conditions.push('p.tanaman_id = ?'); values.push(Number.parseInt(String(req.query.tanaman_id), 10)); }
      if (req.query.lahan_id !== undefined) { conditions.push('p.lahan_id = ?'); values.push(Number.parseInt(String(req.query.lahan_id), 10)); }
      if (typeof req.query.status_penjualan === 'string') { conditions.push('p.statusPenjualan = ?'); values.push(req.query.status_penjualan); }
      if (queryOptions.startDate) { conditions.push('p.tanggalPanen >= ?'); values.push(queryOptions.startDate); }
      if (queryOptions.endDate) { conditions.push('p.tanggalPanen <= ?'); values.push(queryOptions.endDate); }
      if (queryOptions.search) { conditions.push('(pt.nama LIKE ? OR p.namaPembeli LIKE ? OR p.lahan LIKE ? OR l.nama_lahan LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term, term, term); }
      if (typeof req.query.legacy_lahan === 'string') { conditions.push('(p.lahan_id IS NULL AND p.lahan LIKE ?)'); values.push(`%${req.query.legacy_lahan}%`); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const base = 'FROM panen p LEFT JOIN petani pt ON p.petani_id = pt.id LEFT JOIN tanaman t ON p.tanaman_id = t.id LEFT JOIN bibit b ON p.bibit_id = b.id LEFT JOIN lahan l ON p.lahan_id = l.id';
      return { queryOptions, values, where, base, select: 'p.*, pt.nama AS petani_nama, t.namaTanaman AS tanaman_nama, b.namaPenyedia AS bibit_nama_penyedia, l.nama_lahan AS lahan_nama' };
}

export async function buildLahanList(req: Request): Promise<ListPlan> {
  const queryOptions = parseListQuery(req, { nama_lahan: 'l.nama_lahan', luas: 'l.luas', status: 'l.status', created_at: 'l.created_at' }, 'created_at');
    if ('error' in queryOptions) throw new ListValidationError(queryOptions.error);
    validateFilterEnums(req);
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (req.user!.role === 'petani') {
      const profile = await PetaniRepository.findByUserId(req.user!.id);
      if (!profile?.id) { conditions.push('1 = 0'); }
      else { conditions.push('l.petani_id = ?'); values.push(profile.id); }
    } else if (req.query.petani_id !== undefined) {
      const petaniId = Number.parseInt(String(req.query.petani_id), 10);
      if (!Number.isInteger(petaniId) || petaniId <= 0) throw new ListValidationError('Invalid petani_id');
      conditions.push('l.petani_id = ?'); values.push(petaniId);
    }
    if (queryOptions.search) { conditions.push('(l.nama_lahan LIKE ? OR l.lokasi LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term); }
    if (typeof req.query.status === 'string') { conditions.push('l.status = ?'); values.push(req.query.status); }
    if (req.query.lahan_id !== undefined) { conditions.push('l.id = ?'); values.push(Number(req.query.lahan_id)); }
    if (typeof req.query.lokasi === 'string') { conditions.push('l.lokasi LIKE ?'); values.push(`%${req.query.lokasi}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const base = 'FROM lahan l INNER JOIN petani p ON p.id = l.petani_id';
return { queryOptions, values, where, base, select: 'l.*, p.nama AS petani_nama' };
}

export async function buildSiklusList(req: Request): Promise<ListPlan> {
  const queryOptions = parseListQuery(req, { tanggal_tanam: 's.tanggal_tanam', perkiraan_tanggal_panen: 's.perkiraan_tanggal_panen', status: 's.status', created_at: 's.created_at' }, 'tanggal_tanam');
    if ('error' in queryOptions) throw new ListValidationError(queryOptions.error);
    validateFilterEnums(req);
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (req.user!.role === 'petani') {
      const profile = await PetaniRepository.findByUserId(req.user!.id);
      if (!profile?.id) { conditions.push('1 = 0'); }
      else { conditions.push('l.petani_id = ?'); values.push(profile.id); }
    } else if (req.query.petani_id !== undefined) { conditions.push('l.petani_id = ?'); values.push(Number.parseInt(String(req.query.petani_id), 10)); }
    if (req.query.lahan_id !== undefined) { conditions.push('s.lahan_id = ?'); values.push(Number.parseInt(String(req.query.lahan_id), 10)); }
    if (req.query.tanaman_id !== undefined) { conditions.push('s.tanaman_id = ?'); values.push(Number.parseInt(String(req.query.tanaman_id), 10)); }
    if (typeof req.query.status_siklus === 'string') { conditions.push('s.status = ?'); values.push(req.query.status_siklus); }
    if (queryOptions.startDate) { conditions.push('s.tanggal_tanam >= ?'); values.push(queryOptions.startDate); }
    if (queryOptions.endDate) { conditions.push('s.tanggal_tanam <= ?'); values.push(queryOptions.endDate); }
    if (queryOptions.search) { conditions.push('(l.nama_lahan LIKE ? OR t.namaTanaman LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term); }
    if (req.query.harvest_start_date && req.query.harvest_end_date && String(req.query.harvest_start_date) > String(req.query.harvest_end_date)) throw new ListValidationError('Invalid harvest date range');
    if (typeof req.query.harvest_start_date === 'string') { conditions.push('s.perkiraan_tanggal_panen >= ?'); values.push(req.query.harvest_start_date); }
    if (typeof req.query.harvest_end_date === 'string') { conditions.push('s.perkiraan_tanggal_panen <= ?'); values.push(req.query.harvest_end_date); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const base = 'FROM siklus_tanam s INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN petani p ON p.id = l.petani_id INNER JOIN tanaman t ON t.id = s.tanaman_id';
    return { queryOptions, values, where, base, select: 's.*, l.petani_id, l.nama_lahan, p.nama AS petani_nama, t.namaTanaman AS tanaman_nama' };
}

export async function buildAktivitasList(req: Request): Promise<ListPlan> {
  const queryOptions = parseListQuery(req, { tanggal: 'a.tanggal', created_at: 'a.created_at', jenis_aktivitas: 'a.jenis_aktivitas' }, 'tanggal');
    if ('error' in queryOptions) throw new ListValidationError(queryOptions.error);
    validateFilterEnums(req);
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (req.user!.role === 'petani') {
      const profile = await PetaniRepository.findByUserId(req.user!.id);
      if (!profile?.id) { conditions.push('1 = 0'); }
      else { conditions.push('l.petani_id = ?'); values.push(profile.id); }
    } else if (req.query.petani_id !== undefined) { conditions.push('l.petani_id = ?'); values.push(Number.parseInt(String(req.query.petani_id), 10)); }
    if (req.query.lahan_id !== undefined) { conditions.push('s.lahan_id = ?'); values.push(Number.parseInt(String(req.query.lahan_id), 10)); }
    if (req.query.tanaman_id !== undefined) { conditions.push('s.tanaman_id = ?'); values.push(Number.parseInt(String(req.query.tanaman_id), 10)); }
    if (req.query.siklus_tanam_id !== undefined) { conditions.push('a.siklus_tanam_id = ?'); values.push(Number.parseInt(String(req.query.siklus_tanam_id), 10)); }
    if (typeof req.query.jenis_aktivitas === 'string') { conditions.push('a.jenis_aktivitas = ?'); values.push(req.query.jenis_aktivitas); }
    if (queryOptions.startDate) { conditions.push('a.tanggal >= ?'); values.push(queryOptions.startDate); }
    if (queryOptions.endDate) { conditions.push('a.tanggal <= ?'); values.push(queryOptions.endDate); }
    if (queryOptions.search) { conditions.push('(a.nama_material LIKE ? OR a.tujuan LIKE ? OR a.kondisi LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term, term); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const base = 'FROM aktivitas_pertanian a INNER JOIN siklus_tanam s ON s.id = a.siklus_tanam_id INNER JOIN lahan l ON l.id = s.lahan_id INNER JOIN petani p ON p.id = l.petani_id INNER JOIN tanaman t ON t.id = s.tanaman_id';
    return { queryOptions, values, where, base, select: 'a.*, s.status AS siklus_status, l.petani_id, l.id AS lahan_id, l.nama_lahan, p.nama AS petani_nama, s.tanaman_id, t.namaTanaman AS tanaman_nama' };
}

export async function buildPetaniList(req: Request): Promise<ListPlan> {
  const queryOptions = parseListQuery(req, { nama: 'nama', created_at: 'created_at' }, 'created_at');
  if ('error' in queryOptions) throw new ListValidationError(queryOptions.error);
  validateFilterEnums(req);
  const filter = petaniSearch(queryOptions, req.query.petani_id ? Number(req.query.petani_id) : undefined);
  if (req.user?.role === 'petani') {
    const profile = await PetaniRepository.findByUserId(req.user.id);
    // Stage 8 /petani for a farmer intentionally returns only their linked profile, regardless of search.
    return { queryOptions, base: 'FROM petani', select: '*', where: profile?.id ? 'WHERE id = ?' : 'WHERE 1 = 0', values: profile?.id ? [profile.id] : [] };
  }
  return { queryOptions, base: 'FROM petani', select: '*', ...filter };
}

export async function buildTanamanList(req: Request): Promise<ListPlan> {
    const queryOptions = parseListQuery(req, { id: "id", namaTanaman: "namaTanaman", created_at: "created_at" }, "id");
    if ('error' in queryOptions) throw new ListValidationError(queryOptions.error);
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (queryOptions.search) { conditions.push('(namaTanaman LIKE ? OR pupuk LIKE ?)'); const term = `%${queryOptions.search}%`; values.push(term, term); }
    if (typeof req.query.pupuk === 'string') { conditions.push('pupuk = ?'); values.push(req.query.pupuk); }
    if (req.query.tanaman_id !== undefined) { conditions.push('id = ?'); values.push(Number(req.query.tanaman_id)); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    validateFilterEnums(req);
    return { queryOptions, values, where, base: 'FROM tanaman', select: '*' };
}
