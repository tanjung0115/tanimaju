import { getDashboardRange, type Period } from "@/lib/dashboardPeriod";
import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface DashboardData {
  summary: { total_petani: number; total_lahan: number; lahan_produktif: number; siklus_aktif: number; panen_dalam_periode: number; panen_bulan_ini: number; panen_tahun_ini: number };
  harvestTrend: Array<{ periode: string; total: number }>;
  harvestByCrop: Array<{ tanaman: string; total: number }>;
  topFarmers: Array<{ petani: string; total: number }>;
  landStatus: Array<{ status: string; total: number }>;
  cropCycles: Array<{ status: string; total: number }>;
  recentActivities: Array<{ id: number; tanggal: string; jenis_aktivitas: string; nama_material: string | null; kondisi: string | null; catatan: string | null; petani: string; nama_lahan: string; tanaman: string }>;
  recentHarvests: Array<{ id: number; tanggal: string; petani: string | null; lahan: string; tanaman: string; jumlah: number | null; status_penjualan: string }>;
  fertilizerStats: Array<{ material: string; total: number }>;
  treatmentStats: Array<{ material: string; total: number }>;
}

const colors = ["#15803d", "#f59e0b", "#64748b", "#0f766e"];

const ChartEmpty = () => <div className="flex h-full min-h-40 items-center justify-center text-sm text-stone-500">Belum ada data pada periode ini.</div>;

export const Dashboard = () => {
  const API_URL = import.meta.env.VITE_API_URL;
  const [period, setPeriod] = useState<Period>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadDashboard = async () => {
      const range = getDashboardRange(period, customStart, customEnd);
      if (period === "custom" && (!range.start || !range.end || range.start > range.end)) { setError("Isi tanggal awal dan akhir dengan urutan yang benar."); setData(null); setLoading(false); return; }
      setLoading(true);
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end });
        const response = await apiFetch(`${API_URL}/dashboard/admin?${params.toString()}`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Dashboard gagal dimuat");
        const result = await response.json() as DashboardData;
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
      } catch (loadError) { if (controller.signal.aborted) return; console.error(loadError); setData(null); setError(errorMessage(loadError, "Data dashboard belum dapat dimuat.")); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void loadDashboard();
    return () => controller.abort();
  }, [API_URL, period, customStart, customEnd]);

  const summary = data?.summary;
  const cards = [["Total Petani", summary?.total_petani ?? 0], ["Total Lahan", summary?.total_lahan ?? 0], ["Lahan Produktif", summary?.lahan_produktif ?? 0], ["Siklus Tanam Aktif", summary?.siklus_aktif ?? 0], ["Panen Bulan Ini", summary?.panen_bulan_ini ?? 0], ["Panen Tahun Ini", summary?.panen_tahun_ini ?? 0]];

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold text-stone-900">Dashboard Pertanian</h1><p className="text-sm text-stone-500">Ringkasan operasional TaniMaju dari data database.</p></div>
      <div className="flex flex-wrap items-center gap-2"><select aria-label="Periode dashboard" className="rounded border border-stone-300 bg-white px-3 py-2 text-sm" value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="month">Bulan Ini</option><option value="year">Tahun Ini</option><option value="30days">30 Hari Terakhir</option><option value="custom">Custom</option></select>{period === "custom" && <><input className="rounded border border-stone-300 px-2 py-2 text-sm" aria-label="Tanggal awal dashboard" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><input className="rounded border border-stone-300 px-2 py-2 text-sm" aria-label="Tanggal akhir dashboard" min={customStart || undefined} type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></>}</div>
    </div>
    {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded border bg-white p-8 text-center text-stone-500">Memuat dashboard...</div> : data && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <div key={label} className="rounded border border-stone-200 bg-white p-4"><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p></div>)}</div>
      <div className="grid gap-6 lg:grid-cols-3"><Panel title="Kejadian Panen per Bulan" className="lg:col-span-2"><SimpleLine data={data.harvestTrend} /></Panel><Panel title="Status Lahan"><SimplePie data={data.landStatus} /></Panel></div>
      <div className="grid gap-6 lg:grid-cols-2"><Panel title="Panen per Tanaman"><SimpleBars data={data.harvestByCrop} category="tanaman" /></Panel><Panel title="Top 10 Petani berdasarkan Panen"><SimpleBars data={data.topFarmers} category="petani" /></Panel><Panel title="Status Siklus Tanam"><SimpleBars data={data.cropCycles} category="status" /></Panel><Panel title="Pupuk yang Paling Sering Digunakan"><StatList data={data.fertilizerStats} /></Panel><Panel title="Pengobatan/Pestisida Terbanyak"><StatList data={data.treatmentStats} /></Panel></div>
      <div className="grid gap-6 xl:grid-cols-2"><RecentActivities data={data.recentActivities} /><RecentHarvests data={data.recentHarvests} /></div>
    </>}
  </div>;
};

