import { getDashboardRange, type Period } from "@/lib/dashboardPeriod";
import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";

type DashboardData = {
  linked: boolean;
  message?: string;
  profile: { nama: string; alamat?: string | null; nomorKontak?: string | null; foto?: string | null };
  summary: { total_lahan: number; lahan_produktif: number; siklus_aktif: number; panen_dalam_periode: number; panen_bulan_ini: number; panen_tahun_ini: number };
  lahan: Array<{ id: number; nama_lahan: string; luas: number; lokasi: string | null; status: string }>;
  activeCycles: Array<{ id: number; nama_lahan: string; tanaman: string; tanggal_tanam: string; perkiraan_tanggal_panen: string | null; status: string }>;
  recentActivities: Array<{ id: number; tanggal: string; jenis_aktivitas: string; nama_material: string | null; kondisi: string | null; catatan: string | null; nama_lahan: string; tanaman: string }>;
  recentHarvests: Array<{ id: number; tanggal: string; lahan: string; tanaman: string; jumlah: number | null; status_penjualan: string }>;
  harvestTrend: Array<{ periode: string; total: number }>;
  activityByType: Array<{ jenis_aktivitas: string; total: number }>;
  harvestByCrop: Array<{ tanaman: string; total: number }>;
};

const labels: Record<string, string> = { penanaman: "Penanaman", pemupukan: "Pemupukan", pengobatan: "Pengobatan", monitoring: "Monitoring" };

const Empty = () => <div className="flex h-full min-h-24 items-center justify-center text-sm text-stone-500">Belum ada data.</div>;

