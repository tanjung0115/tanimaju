import express from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { readReport, ExportTooLargeError, type ReportKind } from '../../repositories/ReportRepository.js';
import { ListValidationError } from '../../repositories/listPlans.js';
import { createReportFile, reportFilename } from '../../utils/reportExport.js';

const router = express.Router();
router.use(authenticateToken, requireRole(['admin','penyuluh','petani']));
router.get('/:kind/export', async (req,res) => {
  const kind = req.params.kind;
  if (!['panen','aktivitas','petani','tanaman','lahan'].includes(kind)) return res.status(404).json({error:'Jenis laporan tidak tersedia.'});
  if (Object.keys(req.query).some(key => key.includes('[') || key.includes(']'))) return res.status(400).json({error:'Parameter filter harus berupa nilai tunggal.'});
  const format = req.query.format ?? 'xlsx';
  if (format !== 'xlsx' && format !== 'csv') return res.status(400).json({error:'Format harus xlsx atau csv.'});
  try {
    const rows = await readReport(req,kind as ReportKind);
    const start = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
    const end = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;
    const file = createReportFile(kind as ReportKind,rows,format,[start,end].filter(Boolean).join(' / ') || 'Semua periode');
    res.setHeader('Content-Type',format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="${reportFilename(kind as ReportKind,format,start,end)}"`);
    res.setHeader('Cache-Control','private, no-store');
    res.send(file);
  } catch (error) {
    if (error instanceof ListValidationError) return res.status(400).json({error:error.message});
    if (error instanceof ExportTooLargeError) return res.status(413).json({error:error.message});
    console.error('Report export failed:',error);
    res.status(500).json({error:'Laporan belum dapat dibuat. Silakan coba kembali.'});
  }
});
export default router;