const Panel = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => <section className={`rounded border border-stone-200 bg-white p-4 ${className}`}><h2 className="mb-4 font-semibold text-stone-900">{title}</h2><div className="h-64">{children}</div></section>;
const SimpleLine = ({ data }: { data: DashboardData["harvestTrend"] }) => data.length === 0 ? <ChartEmpty /> : <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" /><XAxis dataKey="periode" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="total" stroke="#15803d" strokeWidth={3} name="Kejadian panen" /></LineChart></ResponsiveContainer>;
const SimpleBars = ({ data, category }: { data: Array<Record<string, string | number>>; category: string }) => data.length === 0 ? <ChartEmpty /> : <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 16, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey={category} width={100} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="total" fill="#15803d" name="Total" /></BarChart></ResponsiveContainer>;
const SimplePie = ({ data }: { data: Array<{ status: string; total: number }> }) => data.length === 0 ? <ChartEmpty /> : <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="total" nameKey="status" cx="50%" cy="50%" outerRadius={80} label>{data.map((item, index) => <Cell key={item.status} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>;
const StatList = ({ data }: { data: Array<{ material: string; total: number }> }) => data.length === 0 ? <ChartEmpty /> : <div className="space-y-2 overflow-y-auto">{data.map((item) => <div key={item.material} className="flex items-center justify-between border-b border-stone-100 py-2 text-sm"><span>{item.material}</span><strong>{item.total}</strong></div>)}</div>;
const RecentActivities = ({ data }: { data: DashboardData["recentActivities"] }) => <Panel title="Aktivitas Pertanian Terbaru"><div className="h-full overflow-auto">{data.length === 0 ? <ChartEmpty /> : <div className="space-y-3">{data.map((item) => <div key={item.id} className="border-b border-stone-100 pb-2 text-sm"><div className="flex justify-between gap-3"><strong>{item.jenis_aktivitas}</strong><span className="text-stone-500">{item.tanggal}</span></div><p>{item.petani} · {item.nama_lahan} · {item.tanaman}</p><p className="text-stone-500">{item.nama_material || item.kondisi || item.catatan || "-"}</p></div>)}</div>}</div></Panel>;
const RecentHarvests = ({ data }: { data: DashboardData["recentHarvests"] }) => <Panel title="Panen Terbaru"><div className="h-full overflow-auto">{data.length === 0 ? <ChartEmpty /> : <table className="min-w-full text-left text-sm"><thead><tr className="border-b text-stone-500"><th className="py-2">Tanggal</th><th className="py-2">Petani/Lahan</th><th className="py-2">Tanaman</th><th className="py-2">Status</th></tr></thead><tbody>{data.map((item) => <tr key={item.id} className="border-b border-stone-100"><td className="py-2">{item.tanggal || "-"}</td><td className="py-2">{item.petani || "-"}<br /><span className="text-xs text-stone-500">{item.lahan}</span></td><td className="py-2">{item.tanaman}</td><td className="py-2">{item.status_penjualan}</td></tr>)}</tbody></table>}</div></Panel>;
