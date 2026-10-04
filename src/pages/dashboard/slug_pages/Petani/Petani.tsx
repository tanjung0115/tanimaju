import { apiFetch, errorMessage } from "@/lib/api";
import { ReportExport } from "@/components/ReportExport";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
// src/pages/dashboard/item/ItemPage.tsx

import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { SearchBar } from "@/components/SearchBarProps";
import { ActionButtons } from "@/components/ActionButton";
import PetaniTable from "./PetaniTable";
import { TableFooter } from "@/components/TableFooter";
import { Alert } from "@/components/Alert";
import { ConfirmAlert } from "@/components/ConfirmAlert";
import { useAuth } from "@/context/AuthContext";

interface PetaniItem {
  _id: string;
  nama: string;
  nomorKontak: string;
  foto: string;
  alamat?: string;
}

const filterFields: FilterField[] = [{"key": "sort_by", "label": "Urutkan", "options": ["nama", "created_at"]}, {"key": "sort_order", "label": "Arah", "options": ["ASC", "DESC"]}];

export default function PetaniPage() {
  const { isAdmin } = useAuth();
  const [petaniData, setPetaniData] = useState<PetaniItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const { filters, update, reset } = useListFilters("petani");
  useEffect(() => { setPage(1); }, [filters]);
  const API_URL = import.meta.env.VITE_API_URL;
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchPetaniData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(perPage), sort_by: "nama", sort_order: "ASC" });
      Object.entries(filters).forEach(([key, value]) => params.set(key, value));
      if (searchTerm) params.set("search", searchTerm);
      const res = await apiFetch(`${API_URL}/petani?${params.toString()}`, { credentials: "include", signal });
      if (!res.ok) throw new Error("Gagal memuat data");
      const result = await res.json();
      if (signal?.aborted) return;
      setPetaniData(result.data ?? result);
      setTotalResults(result.pagination?.total ?? result.length);
      setTotalPages(result.pagination?.totalPages ?? 1);
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Failed to load petani data:", err);
      setAlert({ variant: "error", title: "Gagal memuat data", message: errorMessage(err, "Data belum dapat dimuat. Silakan coba kembali.") });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [API_URL, page, perPage, searchTerm, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { fetchPetaniData(controller.signal); }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fetchPetaniData]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(petaniData.map((item) => item._id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (_id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows((prev) => [...prev, _id]);
    } else {
      setSelectedRows((prev) => prev.filter((rowId) => rowId !== _id));
    }
  };

  const filteredData = petaniData;

  const handleDelete = async (id: string) => {
    setConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!confirmId) return;

    try {
      const res = await apiFetch(`${API_URL}/petani/${confirmId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Gagal menghapus petani ");

      setAlert({
        variant: "success",
        title: "Berhasil",
        message: "Data Petani berhasil dihapus!",
      });
      fetchPetaniData();
    } catch (error) {
      setAlert({
        variant: "error",
        title: "Gagal",
        message: errorMessage(error, "Terjadi kesalahan saat menghapus data petani"),
      });
    } finally {
      setConfirmId(null); 
    }
  };

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Petani</h1>
        </div>

        <ReportExport kind="petani" filters={{ ...filters, search: searchTerm, sort_by: filters.sort_by || "nama", sort_order: filters.sort_order || "ASC" }} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <ListFilters fields={filterFields} filters={filters} update={update} reset={() => { reset(); setSearchTerm(""); setPage(1); }} />
          <SearchBar value={searchTerm} onChange={(value) => { setSearchTerm(value); setPage(1); }} />
          <ActionButtons
            onRefresh={() => { fetchPetaniData(); }}
            loading={loading}
            actions={isAdmin ? [
              {
                label: "Tambah Petani",
                to: "/admin/petani/create",
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
            message="Yakin ingin menghapus data petani ini?"
            onConfirm={confirmDelete}
            onCancel={() => setConfirmId(null)}
          />
        )}

        <PetaniTable
          petaniData={petaniData}
          filteredData={filteredData}
          selectedRows={selectedRows}
          handleSelectAll={handleSelectAll}
          handleSelectRow={handleSelectRow}
          onDelete={handleDelete}
        />

        {!loading && petaniData.length === 0 && <p className="my-4 text-center text-gray-500">Tidak ada data yang sesuai dengan filter.</p>}
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
