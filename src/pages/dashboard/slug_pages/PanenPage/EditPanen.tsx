type PetaniOption = { id?: number; _id?: string; nama: string };
type BibitOption = { id?: number; _id?: string; namaPenyedia: string };
type TanamanOption = { id?: number; _id?: string; namaTanaman: string };
import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Breadcrumb } from "@/components/Breadcrumb";
import { InputField } from "@/components/InputField";
import { SelectField } from "@/components/SelectField";
import { FormActions } from "@/components/FormActions";
import { LoadingScreen } from "@/components/LoadingSpinner";
import { useNotificationContext } from "@/context/NotificationContext";

interface HarvestItem {
  _id: string;
  date: string;
  farmer: string;
  field: string;
  lahanId: number | null;
  siklusTanamId: number | null;
  seedProvider: string;
  plant: string;
  fertilizer: string;
  amount: number;
  salesStatus: string;
  buyerName: string;
}

export default function EditPanenPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<HarvestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const API = import.meta.env.VITE_API_URL;
  const [petaniList, setPetaniList] = useState<PetaniOption[]>([]);
  const [bibitList, setBibitList] = useState<BibitOption[]>([]);
  const [tanamanList, setTanamanList] = useState<TanamanOption[]>([]);
  const { addNotification } = useNotificationContext();
  const mapApiData = (item: { id: number; tanggalPanen: string; petani_id?: number; petani_nama?: string; lahan: string; lahan_id?: number | null; siklus_tanam_id?: number | null; bibit_id?: number; bibit_nama_penyedia?: string; tanaman_id?: number; tanaman_nama?: string; pupuk: string; jumlahHasilPanen?: number; statusPenjualan: string; namaPembeli?: string }): HarvestItem => ({
    _id: item.id.toString(),
    date: item.tanggalPanen,
    farmer: item.petani_id ? item.petani_id.toString() : (item.petani_nama || ""),
    field: item.lahan,
    lahanId: item.lahan_id ?? null,
    siklusTanamId: item.siklus_tanam_id ?? null,
    seedProvider: item.bibit_id ? item.bibit_id.toString() : (item.bibit_nama_penyedia || ""),
    plant: item.tanaman_id ? item.tanaman_id.toString() : (item.tanaman_nama || ""),
    fertilizer: item.pupuk,
    amount: item.jumlahHasilPanen ?? 0,
    salesStatus: item.statusPenjualan,
    buyerName: item.namaPembeli ?? "",
  });

  // fetch data panen by id
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`${API}/panen/${id}`)
      .then((res) => res.json())
      .then((json) => setData(mapApiData(json)))
      .catch((err) => { console.error("Failed to fetch panen data:", err); setLoadError(errorMessage(err, "Data belum dapat dimuat.")); })
      .finally(() => setLoading(false));
  }, [id, API]);

  // fetch list petani, bibit, tanaman
  useEffect(() => {
    apiFetch(`${API}/petani`)
      .then((res) => res.json())
      .then(json => setPetaniList(Array.isArray(json) ? json : json.data ?? []))
      .catch(cause => setLoadError(errorMessage(cause, "Pilihan belum dapat dimuat.")));
    apiFetch(`${API}/bibit`)
      .then((res) => res.json())
      .then(json => setBibitList(Array.isArray(json) ? json : json.data ?? []))
      .catch(cause => setLoadError(errorMessage(cause, "Pilihan belum dapat dimuat.")));
    apiFetch(`${API}/tanaman`)
      .then((res) => res.json())
      .then(json => setTanamanList(Array.isArray(json) ? json : json.data ?? []))
      .catch(cause => setLoadError(errorMessage(cause, "Pilihan belum dapat dimuat.")));
  }, [API]);

  const handleChange = (field: keyof HarvestItem, value: string | number) => {
    if (!data) return;
    setData({ ...data, [field]: value });
  };

  const handleSubmit = async () => {
    if (!data) return;
    try {
      // Format tanggal ke YYYY-MM-DD
      const formattedDate = data.date?.slice(0, 10) || "";

      const payload = {
        tanggalPanen: formattedDate,
        petani: data.farmer,
        lahan: data.field,
        lahanId: data.lahanId,
        siklusTanamId: data.siklusTanamId,
        bibit: data.seedProvider, // This will now be ID or name, backend handles both
        tanaman: data.plant,
        pupuk: data.fertilizer,
        jumlahHasilPanen: Number(data.amount),
        statusPenjualan: data.salesStatus,
        namaPembeli: data.buyerName,
      };


      const res = await apiFetch(`${API}/panen/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Gagal update panen");

      addNotification({
        variant: "success",
        title: "Berhasil!",
        message: "Data panen berhasil diperbarui!",
        duration: 4000,
      });
      navigate("/admin/panen");
    } catch (err) {
      console.error(err);
      addNotification({
        variant: "error",
        title: "Gagal!",
        message: errorMessage(err, "Terjadi kesalahan saat update data panen!"),
        duration: 4000,
      });
    }
  };

  if (loadError || (!loading && !data)) return <DashboardLayout><div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-700">{loadError || "Data tidak ditemukan."}<button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>Coba kembali</button></div></DashboardLayout>;

  if (loading || !data) {
    return (
      <DashboardLayout>
        <LoadingScreen />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Breadcrumb
        items={[{ label: "Panen", to: "/admin/panen" }, { label: "Edit" }]}
      />

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Edit Hasil Panen</h1>
      </div>

      {/* Form */}
      <form onSubmit={event => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>("[data-form-submit]")?.click(); }} className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Kolom Kiri */}
          <div className="space-y-6">
            <InputField
              id="date"
              label="Tanggal Panen"
              type="date"
              value={data.date?.slice(0, 10) || ""}
              onChange={(v) => handleChange("date", v)}
            />

            <SelectField
              id="farmer"
              label="Petani"
              value={data.farmer}
              onChange={(v) => handleChange("farmer", v)}
              options={petaniList.map((p) => ({
                label: p.nama,
                value: String(p.id ?? p._id ?? p.nama),
              }))}
              placeholder="Pilih petani"
            />

            <SelectField
              id="field"
              label="Lahan"
              value={data.field}
              onChange={(v) => handleChange("field", v)}
              options={[
                { label: "Sukabirus", value: "Sukabirus" },
                { label: "Sukapura", value: "Sukapura" },
                { label: "Cikoneng", value: "Cikoneng" },
                { label: "Cibiru", value: "Cibiru" },
                { label: "Sukamaju", value: "Sukamaju" },
                { label: "Majalaya", value: "Majalaya" },
              ]}
              placeholder="Pilih lahan"
            />

            <SelectField
              id="seedProvider"
              label="Penyedia Bibit"
              value={data.seedProvider}
              onChange={(v) => handleChange("seedProvider", v)}
              options={bibitList.map((b) => ({
                value: String(b.id ?? b._id ?? b.namaPenyedia),
                label: b.namaPenyedia,
              }))}
              placeholder="Pilih bibit"
            />
          </div>

          {/* Kolom Kanan */}
          <div className="space-y-6">
            <SelectField
              id="plant"
              label="Tanaman"
              value={data.plant}
              onChange={(v) => handleChange("plant", v)}
              options={tanamanList.map((t) => ({
                value: String(t.id ?? t._id ?? t.namaTanaman),
                label: t.namaTanaman,
              }))}
              placeholder="Pilih tanaman"
            />

            <SelectField
              id="fertilizer"
              label="Pupuk"
              value={data.fertilizer}
              onChange={(v) => handleChange("fertilizer", v)}
              options={[
                { value: "Urea", label: "Urea" },
                { value: "NPK", label: "NPK" },
                { value: "Kompos", label: "Kompos" },
                { value: "Organik Cair", label: "Organik Cair" },
              ]}
              placeholder="Pilih pupuk"
            />

            <InputField
              id="amount"
              label="Jumlah Hasil Panen"
              type="number"
              value={data.amount}
              onChange={(v) => handleChange("amount", v)}
            />

            <SelectField
              id="salesStatus"
              label="Status Penjualan"
              value={data.salesStatus}
              onChange={(v) => handleChange("salesStatus", v)}
              options={[
                { label: "Terjual", value: "Terjual" },
                { label: "Belum Terjual", value: "Belum Terjual" },
              ]}
              placeholder="Pilih status"
            />

            <InputField
              id="buyerName"
              label="Nama Pembeli"
              value={data.buyerName}
              onChange={(v) => handleChange("buyerName", v)}
            />
          </div>
        </div>

        {/* Tombol Aksi */}
        <FormActions
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/panen")}
          submitLabel="Simpan Perubahan"
          cancelLabel="Batal"
        />
      </form>
    </DashboardLayout>
  );
}
