import { apiFetch, errorMessage } from "@/lib/api";
import { ActivityReminders } from "@/components/ActivityReminders";
import { ReportExport } from "@/components/ReportExport";
import { CycleList } from "@/components/CycleList";
import { ListFilters, EntitySelect, type FilterField } from "@/components/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { FormEvent, useEffect, useState, useCallback, useRef } from "react";
import { Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

type ActivityType = "penanaman" | "pemupukan" | "pengobatan" | "monitoring";

type Activity = {
  id: number;
  siklus_tanam_id: number;
  jenis_aktivitas: ActivityType;
  tanggal: string;
  nama_material: string | null;
  dosis: number | null;
  satuan: string | null;
  tujuan: string | null;
  kondisi: string | null;
  catatan: string | null;
  petani_nama?: string;
  nama_lahan?: string;
  tanaman_nama?: string;
};


const activityLabels: Record<ActivityType, string> = {
  penanaman: "Penanaman",
  pemupukan: "Pemupukan",
  pengobatan: "Pengobatan/Pestisida",
  monitoring: "Monitoring Kondisi",
};

const filterFields: FilterField[] = [{"key": "petani_id", "label": "Petani", "endpoint": "petani"}, {"key": "lahan_id", "label": "Lahan", "endpoint": "lahan"}, {"key": "tanaman_id", "label": "Tanaman", "endpoint": "tanaman"}, {"key": "siklus_tanam_id", "label": "Siklus", "endpoint": "siklus-tanam"}, {"key": "start_date", "label": "Aktivitas dari", "type": "date"}, {"key": "end_date", "label": "Aktivitas sampai", "type": "date"}, {"key": "sort_by", "label": "Urutkan", "options": ["tanggal", "jenis_aktivitas", "created_at"]}, {"key": "sort_order", "label": "Arah", "options": ["ASC", "DESC"]}];

export default function AktivitasPertanianPage() {
  const { role, isAdmin } = useAuth();
  const { filters, update, reset } = useListFilters("aktivitas");
  useEffect(() => { setPage(1); }, [filters]);
  const API_URL = import.meta.env.VITE_API_URL;
  const canWrite = role === "admin" || role === "petani";
  const [cycleRevision, setCycleRevision] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [cycleForm, setCycleForm] = useState({ lahan_id: "", tanaman_id: "", tanggal_tanam: "", perkiraan_tanggal_panen: "", catatan: "" });
  const [activityForm, setActivityForm] = useState({ siklus_tanam_id: "", jenis_aktivitas: "penanaman" as ActivityType, tanggal: "", nama_material: "", dosis: "", satuan: "", tujuan: "", kondisi: "", catatan: "" });
  const mutationLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const activityParams = new URLSearchParams({ page: String(page), limit: "20", sort_by: "tanggal", sort_order: "DESC" });
      Object.entries(filters).forEach(([key, value]) => activityParams.set(key, value));
      if (search) activityParams.set("search", search);
      if (typeFilter) activityParams.set("jenis_aktivitas", typeFilter);
      const activityEndpoint = `${API_URL}/aktivitas-pertanian?${activityParams.toString()}`;
      const activityResponse = await apiFetch(activityEndpoint, { credentials: "include", signal });
      if (!activityResponse.ok) throw new Error("Gagal memuat aktivitas");
      const activityResult = await activityResponse.json();
      if (signal?.aborted) return;
      setActivities((activityResult.data ?? activityResult) as Activity[]);
      setTotalPages(activityResult.pagination?.totalPages ?? 1);
      setError("");
    } catch (loadError) {
      if (signal?.aborted) return;
      console.error(loadError);
      setError(errorMessage(loadError, "Data aktivitas belum dapat dimuat."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [API_URL, page, search, typeFilter, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { loadData(controller.signal); }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadData]);


  const createCycle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current) return;
    mutationLock.current = true; setSaving(true);
    try {
      const response = await apiFetch(`${API_URL}/siklus-tanam`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cycleForm, lahan_id: Number(cycleForm.lahan_id), tanaman_id: Number(cycleForm.tanaman_id), perkiraan_tanggal_panen: cycleForm.perkiraan_tanggal_panen || null }),
      });
      if (!response.ok) { setError("Siklus tanam gagal dibuat."); return; }
      setCycleRevision(value => value + 1);
      setCycleForm({ lahan_id: "", tanaman_id: "", tanggal_tanam: "", perkiraan_tanggal_panen: "", catatan: "" });
      await loadData();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { mutationLock.current = false; setSaving(false); }
  };

  const createActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current) return;
    mutationLock.current = true; setSaving(true);
    try {
      const response = await apiFetch(`${API_URL}/aktivitas-pertanian`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...activityForm, dosis: activityForm.dosis ? Number(activityForm.dosis) : null, siklus_tanam_id: Number(activityForm.siklus_tanam_id) }),
      });
      if (!response.ok) { setError("Aktivitas gagal dicatat. Periksa tanggal dan siklus tanam."); return; }
      setActivityForm((current) => ({ ...current, tanggal: "", nama_material: "", dosis: "", satuan: "", tujuan: "", kondisi: "", catatan: "" }));
      await loadData();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { mutationLock.current = false; setSaving(false); }
  };

  const deleteActivity = async (id: number) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus aktivitas ini?")) return;
    if (mutationLock.current) return;
    mutationLock.current = true; setSaving(true);
    try {
      const response = await apiFetch(`${API_URL}/aktivitas-pertanian/${id}`, { method: "DELETE", credentials: "include" });
      if (response.ok) await loadData(); else setError("Aktivitas gagal dihapus.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { mutationLock.current = false; setSaving(false); }
  };
  return (
    <DashboardLayout>
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Aktivitas Pertanian</h1><p className="text-sm text-gray-500">Catat siklus tanam dan kegiatan lapangan tanpa menduplikasi data Panen.</p></div>
        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <ReportExport kind="aktivitas" filters={{ ...filters, search, ...(typeFilter ? { jenis_aktivitas: typeFilter } : {}), sort_by: filters.sort_by || "tanggal", sort_order: filters.sort_order || "DESC" }} />
        <ListFilters fields={filterFields} filters={filters} update={update} reset={() => { reset(); setSearch(""); setTypeFilter(""); setPage(1); }} />
        <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Cari material, tujuan, atau kondisi" className="rounded border px-3 py-2" placeholder="Cari material, tujuan, atau kondisi" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Filter jenis aktivitas" className="rounded border px-3 py-2" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="">Semua jenis aktivitas</option>{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

        {canWrite && <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={createCycle} className="space-y-3 rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Siklus Tanam Baru</h2>
            <EntitySelect required field={{ key: "lahan_id", label: "Lahan", endpoint: "lahan" }} value={cycleForm.lahan_id} onChange={value => setCycleForm({ ...cycleForm, lahan_id: value })} />
            <EntitySelect required field={{ key: "tanaman_id", label: "Tanaman", endpoint: "tanaman" }} value={cycleForm.tanaman_id} onChange={value => setCycleForm({ ...cycleForm, tanaman_id: value })} />
            <input aria-label="Tanggal tanam" className="w-full rounded border px-3 py-2" type="date" value={cycleForm.tanggal_tanam} onChange={(event) => setCycleForm({ ...cycleForm, tanggal_tanam: event.target.value })} required />
            <input className="w-full rounded border px-3 py-2" aria-label="Perkiraan tanggal panen" min={cycleForm.tanggal_tanam || undefined} type="date" value={cycleForm.perkiraan_tanggal_panen} onChange={(event) => setCycleForm({ ...cycleForm, perkiraan_tanggal_panen: event.target.value })} />
            <textarea aria-label="Catatan" className="w-full rounded border px-3 py-2" placeholder="Catatan" value={cycleForm.catatan} onChange={(event) => setCycleForm({ ...cycleForm, catatan: event.target.value })} />
            <Button type="submit" disabled={saving}>Simpan Siklus</Button>
          </form>

          <form onSubmit={createActivity} className="space-y-3 rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Catat Aktivitas</h2>
            <EntitySelect required field={{ key: "siklus_tanam_id", label: "Siklus Tanam", endpoint: "siklus-tanam" }} value={activityForm.siklus_tanam_id} onChange={value => setActivityForm({ ...activityForm, siklus_tanam_id: value })} />
            <select aria-label="Jenis aktivitas" className="w-full rounded border px-3 py-2" value={activityForm.jenis_aktivitas} onChange={(event) => setActivityForm({ ...activityForm, jenis_aktivitas: event.target.value as ActivityType })}>{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input className="w-full rounded border px-3 py-2" aria-label="Tanggal aktivitas" type="date" value={activityForm.tanggal} onChange={(event) => setActivityForm({ ...activityForm, tanggal: event.target.value })} required />
            {(activityForm.jenis_aktivitas === "pemupukan" || activityForm.jenis_aktivitas === "pengobatan") && <><input className="w-full rounded border px-3 py-2" aria-label="Nama material" placeholder={activityForm.jenis_aktivitas === "pemupukan" ? "Nama pupuk" : "Nama obat/pestisida"} value={activityForm.nama_material} onChange={(event) => setActivityForm({ ...activityForm, nama_material: event.target.value })} required /><div className="grid grid-cols-2 gap-2"><input aria-label="Dosis" className="rounded border px-3 py-2" type="number" min="0" step="0.01" placeholder="Dosis" value={activityForm.dosis} onChange={(event) => setActivityForm({ ...activityForm, dosis: event.target.value })} /><input aria-label="Satuan" className="rounded border px-3 py-2" placeholder="Satuan" value={activityForm.satuan} onChange={(event) => setActivityForm({ ...activityForm, satuan: event.target.value })} /></div></>}
            {activityForm.jenis_aktivitas === "pengobatan" && <input aria-label="Tujuan/keterangan" className="w-full rounded border px-3 py-2" placeholder="Tujuan/keterangan" value={activityForm.tujuan} onChange={(event) => setActivityForm({ ...activityForm, tujuan: event.target.value })} />}
            {activityForm.jenis_aktivitas === "monitoring" && <input aria-label="Kondisi lahan/tanaman" className="w-full rounded border px-3 py-2" placeholder="Kondisi lahan/tanaman" value={activityForm.kondisi} onChange={(event) => setActivityForm({ ...activityForm, kondisi: event.target.value })} required />}
            <textarea aria-label="Catatan" className="w-full rounded border px-3 py-2" placeholder="Catatan" value={activityForm.catatan} onChange={(event) => setActivityForm({ ...activityForm, catatan: event.target.value })} />
            <Button type="submit" disabled={saving}>Simpan Aktivitas</Button>
          </form>
        </div>}

        <ActivityReminders />
        <CycleList revision={cycleRevision} />

        <div tabIndex={0} role="region" aria-label="Tabel aktivitas" className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-[700px] text-left text-sm"><thead className="border-b bg-gray-50 text-gray-600"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Petani</th><th className="px-4 py-3">Lahan</th><th className="px-4 py-3">Tanaman</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Ringkasan</th>{isAdmin && <th className="px-4 py-3">Aksi</th>}</tr></thead><tbody>{loading ? <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-500">Memuat data...</td></tr> : activities.length === 0 ? <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-500">Tidak ada data yang sesuai dengan filter.</td></tr> : activities.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-4 py-3">{item.tanggal}</td><td className="px-4 py-3">{item.petani_nama || "-"}</td><td className="px-4 py-3">{item.nama_lahan || "-"}</td><td className="px-4 py-3">{item.tanaman_nama || "-"}</td><td className="px-4 py-3">{activityLabels[item.jenis_aktivitas]}</td><td className="px-4 py-3">{item.nama_material || item.kondisi || item.catatan || "-"}</td>{isAdmin && <td className="px-4 py-3"><Button disabled={saving} variant="destructive" size="sm" onClick={() => deleteActivity(item.id)}><Trash2 className="mr-1 h-4 w-4" />Hapus</Button></td>}</tr>)}</tbody></table>
        </div>
        <div className="flex items-center justify-end gap-2 text-sm"><button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>Halaman {page} / {Math.max(totalPages, 1)}</span><button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
      </div>
    </DashboardLayout>
  );
}
