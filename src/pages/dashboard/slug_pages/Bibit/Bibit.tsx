import { apiFetch, errorMessage } from "@/lib/api";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { SearchBar } from "@/components/SearchBarProps";
import { ActionButtons } from "@/components/ActionButton";
import { TableFooter } from "@/components/TableFooter";
import { BibitTable } from "./BibitTable";
import { Alert } from "@/components/Alert";
import { ConfirmAlert } from "@/components/ConfirmAlert";
import { useAuth } from "@/context/AuthContext";

interface BibitItem {
  id: string;
  tanaman: string;
  sumber: string;
  namaPenyedia: string;
  tanggalPemberian: string;
}

const filterFields: FilterField[] = [{"key": "tanaman", "label": "Nama tanaman"}, {"key": "nama_penyedia", "label": "Penyedia"}, {"key": "sumber", "label": "Sumber"}, {"key": "start_date", "label": "Pemberian dari", "type": "date"}, {"key": "end_date", "label": "Pemberian sampai", "type": "date"}, {"key": "sort_by", "label": "Urutkan", "options": ["tanggalPemberian", "id", "created_at"]}, {"key": "sort_order", "label": "Arah", "options": ["ASC", "DESC"]}];

export default function BibitPage() {
  const { isAdmin } = useAuth();
  const [bibitData, setBibitData] = useState<BibitItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { filters, update, reset } = useListFilters("bibit");
  useEffect(() => { setPage(1); }, [filters]);
  const API_URL = import.meta.env.VITE_API_URL;
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchBibitData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(perPage), sort_by: "id", sort_order: "DESC" });
      Object.entries(filters).forEach(([key, value]) => params.set(key, value));
      if (searchTerm) params.set("search", searchTerm);
      const res = await apiFetch(`${API_URL}/bibit?${params.toString()}`, { credentials: "include", signal });
      if (!res.ok) throw new Error("Gagal memuat data");
      const result = await res.json();
      if (signal?.aborted) return;
      setBibitData(result.data ?? result);
      setTotalResults(result.pagination?.total ?? result.length);
      setTotalPages(result.pagination?.totalPages ?? 1);
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Failed to load bibit Data:", err);
      setAlert({ variant: "error", title: "Gagal memuat data", message: errorMessage(err, "Data belum dapat dimuat. Silakan coba kembali.") });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [API_URL, page, perPage, searchTerm, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { fetchBibitData(controller.signal); }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fetchBibitData]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(bibitData.map((item) => item.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows((prev) => [...prev, id]);
    } else {
      setSelectedRows((prev) => prev.filter((rowId) => rowId !== id));
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmId(id); 
  };

  const confirmDelete = async () => {
    if (!confirmId) return;

    try {
      const res = await apiFetch(`${API_URL}/bibit/${confirmId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Gagal menghapus bibit");

      setAlert({
        variant: "success",
        title: "Berhasil",
        message: "Bibit berhasil dihapus!",
      });
      fetchBibitData();
    } catch (error) {
      setAlert({
        variant: "error",
        title: "Gagal",
        message: errorMessage(error, "Terjadi kesalahan saat menghapus bibit"),
      });
    } finally {
      setConfirmId(null); // tutup modal
    }
  };

  const filteredData = bibitData;

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-4 font-cascadia">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Bibit</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <ListFilters fields={filterFields} filters={filters} update={update} reset={() => { reset(); setSearchTerm(""); setPage(1); }} />
          <SearchBar value={searchTerm} onChange={(value) => { setSearchTerm(value); setPage(1); }} />
          <ActionButtons
            onRefresh={() => { fetchBibitData(); }}
            loading={loading}
            actions={isAdmin ? [
              {
                label: "Tambah Bibit",
                to: "/admin/bibit/create",
                className: "bg-green-600 hover:bg-green-700 text-white",
              },
            ] : []}
          />
        </div>

        {alert && (
          <div className="mb-4">
            <Alert
              variant={alert.variant}
              title={alert.title}
              duration={5000}
              onClose={() => setAlert(null)}
            >
              {alert.message}
            </Alert>
          </div>
        )}

        {confirmId && (
          <ConfirmAlert
            title="Konfirmasi Hapus"
            message="Yakin ingin menghapus bibit ini?"
            onConfirm={confirmDelete}
            onCancel={() => setConfirmId(null)}
          />
        )}

        <BibitTable
          data={filteredData}
          selectedRows={selectedRows}
          onSelectAll={handleSelectAll}
          onSelectRow={handleSelectRow}
          onDelete={handleDelete}
        />
        {!loading && bibitData.length === 0 && <p className="my-4 text-center text-gray-500">Tidak ada data yang sesuai dengan filter.</p>}
        <TableFooter
          total={totalResults}
          filtered={filteredData.length}
          perPage={perPage}
          onPerPageChange={(value) => { setPerPage(value); setPage(1); }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </DashboardLayout>
  );
}
