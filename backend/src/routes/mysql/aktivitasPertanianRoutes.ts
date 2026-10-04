import { buildAktivitasList, ListValidationError } from '../../repositories/listPlans.js';
import express from 'express';
import mysqlPool from '../../config/mysql-database.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { AktivitasJenis, AktivitasPertanianInput, AktivitasPertanianRepository } from '../../repositories/AktivitasPertanianRepository.js';
import { SiklusTanamRepository } from '../../repositories/SiklusTanamRepository.js';
import { pagination } from '../../utils/listQuery.js';

const router = express.Router();
const readRoles = requireRole(['admin', 'petani', 'penyuluh']);
const writeRoles = requireRole(['admin', 'petani']);
const activityTypes: AktivitasJenis[] = ['penanaman', 'pemupukan', 'pengobatan', 'monitoring'];

const parseId = (value: unknown): number | null => {
  const id = Number.parseInt(String(value), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const parseInput = (body: Record<string, unknown>): AktivitasPertanianInput | null => {
  const siklusId = parseId(body.siklus_tanam_id);
  const panenId = body.panen_id === undefined || body.panen_id === null || body.panen_id === '' ? null : parseId(body.panen_id);
  const dosis = body.dosis === undefined || body.dosis === null || body.dosis === '' ? null : Number(body.dosis);
  const type = body.jenis_aktivitas;
  if (!siklusId || !isDate(body.tanggal) || !activityTypes.includes(type as AktivitasJenis) || panenId === null && body.panen_id !== undefined && body.panen_id !== null && body.panen_id !== '' || dosis !== null && (!Number.isFinite(dosis) || dosis < 0)) return null;
  if ((type === 'pemupukan' || type === 'pengobatan') && typeof body.nama_material !== 'string' || type === 'monitoring' && typeof body.kondisi !== 'string') return null;

  return {
    siklus_tanam_id: siklusId,
    panen_id: panenId,
    jenis_aktivitas: type as AktivitasJenis,
    tanggal: body.tanggal,
    nama_material: typeof body.nama_material === 'string' ? body.nama_material.trim() : null,
    dosis,
    satuan: typeof body.satuan === 'string' ? body.satuan.trim() : null,
    tujuan: typeof body.tujuan === 'string' ? body.tujuan.trim() : null,
    kondisi: typeof body.kondisi === 'string' ? body.kondisi.trim() : null,
    catatan: typeof body.catatan === 'string' ? body.catatan.trim() : null,
  };
};

const validateCycleAndDates = async (input: AktivitasPertanianInput, userId: number, isAdmin: boolean): Promise<boolean> => {
  const cycle = isAdmin ? await SiklusTanamRepository.findById(input.siklus_tanam_id) : await SiklusTanamRepository.findByIdForUser(input.siklus_tanam_id, userId);
  if (!cycle || input.tanggal < cycle.tanggal_tanam) return false;
  if (input.panen_id !== null) {
    const [rows] = await mysqlPool.execute(
      `SELECT id FROM panen WHERE id = ? AND (siklus_tanam_id = ? OR (siklus_tanam_id IS NULL AND petani_id = ? AND tanaman_id = ? AND lahan_id = ?))`,
      [input.panen_id, cycle.id, cycle.petani_id, cycle.tanaman_id, cycle.lahan_id]
    );
    if ((rows as Array<{ id: number }>).length === 0) return false;
  }
  return true;
};

router.get('/me', authenticateToken, requireRole(['petani']), async (req, res) => {
  try {
    res.json(await AktivitasPertanianRepository.findByUserId(req.user!.id));
  } catch (error) {
    console.error('Error fetching my agricultural activities:', error);
    res.status(500).json({ error: 'Failed to fetch agricultural activities' });
  }
});

router.get('/', authenticateToken, readRoles, async (req, res) => {
  try {
    if (Object.keys(req.query).length === 0) {
      const activities = req.user!.role === 'petani' ? await AktivitasPertanianRepository.findByUserId(req.user!.id) : await AktivitasPertanianRepository.findAll();
      return res.json(activities);
    }
    const { queryOptions, values, where, base, select } = await buildAktivitasList(req);
    const [rows] = await mysqlPool.execute(`SELECT ${select} ${base} ${where} ORDER BY ${queryOptions.sortBy} ${queryOptions.sortOrder} LIMIT ? OFFSET ?`, [...values, String(queryOptions.limit), String(queryOptions.offset)]);
    const [countRows] = await mysqlPool.execute(`SELECT COUNT(*) AS total ${base} ${where}`, values);
    return res.json({ data: rows, pagination: pagination(queryOptions.page, queryOptions.limit, Number((countRows as Array<{ total: number }>)[0]?.total || 0)) });
  } catch (error) {
    if (error instanceof ListValidationError) return res.status(400).json({ error: error.message });
    console.error('Error fetching agricultural activities:', error);
    res.status(500).json({ error: 'Failed to fetch agricultural activities' });
  }
});

router.get('/:id', authenticateToken, readRoles, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid activity ID' });
    const activity = req.user!.role === 'petani'
      ? await AktivitasPertanianRepository.findByIdForUser(id, req.user!.id)
      : await AktivitasPertanianRepository.findById(id);
    if (!activity) return res.status(404).json({ error: 'Activity not found' });
    res.json(activity);
  } catch (error) {
    console.error('Error fetching agricultural activity:', error);
    res.status(500).json({ error: 'Failed to fetch agricultural activity' });
  }
});

router.post('/', authenticateToken, writeRoles, async (req, res) => {
  try {
    const input = parseInput(req.body as Record<string, unknown>);
    if (!input || !await validateCycleAndDates(input, req.user!.id, req.user!.role === 'admin')) {
      return res.status(400).json({ error: 'Invalid activity data, cycle, date, or harvest reference' });
    }
    const id = await AktivitasPertanianRepository.create(input);
    res.status(201).json(await AktivitasPertanianRepository.findById(id));
  } catch (error) {
    console.error('Error creating agricultural activity:', error);
    res.status(500).json({ error: 'Failed to create agricultural activity' });
  }
});

router.put('/:id', authenticateToken, writeRoles, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const input = parseInput(req.body as Record<string, unknown>);
    if (!id || !input) return res.status(400).json({ error: 'Invalid activity data' });
    const current = req.user!.role === 'admin'
      ? await AktivitasPertanianRepository.findById(id)
      : await AktivitasPertanianRepository.findByIdForUser(id, req.user!.id);
    if (!current) return res.status(404).json({ error: 'Activity not found' });
    if (!await validateCycleAndDates(input, req.user!.id, req.user!.role === 'admin')) {
      return res.status(400).json({ error: 'Invalid activity cycle, date, or harvest reference' });
    }
    if (!await AktivitasPertanianRepository.update(id, input)) return res.status(404).json({ error: 'Activity not found' });
    res.json(await AktivitasPertanianRepository.findById(id));
  } catch (error) {
    console.error('Error updating agricultural activity:', error);
    res.status(500).json({ error: 'Failed to update agricultural activity' });
  }
});

router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id || !await AktivitasPertanianRepository.delete(id)) return res.status(404).json({ error: 'Activity not found' });
    res.json({ message: 'Agricultural activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting agricultural activity:', error);
    res.status(500).json({ error: 'Failed to delete agricultural activity' });
  }
});

export default router;
