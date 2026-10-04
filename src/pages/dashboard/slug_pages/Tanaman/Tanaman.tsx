import { apiFetch, errorMessage } from "@/lib/api";
import { ReportExport } from "@/components/ReportExport";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
// src/pages/dashboard/tanaman/TanamanPage.tsx

import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { SearchBar } from "@/components/SearchBarProps";
import { ActionButtons } from "@/components/ActionButton";
import { TanamanTable } from "./TanamanTable";
import { TableFooter } from "@/components/TableFooter";
import { Alert } from "@/components/Alert";
import { ConfirmAlert } from "@/components/ConfirmAlert";
import { useAuth } from "@/context/AuthContext";

interface TanamanItem {
  id: string;
  namaTanaman: string;
  pupuk: string;
}

const filterFields: FilterField[] = [{"key": "pupuk", "label": "Pupuk"}, {"key": "sort_by", "label": "Urutkan", "options": ["namaTanaman", "id", "created_at"]}, {"key": "sort_order", "label": "Arah", "options": ["ASC", "DESC"]}];

export default function TanamanPage() {
  const { isAdmin } = useAuth();
  const [tanamanData, setTanamanData] = useState<TanamanItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const { filters, update, reset } = useListFilters("tanaman");
  useEffect(() => { setPage(1); }, [filters]);
  const API_URL = import.meta.env.VITE_API_URL;
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fetchTanamanData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(perPage), sort_by: "namaTanaman", sort_order: "ASC" });
      Object.entries(filters).forEach(([key, value]) => params.set(key, value));
      if (searchTerm) params.set("search", searchTerm);
      const res = await apiFetch(`${API_URL}/tanaman?${params.toString()}`, { credentials: "include", signal });
      if (!res.ok) throw new Error("Gagal memuat data");
      const result = await res.json();
      if (signal?.aborted) return;
      setTanamanData(result.data ?? result);
      setTotalResults(result.pagination?.total ?? result.length);
      setTotalPages(result.pagination?.totalPages ?? 1);
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Failed to load tanaman data:", err);
      setAlert({ variant: "error", title: "Gagal memuat data", message: errorMessage(err, "Data belum dapat dimuat. Silakan coba kembali.") });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [API_URL, page, perPage, searchTerm, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { fetchTanamanData(controller.signal); }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fetchTanamanData]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(tanamanData.map((item) => item.id));
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

  const filteredData = tanamanData;

  const handleDelete = async (id: string) => {
    setConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!confirmId) return;

    try {
      const res = await apiFetch(`${API_URL}/tanaman/${confirmId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Gagal menghapus tanaman");

      setAlert({
        variant: "success",
        title: "Berhasil",
        message: "Data Tanaman berhasil dihapus!",
      });
      fetchTanamanData();
    } catch (error) {
      setAlert({
        variant: "error",
        title: "Gagal",
        message: errorMessage(error, "Terjadi kesalahan saat menghapus data tanaman"),
      });
    } finally {
      setConfirmId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Tanaman</h1>
        </div>

        <ReportExport kind="tanaman" filters={{ ...filters, search: searchTerm, sort_by: filters.sort_by || "namaTanaman", sort_order: filters.sort_order || "ASC" }} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <ListFilters fields={filterFields} filters={filters} update={update} reset={() => { reset(); setSearchTerm(""); setPage(1); }} />
          <SearchBar value={searchTerm} onChange={(value) => { setSearchTerm(value); setPage(1); }} />
          <ActionButtons
            onRefresh={() => { fetchTanamanData(); }}
            loading={loading}
            actions={isAdmin ? [
              {
                label: "Tambah Tanaman",
                to: "/admin/tanaman/create",
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
            message="Yakin ingin menghapus data tanaman ini?"
            onConfirm={confirmDelete}
            onCancel={() => setConfirmId(null)}
          />
        )}

        <TanamanTable
          data={filteredData}
          selectedRows={selectedRows}
          onSelectAll={handleSelectAll}
          onSelectRow={handleSelectRow}
          onDelete={handleDelete}
        />

        {!loading && tanamanData.length === 0 && <p className="my-4 text-center text-gray-500">Tidak ada data yang sesuai dengan filter.</p>}
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
