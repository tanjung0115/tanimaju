import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { NotificationRepository } from '../../repositories/NotificationRepository.js';
import { parseListQuery } from '../../utils/listQuery.js';
const router = express.Router();
router.use(authenticateToken);
router.get('/unread-count', async (req,res) => {
  try { res.json({ unreadCount: await NotificationRepository.unreadCount(req.user!.id) }); }
  catch (error) { console.error('Unread count failed:',error); res.status(500).json({error:'Notifikasi belum dapat dimuat.'}); }
});
router.get('/', async (req,res) => {
  const options = parseListQuery(req,{scheduled_at:'scheduled_at'},'scheduled_at');
  if ('error' in options) return res.status(400).json({error:options.error});
  if (req.query.unread !== undefined && !['true','false'].includes(String(req.query.unread))) return res.status(400).json({error:'Invalid unread'});
  try { res.json(await NotificationRepository.list(req.user!.id, options, req.query.unread === 'true')); }
  catch (error) { console.error('Notification list failed:',error); res.status(500).json({error:'Notifikasi belum dapat dimuat.'}); }
});
router.put('/read-all', async (req,res) => {
  try { res.json({ updated:await NotificationRepository.markAllRead(req.user!.id), unreadCount:await NotificationRepository.unreadCount(req.user!.id) }); }
  catch (error) { console.error('Mark all notifications failed:',error); res.status(500).json({error:'Notifikasi belum dapat ditandai.'}); }
});
router.put('/:id/read', async (req,res) => {
  const id = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id <= 0) return res.status(400).json({error:'Invalid notification ID'});
  try {
    if (!await NotificationRepository.markRead(id,req.user!.id)) return res.status(404).json({error:'Notifikasi tidak ditemukan.'});
    res.json({success:true, unreadCount:await NotificationRepository.unreadCount(req.user!.id)});
  } catch (error) { console.error('Mark notification failed:',error); res.status(500).json({error:'Notifikasi belum dapat ditandai.'}); }
});
export default router;
