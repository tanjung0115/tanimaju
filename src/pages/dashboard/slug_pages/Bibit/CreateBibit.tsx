import { apiFetch, errorMessage } from "@/lib/api";
// File: src/pages/dashboard/slug_pages/Bibit/CreateBibitPage.tsx

import { useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Breadcrumb } from "@/components/Breadcrumb";
import { InputField } from "@/components/InputField";
import { FormActions } from "@/components/FormActions";
import { useNavigate } from "react-router-dom";
import { useNotificationContext } from "@/context/NotificationContext";

type BibitForm = {
  tanaman: string;
  sumber: string;
  namaPenyedia: string;
  tanggalPemberian: string;
};

export default function CreateBibitPage() {
  const [formData, setFormData] = useState<BibitForm>({
    tanaman: "",
    sumber: "",
    namaPenyedia: "",
    tanggalPemberian: "",
  });

  const handleChange = (field: keyof BibitForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  
  const navigate = useNavigate();
  const { addNotification } = useNotificationContext();
  const API = import.meta.env.VITE_API_URL;

  const handleSubmit = async () => {
    try {
      const payload = { ...formData };

      const response = await apiFetch(`${API}/bibit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Gagal membuat bibit");

      await response.json();

      
      // Show success notification
      addNotification({
        variant: "success",
        title: "Berhasil!",
        message: "Data bibit berhasil disimpan!",
        duration: 4000,
      });

      // reset form
      setFormData({
        tanaman: "",
        sumber: "",
        namaPenyedia: "",
        tanggalPemberian: "",
      });

      navigate("/admin/bibit");
    } catch (error) {
      console.error(error);
      
      // Show error notification
      addNotification({
        variant: "error",
        title: "Error!",
        message: errorMessage(error, "Terjadi kesalahan saat menyimpan bibit"),
        duration: 5000,
      });
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <Breadcrumb
        items={[{ label: "Bibit", to: "/admin/bibit" }, { label: "Create" }]}
      />
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Tambahkan Bibit</h1>
      </div>

      {/* Form */}
      <form onSubmit={event => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>("[data-form-submit]")?.click(); }} className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Kolom Kiri */}
          <div className="space-y-6">
            <div className="space-y-2">
              <InputField
                id="tanaman"
                label="Nama Tanaman"
                type="text"
                value={formData.tanaman}
                onChange={(val) => handleChange("tanaman", val)}
                required
              />
            </div>

            <div className="space-y-2">
              <InputField
                id="sumber"
                label="Sumber"
                type="text"
                value={formData.sumber}
                onChange={(val) => handleChange("sumber", val)}
                required
              />
            </div>
          </div>

          {/* Kolom Kanan */}
          <div className="space-y-6">
            <div className="space-y-2">
              <InputField
                id="namaPenyedia"
                label="Penyedia"
                type="text"
                value={formData.namaPenyedia}
                onChange={(val) => handleChange("namaPenyedia", val)}
                required
              />
            </div>

            <div className="space-y-2">
              <InputField
                id="tanggalPemberian"
                label="Tanggal Pemberian"
                type="date"
                value={formData.tanggalPemberian}
                onChange={(val) => handleChange("tanggalPemberian", val)}
                required
              />
            </div>
          </div>
        </div>

        {/* Tombol Aksi */}
        <FormActions
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/panen")}
        />
      </form>
    </DashboardLayout>
  );
}