export default function PetaniDashboard() {
  const API_URL = import.meta.env.VITE_API_URL;
  const imageUrl = import.meta.env.VITE_API_URL_IMAGE || "";
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
        const response = await apiFetch(`${API_URL}/dashboard/petani?${params.toString()}`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Dashboard Petani gagal dimuat");
        const result = await response.json() as DashboardData;
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
      } catch (loadError) { if (controller.signal.aborted) return; console.error(loadError); setData(null); setError(errorMessage(loadError, "Dashboard Petani belum dapat dimuat.")); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void loadDashboard();
    return () => controller.abort();
  }, [API_URL, period, customStart, customEnd]);

  return <DashboardLayout><div className="space-y-6 px-4 py-5 sm:px-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold text-stone-900">Dashboard Saya</h1><p className="text-sm text-stone-500">Ringkasan lahan dan aktivitas pertanian pribadi.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Periode dashboard" className="rounded border px-3 py-2 text-sm" value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="month">Bulan Ini</option><option value="year">Tahun Ini</option><option value="30days">30 Hari Terakhir</option><option value="custom">Custom</option></select>{period === "custom" && <><input className="rounded border px-2 py-2 text-sm" aria-label="Tanggal awal dashboard" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /><input className="rounded border px-2 py-2 text-sm" aria-label="Tanggal akhir dashboard" min={customStart || undefined} type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></>}</div></div>
    {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded border bg-white p-8 text-center text-stone-500">Memuat dashboard...</div> : data && !data.linked ? <div className="rounded border bg-white p-8 text-center"><h2 className="font-semibold">Profil Petani belum terhubung</h2><p className="mt-2 text-sm text-stone-500">{data.message}</p></div> : data && <>
      <section className="flex flex-col gap-4 rounded border bg-white p-4 sm:flex-row sm:items-center"><div className="h-16 w-16 overflow-hidden rounded-full bg-emerald-100">{data.profile.foto && <img className="h-full w-full object-cover" src={`${imageUrl}${data.profile.foto}`} alt={data.profile.nama} />}</div><div><h2 className="text-lg font-semibold">{data.profile.nama}</h2><p className="text-sm text-stone-500">{data.profile.alamat || "Alamat belum diisi"} · {data.profile.nomorKontak || "Kontak belum diisi"}</p></div></section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Total Lahan", data.summary.total_lahan], ["Lahan Produktif", data.summary.lahan_produktif], ["Siklus Aktif", data.summary.siklus_aktif], ["Panen Bulan Ini", data.summary.panen_bulan_ini], ["Panen Tahun Ini", data.summary.panen_tahun_ini]].map(([label, value]) => <div key={label} className="rounded border bg-white p-4"><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><Panel title="Tren Kejadian Panen"><LineChartBox data={data.harvestTrend} /></Panel><Panel title="Aktivitas berdasarkan Jenis"><ActivityChart data={data.activityByType} /></Panel><Panel title="Kejadian Panen per Tanaman"><CropChart data={data.harvestByCrop} /></Panel><Panel title="Lahan Saya"><LahanList data={data.lahan} /></Panel><Panel title="Siklus Tanam Aktif"><CycleList data={data.activeCycles} /></Panel><Panel title="Aktivitas Terbaru"><ActivityList data={data.recentActivities} /></Panel><Panel title="Panen Terbaru"><HarvestList data={data.recentHarvests} /></Panel></div>
    </>}
  </div></DashboardLayout>;
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="min-w-0 rounded border bg-white p-4"><h2 className="mb-4 font-semibold">{title}</h2><div className="h-56 [&>div]:max-h-full">{children}</div></section>;
const LineChartBox = ({ data }: { data: DashboardData["harvestTrend"] }) => data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" /><XAxis dataKey="periode" /><YAxis allowDecimals={false} /><Tooltip /><Line dataKey="total" stroke="#15803d" strokeWidth={3} /></LineChart></ResponsiveContainer> : <Empty />;
const ActivityChart = ({ data }: { data: DashboardData["activityByType"] }) => data.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="total" nameKey="jenis_aktivitas" outerRadius={75} label>{data.map((item, index) => <Cell key={item.jenis_aktivitas} fill={["#15803d", "#f59e0b", "#0f766e", "#64748b"][index % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <Empty />;
const CropChart = ({ data }: { data: DashboardData["harvestByCrop"] }) => data.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 16, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="tanaman" width={100} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="total" fill="#15803d" /></BarChart></ResponsiveContainer> : <Empty />;
const LahanList = ({ data }: { data: DashboardData["lahan"] }) => data.length ? <div className="max-h-56 space-y-2 overflow-auto">{data.map((item) => <div key={item.id} className="flex justify-between border-b py-2 text-sm"><span><strong>{item.nama_lahan}</strong><br /><span className="text-stone-500">{item.lokasi || "Lokasi belum diisi"} · {item.luas} ha</span></span><span className="text-emerald-700">{item.status}</span></div>)}</div> : <Empty />;
const CycleList = ({ data }: { data: DashboardData["activeCycles"] }) => data.length ? <div className="max-h-56 space-y-2 overflow-auto">{data.map((item) => <div key={item.id} className="border-b py-2 text-sm"><strong>{item.tanaman}</strong> · {item.nama_lahan}<br /><span className="text-stone-500">Tanam {item.tanggal_tanam} · Estimasi panen {item.perkiraan_tanggal_panen || "-"}</span></div>)}</div> : <Empty />;
const ActivityList = ({ data }: { data: DashboardData["recentActivities"] }) => data.length ? <div className="max-h-56 space-y-2 overflow-auto">{data.map((item) => <div key={item.id} className="border-b py-2 text-sm"><strong>{labels[item.jenis_aktivitas] || item.jenis_aktivitas}</strong> · {item.nama_lahan} · {item.tanggal}<br /><span className="text-stone-500">{item.nama_material || item.kondisi || item.catatan || "-"}</span></div>)}</div> : <Empty />;
const HarvestList = ({ data }: { data: DashboardData["recentHarvests"] }) => data.length ? <div className="max-h-56 space-y-2 overflow-auto">{data.map((item) => <div key={item.id} className="flex justify-between border-b py-2 text-sm"><span><strong>{item.tanaman}</strong> · {item.lahan}<br /><span className="text-stone-500">{item.tanggal} · {item.jumlah ?? "-"}</span></span><span>{item.status_penjualan}</span></div>)}</div> : <Empty />;
