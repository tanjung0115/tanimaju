import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export type FilterField = { key: string; label: string; type?: "date"; options?: string[]; endpoint?: string };
export function EntitySelect({ field, value, onChange, required = false }: { required?: boolean; field: FilterField; value: string; onChange: (value: string) => void }) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: "1", limit: "20", search });
        const response = await apiFetch(`${import.meta.env.VITE_API_URL}/${field.endpoint}?${params}`, { credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error("Pilihan gagal dimuat");
        const result = await response.json();
        setOptions(result.data.map((row: Record<string, unknown>) => ({ id: String(row.id ?? row._id), label: String(row.tanaman_nama ? `${row.nama_lahan} / ${row.tanaman_nama} (#${row.id})` : row.nama ?? row.namaTanaman ?? row.nama_lahan) })));
        setError("");
      } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error, "Pilihan gagal dimuat")); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [field.endpoint, search]);
  return <div className="space-y-1"><input aria-label={`Cari ${field.label}`} placeholder={`Cari ${field.label}`} className="w-full rounded border px-2 py-2" value={search} onChange={event => setSearch(event.target.value)} /><select required={required} aria-label={field.label} className="w-full rounded border px-2 py-2" value={value} onChange={event => onChange(event.target.value)}><option value="">{required ? `Pilih ${field.label}` : "Semua"}</option>{value && !options.some(option => option.id === value) && <option value={value}>ID {value}</option>}{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>{error && <span role="alert" className="text-red-600">{error}</span>}</div>;
}
export function ListFilters({ fields, filters, update, reset }: { fields: FilterField[]; filters: Record<string, string>; update: (key: string, value: string) => void; reset: () => void }) {
  const { role } = useAuth();
  return <details className="my-3 w-full min-w-0 rounded-lg border bg-white p-3"><summary className="cursor-pointer font-medium">Filter & Urutan</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.filter(field => field.key !== "petani_id" || role !== "petani").map(field => <div key={field.key} className="space-y-1 text-sm"><span>{field.label}</span>{field.endpoint ? <EntitySelect field={field} value={filters[field.key] ?? ""} onChange={value => update(field.key, value)} /> : field.options ? <select aria-label={field.label} className="w-full rounded border px-2 py-2" value={filters[field.key] ?? ""} onChange={event => update(field.key, event.target.value)}><option value="">Default / Semua</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input aria-label={field.label} className="w-full rounded border px-2 py-2" type={field.type ?? "text"} value={filters[field.key] ?? ""} onChange={event => update(field.key, event.target.value)} />}</div>)}</div><button type="button" className="mt-3 rounded border px-3 py-2 text-sm" onClick={reset}>Reset filter</button></details>;
}
