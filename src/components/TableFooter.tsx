// src/components/tables/TableFooter.tsx

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface TableFooterProps {
  total: number;        // total semua data
  filtered: number;     // data hasil filter
  perPage: number;      // jumlah per halaman (current)
  onPerPageChange: (value: number) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (value: number) => void;
}

export function TableFooter({
  total,
  filtered,
  perPage,
  onPerPageChange,
  page = 1,
  totalPages = 1,
  onPageChange,
}: TableFooterProps) {
  const start = filtered > 0 ? (page - 1) * perPage + 1 : 0;
  const end = filtered > 0 ? start + filtered - 1 : 0;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
      <div>
        Menampilkan {start} sampai {end} dari {total} hasil
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onPageChange && <>
          <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Sebelumnya</button>
          <span>Halaman {page} / {Math.max(totalPages, 1)}</span>
          <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Berikutnya</button>
        </>}
        <span>Per halaman</span>
        <Select
          value={String(perPage)}
          onValueChange={(val) => onPerPageChange(Number(val))}
        >
          <SelectTrigger aria-label="Jumlah baris per halaman" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
