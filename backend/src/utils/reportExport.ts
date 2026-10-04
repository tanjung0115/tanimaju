import * as XLSX from 'xlsx';
import type { ReportKind, ReportRow } from '../repositories/ReportRepository.js';
import { ExportTooLargeError } from '../repositories/ReportRepository.js';

type Column = { label: string; key: string; numeric?: boolean; date?: boolean; fallback?: string };
const columns: Record<ReportKind, Column[]> = {
  panen: [{label:'Tanggal Panen',key:'tanggalPanen',date:true},{label:'Petani',key:'petani_nama'},{label:'Lahan',key:'lahan_nama',fallback:'lahan'},{label:'Tanaman',key:'tanaman_nama'},{label:'Jumlah Hasil Panen',key:'jumlahHasilPanen',numeric:true},{label:'Status Penjualan',key:'statusPenjualan'},{label:'Nama Pembeli',key:'namaPembeli'}],
  aktivitas: [{label:'Tanggal',key:'tanggal',date:true},{label:'Petani',key:'petani_nama'},{label:'Lahan',key:'nama_lahan'},{label:'Tanaman',key:'tanaman_nama'},{label:'Siklus Tanam (ID)',key:'siklus_tanam_id',numeric:true},{label:'Jenis Aktivitas',key:'jenis_aktivitas'},{label:'Material',key:'nama_material'},{label:'Dosis',key:'dosis',numeric:true},{label:'Satuan',key:'satuan'},{label:'Kondisi',key:'kondisi'},{label:'Catatan',key:'catatan'}],
  petani: [{label:'Petani',key:'nama'},{label:'Lahan',key:'lahan_nama_list'},{label:'Jumlah Lahan',key:'jumlah_lahan',numeric:true},{label:'Kejadian Panen',key:'jumlah_panen',numeric:true},{label:'Jumlah Siklus Tanam',key:'jumlah_siklus',numeric:true},{label:'Jumlah Aktivitas Pertanian',key:'jumlah_aktivitas',numeric:true}],
  tanaman: [{label:'Tanaman',key:'namaTanaman'},{label:'Jumlah Siklus Tanam',key:'jumlah_siklus',numeric:true},{label:'Kejadian Panen',key:'jumlah_panen',numeric:true},{label:'Petani yang Menanam',key:'jumlah_petani',numeric:true}],
  lahan: [{label:'Petani',key:'petani_nama'},{label:'Lahan',key:'nama_lahan'},{label:'Lokasi',key:'lokasi'},{label:'Luas (ha)',key:'luas',numeric:true},{label:'Status',key:'status'},{label:'Jumlah Siklus Tanam',key:'jumlah_siklus',numeric:true},{label:'Kejadian Panen',key:'jumlah_panen',numeric:true}],
};
export function reportDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
  return String(value).slice(0,10);
}
function valueFor(row: ReportRow, column: Column): string | number {
  const raw = row[column.key] ?? (column.fallback ? row[column.fallback] : undefined);
  if (raw === null || raw === undefined || raw === '') return '';
  if (column.numeric) { const number = Number(raw); return Number.isFinite(number) ? number : ''; }
  if (column.date) return reportDate(raw);
  if (typeof raw === 'string' && raw.length > 32767) throw new ExportTooLargeError('Teks dalam laporan terlalu panjang. Persempit filter atau periksa catatan.');
  const normalized = column.key === 'lahan_nama_list' && typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
  const value = Array.isArray(normalized) ? normalized.map(String).join('; ') : String(normalized);
  if (value.length > 32767) throw new ExportTooLargeError('Teks dalam laporan terlalu panjang untuk Excel. Persempit filter atau periksa catatan.');
  return value;
}
export function csvCell(value: string | number): string {
  // Text remains literal when opened in spreadsheet applications (formula injection prevention).
  const text = typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
export function createReportFile(kind: ReportKind, rows: ReportRow[], format: 'xlsx' | 'csv', period: string) {
  const header = columns[kind].map(column => column.label);
  let bytes = 0;
  const data = rows.map(row => {
    const values = columns[kind].map(column => valueFor(row,column));
    bytes += Buffer.byteLength(JSON.stringify(values), 'utf8');
    if (bytes > 20 * 1024 * 1024) throw new ExportTooLargeError('Ukuran laporan melebihi 20 MB. Persempit filter.');
    return values;
  });
  const matrix = [header, ...data];
  if (format === 'csv') return Buffer.from('\uFEFF' + matrix.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet['!cols'] = header.map(label => ({wch:Math.min(32,Math.max(18,label.length+2))}));
  XLSX.utils.book_append_sheet(workbook,sheet,'Laporan');
  const metadata = XLSX.utils.aoa_to_sheet([['Jenis Laporan',kind],['Periode',period],['Tanggal Export (Asia/Jakarta)',new Date().toLocaleString('sv-SE',{timeZone:'Asia/Jakarta'})],['Jumlah Baris',rows.length],['Keterangan','Jumlah hasil panen tidak dijumlahkan lintas satuan. Ringkasan memakai count kejadian.']]);
  metadata['!cols'] = [{wch:32},{wch:90}];
  XLSX.utils.book_append_sheet(workbook,metadata,'Informasi');
  return XLSX.write(workbook,{type:'buffer',bookType:'xlsx',compression:true}) as Buffer;
}
export function reportFilename(kind: ReportKind, format: 'xlsx' | 'csv', start?: string, end?: string) {
  const safeDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  const range = [safeDate(start),safeDate(end)].filter(Boolean).join('_') || reportDate(new Date());
  return `laporan-${kind}-${range}.${format}`;
}
