import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import { ListFilters, type FilterField } from "./ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
const fields: FilterField[] = [
  { key: "search", label: "Cari lahan atau tanaman" },
  { key: "petani_id", label: "Petani", endpoint: "petani" },
  { key: "lahan_id", label: "Lahan", endpoint: "lahan" },
  { key: "tanaman_id", label: "Tanaman", endpoint: "tanaman" },
  { key: "status_siklus", label: "Status", options: ["aktif", "selesai", "dibatalkan"] },
  { key: "start_date", label: "Tanam dari", type: "date" },
  { key: "end_date", label: "Tanam sampai", type: "date" },
  { key: "harvest_start_date", label: "Perkiraan panen dari", type: "date" },
  { key: "harvest_end_date", label: "Perkiraan panen sampai", type: "date" },
  { key: "sort_by", label: "Urutkan", options: ["tanggal_tanam", "perkiraan_tanggal_panen", "status", "created_at"] },
  { key: "sort_order", label: "Arah", options: ["ASC", "DESC"] },
];
type Cycle = { id: number; nama_lahan: string; tanaman_nama: string; petani_nama: string; tanggal_tanam: string; perkiraan_tanggal_panen: string | null; status: string };
export function CycleList({ revision }: { revision: number }) {
  const { filters, update, reset } = useListFilters("siklus");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Cycle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ ...filters, page: String(page), limit: "20" });
        const response = await apiFetch(`${import.meta.env.VITE_API_URL}/siklus-tanam?${params}`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Siklus belum dapat dimuat. Periksa filter atau coba kembali.");
        const result = await response.json();
        setData(result.data); setTotal(result.pagination.total); setTotalPages(result.pagination.totalPages); setError("");
      } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Gagal memuat siklus")); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filters, page, revision]);
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Siklus Tanam</h2><ListFilters fields={fields} filters={filters} update={update} reset={reset} />{error ? <p role="alert" className="text-red-700">{error}</p> : loading ? <p>Memuat data...</p> : !data.length ? <p>Tidak ada data yang sesuai dengan filter.</p> : <div tabIndex={0} role="region" aria-label="Tabel siklus tanam" className="overflow-x-auto rounded border"><table className="min-w-[700px] text-left text-sm"><thead><tr>{["Petani", "Lahan", "Tanaman", "Tanggal tanam", "Perkiraan panen", "Status"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{data.map(row => <tr className="border-t" key={row.id}><td className="p-3">{row.petani_nama}</td><td className="p-3">{row.nama_lahan}</td><td className="p-3">{row.tanaman_nama}</td><td className="p-3">{row.tanggal_tanam}</td><td className="p-3">{row.perkiraan_tanggal_panen ?? "-"}</td><td className="p-3">{row.status}</td></tr>)}</tbody></table></div>}<div className="flex items-center justify-end gap-3 text-sm"><span>{total} hasil | {page}/{Math.max(1, totalPages)}</span><button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><button type="button" disabled={loading || page >= totalPages} onClick={() => setPage(page + 1)}>Berikutnya</button></div></section>;
}
