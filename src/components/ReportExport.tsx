import { apiFetch, errorMessage } from "@/lib/api";
import { useState, useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

type ReportKind = "panen" | "aktivitas" | "petani" | "tanaman" | "lahan";
export function ReportExport({ kind, filters = {} }: { kind: ReportKind; filters?: Record<string,string> }) {
  const { role } = useAuth();
  const [format, setFormat] = useState("xlsx");
  const lock = useRef(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  if (role !== "admin" && role !== "penyuluh" && role !== "petani") return null;
  const download = async () => {
    if (lock.current) return;
    lock.current = true; setLoading(true); setMessage(""); setFailed(false);
    try {
      const params = new URLSearchParams(filters);
      params.delete("page"); params.delete("limit"); params.set("format",format);
      const response = await apiFetch(`${import.meta.env.VITE_API_URL}/reports/${kind}/export?${params}`,{credentials:"include"});
      if (!response.ok) { const error = await response.json(); throw new Error(error.error ?? error.message ?? "Export gagal. Silakan coba kembali."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Filename never uses raw filter input; the server also supplies a sanitized filename.
      const start = /^\d{4}-\d{2}-\d{2}$/.test(filters.start_date ?? "") ? filters.start_date : "";
      const end = /^\d{4}-\d{2}-\d{2}$/.test(filters.end_date ?? "") ? filters.end_date : "";
      const date = new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Jakarta"}).format(new Date());
      link.download = `laporan-${kind}-${[start,end].filter(Boolean).join("_") || date}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url),1000);
      setMessage("Laporan berhasil diunduh sesuai seluruh hasil filter.");
    } catch (error) { setFailed(true); setMessage(errorMessage(error, "Export gagal.")); }
    finally { lock.current = false; setLoading(false); }
  };
  return <div className="my-3 space-y-2"><div className="flex flex-wrap items-center gap-2"><select aria-label="Format export" className="rounded border bg-white px-3 py-2 text-sm" value={format} disabled={loading} onChange={event=>setFormat(event.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select><Button type="button" variant="outline" disabled={loading} onClick={download}><Download className="mr-2 h-4 w-4" />{loading ? "Membuat laporan..." : "Export"}</Button><span className="text-xs text-gray-500">Seluruh hasil filter | Maks. 5.000 baris</span></div>{message && <p role={failed ? "alert" : "status"} className={`text-sm ${failed ? "text-red-700" : "text-green-700"}`}>{message}</p>}</div>;
}
