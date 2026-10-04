import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { ActivityReminderRepository, type ActivityReminderInput, type ReminderStatus } from '../../repositories/ActivityReminderRepository.js';
import { SiklusTanamRepository } from '../../repositories/SiklusTanamRepository.js';
import { parseListQuery, validListDate } from '../../utils/listQuery.js';
import { jakartaTimestamp } from '../../services/reminderScheduler.js';
const router = express.Router();
router.use(authenticateToken, requireRole(['admin','petani','penyuluh']));
router.get('/', async (req,res) => {
  const query = parseListQuery(req,{tanggal_rencana:'tanggal_rencana'},'tanggal_rencana');
  if ('error' in query) return res.status(400).json({error:query.error});
  try { res.json(await ActivityReminderRepository.list(req.user!.role === 'petani' ? req.user!.id : null,query)); }
  catch(error) { console.error('Reminder list failed:',error);res.status(500).json({error:'Jadwal belum dapat dimuat.'}); }
});
router.post('/',requireRole(['admin','petani']), async (req,res) => {
  const body = (req.body ?? {}) as Record<string,unknown>;
  const id = Number(body.siklus_tanam_id);
  const date = body.tanggal_rencana;
  if (!['number','string'].includes(typeof body.siklus_tanam_id) || !Number.isSafeInteger(id) || id<=0 || typeof body.jenis_aktivitas !== 'string' || !['pemupukan','pengobatan'].includes(body.jenis_aktivitas) || typeof date !== 'string' || !validListDate(date) || date < jakartaTimestamp(new Date()).slice(0,10) || body.nama_material != null && (typeof body.nama_material !== 'string' || body.nama_material.length>255) || body.catatan != null && (typeof body.catatan !== 'string' || body.catatan.length>1000)) return res.status(400).json({error:'Isi jenis, siklus dan tanggal rencana yang valid (hari ini atau sesudahnya).'});
  try {
    const cycle = req.user!.role === 'admin' ? await SiklusTanamRepository.findById(id) : await SiklusTanamRepository.findByIdForUser(id,req.user!.id);
    if (!cycle) return res.status(404).json({error:'Siklus tidak ditemukan.'});
    const plantingDate = typeof cycle.tanggal_tanam === 'string' ? cycle.tanggal_tanam.slice(0,10) : jakartaTimestamp(new Date(cycle.tanggal_tanam)).slice(0,10);
    if (cycle.status !== 'aktif' || date < plantingDate) return res.status(400).json({error:'Jadwal harus berada pada siklus aktif dan sesudah tanggal tanam.'});
    const input: ActivityReminderInput = {siklus_tanam_id:id,jenis_aktivitas:body.jenis_aktivitas as ActivityReminderInput['jenis_aktivitas'],tanggal_rencana:date,nama_material:typeof body.nama_material==='string'?body.nama_material.trim():null,catatan:typeof body.catatan==='string'?body.catatan.trim():null};
    const reminderId=await ActivityReminderRepository.create(input,req.user!.id,req.user!.role === 'admin');
    if (!reminderId) return res.status(404).json({error:'Siklus tidak lagi tersedia dalam scope Anda.'});
    res.status(201).json({id:reminderId,...input,status:'terjadwal'});
  } catch(error) { console.error('Create reminder failed:',error);res.status(500).json({error:'Jadwal gagal disimpan.'}); }
});
router.put('/:id/status', requireRole(['admin','petani']), async (req,res) => {
  const id=Number(req.params.id);
  const status=req.body?.status as ReminderStatus;
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id<=0 || !['selesai','dibatalkan'].includes(status)) return res.status(400).json({error:'ID/status jadwal tidak valid.'});
  const owner = req.user!.role === 'admin' ? null : req.user!.id;
  try {
    const reminder=await ActivityReminderRepository.findForUser(id,owner);
    if (!reminder) return res.status(404).json({error:'Jadwal tidak ditemukan.'});
    if (reminder.status === status) return res.json({success:true});
    if (reminder.status !== 'terjadwal') return res.status(409).json({error:'Jadwal sudah ditutup. Buat jadwal baru bila diperlukan.'});
    if (!await ActivityReminderRepository.setStatus(id,owner,status)) return res.status(409).json({error:'Jadwal berubah. Muat ulang data.'});
    res.json({success:true});
  } catch(error) { console.error('Update reminder failed:',error);res.status(500).json({error:'Status jadwal gagal disimpan.'}); }
});
export default router;
