import { apiFetch, errorMessage } from "@/lib/api";
import { ReportExport } from "@/components/ReportExport";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { SearchBar } from "@/components/SearchBarProps";
import { ActionButtons } from "@/components/ActionButton";
import { PanenTableHeader } from "./PanenTableHeader";
import { PanenTableRow } from "./PanenTableRow";
import { TableFooter } from "@/components/TableFooter";
import { Alert } from "@/components/Alert";
import { ConfirmAlert } from "@/components/ConfirmAlert";
import { useAuth } from "@/context/AuthContext";

interface HarvestItem {
  _id: string;
  date: string;
  farmer: string;
  field: string;
  seedProvider: string;
  plant: string;
  fertilizer: string;
  amount: number;
  salesStatus: string;
  buyerName: string;
}

interface HarvestApiItem {
  id: number | string;
  tanggalPanen?: string;
  petani_nama?: string;
  lahan?: string;
  lahan_nama?: string;
  bibit_nama_penyedia?: string;
  tanaman_nama?: string;
  pupuk?: string;
  jumlahHasilPanen?: number;
  statusPenjualan?: string;
  namaPembeli?: string;
}

const filterFields: FilterField[] = [{"key": "petani_id", "label": "Petani", "endpoint": "petani"}, {"key": "tanaman_id", "label": "Tanaman", "endpoint": "tanaman"}, {"key": "lahan_id", "label": "Lahan", "endpoint": "lahan"}, {"key": "status_penjualan", "label": "Status penjualan", "options": ["Belum Terjual", "Terjual"]}, {"key": "legacy_lahan", "label": "Lahan legacy"}, {"key": "start_date", "label": "Panen dari", "type": "date"}, {"key": "end_date", "label": "Panen sampai", "type": "date"}, {"key": "sort_by", "label": "Urutkan", "options": ["tanggal_panen", "jumlah_hasil", "id"]}, {"key": "sort_order", "label": "Arah", "options": ["ASC", "DESC"]}];

export default function PanenPage() {
  const { isAdmin } = useAuth();
  const [harvestData, setHarvestData] = useState<HarvestItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const { filters, update, reset } = useListFilters("panen");
  useEffect(() => { setPage(1); }, [filters]);
  const API_URL = import.meta.env.VITE_API_URL;
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const mapApiData = (item: HarvestApiItem): HarvestItem => ({
    _id: item.id.toString(),
    date: item.tanggalPanen || "-",
    farmer: item.petani_nama || "-",
    field: item.lahan_nama || item.lahan || "Default Field",
    seedProvider: item.bibit_nama_penyedia || "Default Provider",
    plant: item.tanaman_nama || "-",
    fertilizer: item.pupuk || "Default Fertilizer",
    amount: item.jumlahHasilPanen || 0,
    salesStatus: item.statusPenjualan || "-",
    buyerName: item.namaPembeli || "-",
  });

  const fetchHarvestData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(perPage), sort_by: "tanggal_panen", sort_order: "DESC" });
      Object.entries(filters).forEach(([key, value]) => params.set(key, value));
      if (searchTerm) params.set("search", searchTerm);
      const res = await apiFetch(`${API_URL}/panen?${params.toString()}`, { credentials: "include", signal });
      if (!res.ok) throw new Error("Gagal memuat data");
      const result = await res.json();
      if (signal?.aborted) return;
      const mapped = (result.data ?? result).map(mapApiData);
      setTotalResults(result.pagination?.total ?? mapped.length);
      setTotalPages(result.pagination?.totalPages ?? 1);


      setHarvestData(mapped);
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Failed to load data:", err);
      setAlert({ variant: "error", title: "Gagal memuat data", message: errorMessage(err, "Data belum dapat dimuat. Silakan coba kembali.") });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [API_URL, page, perPage, searchTerm, filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { fetchHarvestData(controller.signal); }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fetchHarvestData]);

  const toggleRow = (id: string, checked: boolean) =>
    setSelectedRows((prev) =>
      checked ? [...prev, id] : prev.filter((rowId) => rowId !== id)
    );

  const toggleAll = (checked: boolean) =>
    setSelectedRows(checked ? harvestData.map((i) => i._id) : []);

  const filteredData = harvestData;

  const handleDelete = async (id: string) => {
    setConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!confirmId) return;

    try {
      const res = await apiFetch(`${API_URL}/panen/${confirmId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Gagal menghapus panen ");

      setAlert({
        variant: "success",
        title: "Berhasil",
        message: "Data Panen berhasil dihapus!",
      });
      fetchHarvestData();
    } catch (error) {
      setAlert({
        variant: "error",
        title: "Gagal",
        message: errorMessage(error, "Terjadi kesalahan saat menghapus panen"),
      });
    } finally {
      setConfirmId(null); // tutup modal
    }
  };

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">Panen</h1>
        </div>

        <ReportExport kind="panen" filters={{ ...filters, search: searchTerm, sort_by: filters.sort_by || "tanggal_panen", sort_order: filters.sort_order || "DESC" }} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <ListFilters fields={filterFields} filters={filters} update={update} reset={() => { reset(); setSearchTerm(""); setPage(1); }} />
          <SearchBar value={searchTerm} onChange={(value) => { setSearchTerm(value); setPage(1); }} />

          <ActionButtons
            onRefresh={() => { fetchHarvestData(); }}
            loading={loading}
            actions={isAdmin ? [
              {
                label: "Tambah Panen",
                to: "/admin/panen/create",
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
            message="Yakin ingin menghapus data panen ini?"
            onConfirm={confirmDelete}
            onCancel={() => setConfirmId(null)}
          />
        )}

        {/* Table */}
        <div className="bg-white border rounded-lg shadow-sm mb-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <PanenTableHeader
                allSelected={selectedRows.length === harvestData.length}
                onToggleAll={toggleAll}
                totalRows={harvestData.length}
              />
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => (
                  <PanenTableRow
                    key={item._id}
                    item={item}
                    isSelected={selectedRows.includes(item._id)}
                    onToggle={toggleRow}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && harvestData.length === 0 && <p className="my-4 text-center text-gray-500">Tidak ada data yang sesuai dengan filter.</p>}
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
