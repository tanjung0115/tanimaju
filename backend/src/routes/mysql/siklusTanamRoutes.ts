import { buildSiklusList, ListValidationError } from '../../repositories/listPlans.js';
import express from 'express';
import mysqlPool from '../../config/mysql-database.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { LahanRepository } from '../../repositories/LahanRepository.js';
import { SiklusStatus, SiklusTanamInput, SiklusTanamRepository } from '../../repositories/SiklusTanamRepository.js';
import { pagination } from '../../utils/listQuery.js';

const router = express.Router();
const readRoles = requireRole(['admin', 'petani', 'penyuluh']);
const writeRoles = requireRole(['admin', 'petani']);
const statuses: SiklusStatus[] = ['aktif', 'selesai', 'dibatalkan'];

const parseId = (value: unknown): number | null => {
  const id = Number.parseInt(String(value), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const parseInput = (body: Record<string, unknown>): SiklusTanamInput | null => {
  const lahanId = parseId(body.lahan_id);
  const tanamanId = parseId(body.tanaman_id);
  const luas = body.luas_tanam === undefined || body.luas_tanam === null || body.luas_tanam === '' ? null : Number(body.luas_tanam);
  const status = body.status === undefined ? 'aktif' : body.status;
  const estimatedHarvest = body.perkiraan_tanggal_panen || null;

  if (!lahanId || !tanamanId || !isDate(body.tanggal_tanam) || !statuses.includes(status as SiklusStatus) || luas !== null && (!Number.isFinite(luas) || luas < 0) || estimatedHarvest !== null && !isDate(estimatedHarvest)) {
    return null;
  }
  if (estimatedHarvest && estimatedHarvest < body.tanggal_tanam) return null;

  return {
    lahan_id: lahanId,
    tanaman_id: tanamanId,
    tanggal_tanam: body.tanggal_tanam,
    luas_tanam: luas,
    perkiraan_tanggal_panen: estimatedHarvest as string | null,
    status: status as SiklusStatus,
    catatan: typeof body.catatan === 'string' ? body.catatan.trim() : null,
  };
};

const validateReferences = async (input: SiklusTanamInput, userId: number, isAdmin: boolean): Promise<boolean> => {
  const lahan = isAdmin ? await LahanRepository.findById(input.lahan_id) : await LahanRepository.findByIdForUser(input.lahan_id, userId);
  if (!lahan) return false;
  const [rows] = await mysqlPool.execute('SELECT id FROM tanaman WHERE id = ?', [input.tanaman_id]);
  return (rows as Array<{ id: number }>).length > 0;
};

router.get('/me', authenticateToken, requireRole(['petani']), async (req, res) => {
  try {
    res.json(await SiklusTanamRepository.findByUserId(req.user!.id));
  } catch (error) {
    console.error('Error fetching my crop cycles:', error);
    res.status(500).json({ error: 'Failed to fetch crop cycles' });
  }
});

router.get('/', authenticateToken, readRoles, async (req, res) => {
  try {
    if (Object.keys(req.query).length === 0) {
      const cycles = req.user!.role === 'petani' ? await SiklusTanamRepository.findByUserId(req.user!.id) : await SiklusTanamRepository.findAll();
      return res.json(cycles);
    }
    const { queryOptions, values, where, base, select } = await buildSiklusList(req);
    const [rows] = await mysqlPool.execute(`SELECT ${select} ${base} ${where} ORDER BY ${queryOptions.sortBy} ${queryOptions.sortOrder} LIMIT ? OFFSET ?`, [...values, String(queryOptions.limit), String(queryOptions.offset)]);
    const [countRows] = await mysqlPool.execute(`SELECT COUNT(*) AS total ${base} ${where}`, values);
    return res.json({ data: rows, pagination: pagination(queryOptions.page, queryOptions.limit, Number((countRows as Array<{ total: number }>)[0]?.total || 0)) });
  } catch (error) {
    if (error instanceof ListValidationError) return res.status(400).json({ error: error.message });
    console.error('Error fetching crop cycles:', error);
    res.status(500).json({ error: 'Failed to fetch crop cycles' });
  }
});

router.get('/:id', authenticateToken, readRoles, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid crop cycle ID' });
    const cycle = req.user!.role === 'petani'
      ? await SiklusTanamRepository.findByIdForUser(id, req.user!.id)
      : await SiklusTanamRepository.findById(id);
    if (!cycle) return res.status(404).json({ error: 'Crop cycle not found' });
    res.json(cycle);
  } catch (error) {
    console.error('Error fetching crop cycle:', error);
    res.status(500).json({ error: 'Failed to fetch crop cycle' });
  }
});

router.post('/', authenticateToken, writeRoles, async (req, res) => {
  try {
    const input = parseInput(req.body as Record<string, unknown>);
    if (!input || !await validateReferences(input, req.user!.id, req.user!.role === 'admin')) {
      return res.status(400).json({ error: 'Invalid crop cycle data or references' });
    }
    const id = await SiklusTanamRepository.create(input);
    res.status(201).json(await SiklusTanamRepository.findById(id));
  } catch (error) {
    console.error('Error creating crop cycle:', error);
    res.status(500).json({ error: 'Failed to create crop cycle' });
  }
});

router.put('/:id', authenticateToken, writeRoles, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const input = parseInput(req.body as Record<string, unknown>);
    if (!id || !input) return res.status(400).json({ error: 'Invalid crop cycle data' });
    const current = req.user!.role === 'admin'
      ? await SiklusTanamRepository.findById(id)
      : await SiklusTanamRepository.findByIdForUser(id, req.user!.id);
    if (!current) return res.status(404).json({ error: 'Crop cycle not found' });
    if (!await validateReferences(input, req.user!.id, req.user!.role === 'admin')) {
      return res.status(400).json({ error: 'Invalid crop cycle references' });
    }
    if (!await SiklusTanamRepository.update(id, input)) return res.status(404).json({ error: 'Crop cycle not found' });
    res.json(await SiklusTanamRepository.findById(id));
  } catch (error) {
    console.error('Error updating crop cycle:', error);
    res.status(500).json({ error: 'Failed to update crop cycle' });
  }
});

router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id || !await SiklusTanamRepository.delete(id)) return res.status(404).json({ error: 'Crop cycle not found' });
    res.json({ message: 'Crop cycle deleted successfully' });
  } catch (error) {
    console.error('Error deleting crop cycle:', error);
    res.status(500).json({ error: 'Failed to delete crop cycle' });
  }
});

export default router;
