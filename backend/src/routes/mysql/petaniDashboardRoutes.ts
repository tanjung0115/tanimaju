import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { PetaniDashboardRepository } from '../../repositories/PetaniDashboardRepository.js';

const router = express.Router();

const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

router.get('/', authenticateToken, requireRole(['petani']), async (req, res) => {
  try {
    const { start_date: startDate, end_date: endDate } = req.query;
    if (startDate !== undefined && !isDate(startDate)) return res.status(400).json({ error: 'Invalid start_date' });
    if (endDate !== undefined && !isDate(endDate)) return res.status(400).json({ error: 'Invalid end_date' });
    if (startDate && endDate && startDate > endDate) return res.status(400).json({ error: 'start_date must not be after end_date' });

    const dashboard = await PetaniDashboardRepository.getDashboard(req.user!.id, { startDate: startDate as string | undefined, endDate: endDate as string | undefined });
    if (!dashboard) return res.json({ linked: false, message: 'Akun belum terhubung dengan profil Petani' });
    res.json({ linked: true, ...dashboard });
  } catch (error) {
    console.error('Error fetching petani dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch petani dashboard' });
  }
});

export default router;
