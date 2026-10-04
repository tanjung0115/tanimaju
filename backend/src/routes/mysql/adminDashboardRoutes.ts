import express from 'express';
import { authenticateToken, requireAdmin } from '../../middleware/auth.js';
import { AdminDashboardRepository } from '../../repositories/AdminDashboardRepository.js';

const router = express.Router();

const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start_date: startDate, end_date: endDate } = req.query;
    if (startDate !== undefined && !isDate(startDate)) return res.status(400).json({ error: 'Invalid start_date' });
    if (endDate !== undefined && !isDate(endDate)) return res.status(400).json({ error: 'Invalid end_date' });
    if (startDate && endDate && startDate > endDate) return res.status(400).json({ error: 'start_date must not be after end_date' });

    const data = await AdminDashboardRepository.getDashboard({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch admin dashboard' });
  }
});

export default router;
