import { buildLahanList, ListValidationError } from '../../repositories/listPlans.js';
import express from 'express';
import mysqlPool from '../../config/mysql-database.js';
import { authenticateToken, requireAdmin, requireRole } from '../../middleware/auth.js';
import { LahanRepository, LahanStatus } from '../../repositories/LahanRepository.js';
import { PetaniRepository } from '../../repositories/PetaniRepository.js';
import { pagination } from '../../utils/listQuery.js';

const router = express.Router();
const readRoles = requireRole(['admin', 'petani', 'penyuluh']);

const parseId = (value: string): number | null => {
  const id = Number.parseInt(value, 10);
  return Number.isNaN(id) ? null : id;
};

const validateInput = (body: Record<string, unknown>): { petani_id: number; nama_lahan: string; luas: number; lokasi?: string | null; status?: LahanStatus } | null => {
  const petaniId = typeof body.petani_id === 'number' ? body.petani_id : Number.parseInt(String(body.petani_id), 10);
  const luas = typeof body.luas === 'number' ? body.luas : Number.parseFloat(String(body.luas));
  const namaLahan = typeof body.nama_lahan === 'string' ? body.nama_lahan.trim() : '';
  const status = body.status === 'tidak produktif' ? 'tidak produktif' : body.status === 'produktif' ? 'produktif' : undefined;

  if (!Number.isInteger(petaniId) || petaniId <= 0 || !namaLahan || !Number.isFinite(luas) || luas < 0 || body.status !== undefined && !status) {
    return null;
  }

  return { petani_id: petaniId, nama_lahan: namaLahan, luas, lokasi: typeof body.lokasi === 'string' ? body.lokasi.trim() : null, status };
};

router.get('/me', authenticateToken, requireRole(['petani']), async (req, res) => {
  try {
    const lahan = await LahanRepository.findByUserId(req.user!.id);
    res.json(lahan);
  } catch (error) {
    console.error('Error fetching my lahan:', error);
    res.status(500).json({ error: 'Failed to fetch lahan' });
  }
});

router.get('/', authenticateToken, readRoles, async (req, res) => {
  try {
    if (Object.keys(req.query).length === 0) {
      const lahan = req.user!.role === 'petani' ? await LahanRepository.findByUserId(req.user!.id) : await LahanRepository.findAll();
      return res.json(lahan);
    }
    const { queryOptions, values, where, base, select } = await buildLahanList(req);
    const [rows] = await mysqlPool.execute(`SELECT ${select} ${base} ${where} ORDER BY ${queryOptions.sortBy} ${queryOptions.sortOrder} LIMIT ? OFFSET ?`, [...values, String(queryOptions.limit), String(queryOptions.offset)]);
    const [countRows] = await mysqlPool.execute(`SELECT COUNT(*) AS total ${base} ${where}`, values);
    return res.json({ data: rows, pagination: pagination(queryOptions.page, queryOptions.limit, Number((countRows as Array<{ total: number }>)[0]?.total || 0)) });
  } catch (error) {
    if (error instanceof ListValidationError) return res.status(400).json({ error: error.message });
    console.error('Error fetching lahan:', error);
    res.status(500).json({ error: 'Failed to fetch lahan' });
  }
});

router.get('/:id', authenticateToken, readRoles, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid lahan ID' });

    const lahan = req.user!.role === 'petani'
      ? await LahanRepository.findByIdForUser(id, req.user!.id)
      : await LahanRepository.findById(id);
    if (!lahan) return res.status(404).json({ error: 'Lahan not found' });
    res.json(lahan);
  } catch (error) {
    console.error('Error fetching lahan:', error);
    res.status(500).json({ error: 'Failed to fetch lahan' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const input = validateInput(req.body as Record<string, unknown>);
    if (!input) return res.status(400).json({ error: 'Invalid lahan data' });
    if (!await PetaniRepository.findById(input.petani_id)) return res.status(404).json({ error: 'Petani not found' });

    const id = await LahanRepository.create(input);
    res.status(201).json(await LahanRepository.findById(id));
  } catch (error) {
    console.error('Error creating lahan:', error);
    res.status(500).json({ error: 'Failed to create lahan' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid lahan ID' });
    const input = validateInput(req.body as Record<string, unknown>);
    if (!input) return res.status(400).json({ error: 'Invalid lahan data' });
    if (!await PetaniRepository.findById(input.petani_id)) return res.status(404).json({ error: 'Petani not found' });
    if (!await LahanRepository.update(id, input)) return res.status(404).json({ error: 'Lahan not found' });
    res.json(await LahanRepository.findById(id));
  } catch (error) {
    console.error('Error updating lahan:', error);
    res.status(500).json({ error: 'Failed to update lahan' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid lahan ID' });
    if (!await LahanRepository.delete(id)) return res.status(404).json({ error: 'Lahan not found' });
    res.json({ message: 'Lahan deleted successfully' });
  } catch (error) {
    console.error('Error deleting lahan:', error);
    res.status(500).json({ error: 'Failed to delete lahan' });
  }
});

export default router;
