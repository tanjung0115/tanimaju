import { apiFetch, errorMessage } from "@/lib/api";
import { ReportExport } from "@/components/ReportExport";
import { ListFilters, EntitySelect, type FilterField } from "@/components/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { FormEvent, useEffect, useState, useCallback, useRef } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

type LahanStatus = "produktif" | "tidak produktif";

type Lahan = {
  id: number;
  petani_id: number;
  petani_nama?: string;
  nama_lahan: string;
  luas: number;
  lokasi: string | null;
  status: LahanStatus;
};


type LahanForm = {
  petani_id: string;
  nama_lahan: string;
  luas: string;
  lokasi: string;
  status: LahanStatus;
};

const emptyForm: LahanForm = {
  petani_id: "",
  nama_lahan: "",
  luas: "",
  lokasi: "",
  status: "produktif",
};

const filterFields: FilterField[] = [{"key": "petani_id", "label": "Petani", "endpoint": "petani"}, {"key": "lokasi", "label": "Lokasi"}, {"key": "sort_by", "label": "Urutkan", "options": ["nama_lahan", "luas", "status", "created_at"]}, {"key": "sort_order", "label": "Arah", "options": ["ASC", "DESC"]}];

export default function LahanPage() {
  const { isAdmin } = useAuth();
  const { filters, update, reset } = useListFilters("lahan");
  useEffect(() => { setPage(1); }, [filters]);
  const API_URL = import.meta.env.VITE_API_URL;
  const [lahan, setLahan] = useState<Lahan[]>([]);
  const [form, setForm] = useState<LahanForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const mutationLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadLahan = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", sort_by: "created_at", sort_order: "DESC" });
      Object.entries(filters).forEach(([key, value]) => params.set(key, value));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const endpoint = `${API_URL}/lahan?${params.toString()}`;
      const response = await apiFetch(endpoint, { credentials: "include", signal });
      if (!response.ok) throw new Error("Gagal memuat data lahan");
      const result = await response.json();
      if (signal?.aborted) return;
      setLahan(result.data ?? result);
      setTotalPages(result.pagination?.totalPages ?? 1);
      setError("");
    } catch (loadError) {
      if (signal?.aborted) return;
      console.error(loadError);
      setError(errorMessage(loadError, "Data lahan belum dapat dimuat."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [API_URL, page, search, statusFilter, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { loadLahan(controller.signal); }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadLahan]);


  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current) return;
    mutationLock.current = true; setSaving(true);
    try {
      const response = await apiFetch(`${API_URL}/lahan${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petani_id: Number(form.petani_id),
          nama_lahan: form.nama_lahan,
          luas: Number(form.luas),
          lokasi: form.lokasi,
          status: form.status,
        }),
      });
      if (!response.ok) throw new Error("Gagal menyimpan lahan");
      resetForm();
      await loadLahan();
    } catch (saveError) {
      console.error(saveError);
      setError(errorMessage(saveError, "Lahan gagal disimpan."));
    } finally {
      mutationLock.current = false; setSaving(false);
    }
  };

  const deleteLahan = async (id: number) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus lahan ini?")) return;
    if (mutationLock.current) return;
    mutationLock.current = true; setSaving(true);
    try {
      const response = await apiFetch(`${API_URL}/lahan/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) await loadLahan();
      else setError("Lahan gagal dihapus.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { mutationLock.current = false; setSaving(false); }
  };
  return (
    <DashboardLayout>
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lahan</h1>
          <p className="text-sm text-gray-500">Data lahan terhubung dengan profil Petani.</p>
        </div>

        {isAdmin && (
          <form onSubmit={submitForm} className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
            <EntitySelect required field={{ key: "petani_id", label: "Petani", endpoint: "petani" }} value={form.petani_id} onChange={value => setForm({ ...form, petani_id: value })} />
            <input aria-label="Nama lahan" className="rounded border px-3 py-2" placeholder="Nama lahan" value={form.nama_lahan} onChange={(event) => setForm({ ...form, nama_lahan: event.target.value })} required />
            <input aria-label="Luas (ha)" className="rounded border px-3 py-2" type="number" min="0" step="0.01" placeholder="Luas (ha)" value={form.luas} onChange={(event) => setForm({ ...form, luas: event.target.value })} required />
            <input aria-label="Lokasi" className="rounded border px-3 py-2" placeholder="Lokasi" value={form.lokasi} onChange={(event) => setForm({ ...form, lokasi: event.target.value })} />
            <select aria-label="Status lahan" className="rounded border px-3 py-2" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as LahanStatus })}>
              <option value="produktif">Produktif</option>
              <option value="tidak produktif">Tidak produktif</option>
            </select>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}><Plus className="mr-1 h-4 w-4" />{editingId ? "Simpan" : "Tambah"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={resetForm}>Batal</Button>}
            </div>
          </form>
        )}

        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <ReportExport kind="lahan" filters={{ ...filters, search, ...(statusFilter ? { status: statusFilter } : {}), sort_by: filters.sort_by || "created_at", sort_order: filters.sort_order || "DESC" }} />
        <ListFilters fields={filterFields} filters={filters} update={update} reset={() => { reset(); setSearch(""); setStatusFilter(""); setPage(1); }} />
        <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Cari nama atau lokasi lahan" className="rounded border px-3 py-2" placeholder="Cari nama atau lokasi lahan" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Status lahan" className="rounded border px-3 py-2" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Semua status</option><option value="produktif">Produktif</option><option value="tidak produktif">Tidak produktif</option></select></div>

        <div tabIndex={0} role="region" aria-label="Tabel lahan" className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-[700px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-600">
              <tr><th className="px-4 py-3">Nama Lahan</th><th className="px-4 py-3">Petani</th><th className="px-4 py-3">Luas (ha)</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3">Status</th>{isAdmin && <th className="px-4 py-3">Aksi</th>}</tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-500">Memuat data...</td></tr> : lahan.length === 0 ? <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-500">Tidak ada data yang sesuai dengan filter.</td></tr> : lahan.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{item.nama_lahan}</td><td className="px-4 py-3">{item.petani_nama || "-"}</td><td className="px-4 py-3">{item.luas}</td><td className="px-4 py-3">{item.lokasi || "-"}</td><td className="px-4 py-3">{item.status}</td>
                  {isAdmin && <td className="px-4 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setEditingId(item.id); setForm({ petani_id: String(item.petani_id), nama_lahan: item.nama_lahan, luas: String(item.luas), lokasi: item.lokasi || "", status: item.status }); }}><Pencil className="mr-1 h-4 w-4" />Edit</Button><Button disabled={saving} variant="destructive" size="sm" onClick={() => deleteLahan(item.id)}><Trash2 className="mr-1 h-4 w-4" />Hapus</Button></div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 text-sm"><button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>Halaman {page} / {Math.max(totalPages, 1)}</span><button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
      </div>
    </DashboardLayout>
  );
}
