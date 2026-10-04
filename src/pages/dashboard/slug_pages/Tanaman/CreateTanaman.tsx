import { apiFetch, errorMessage } from "@/lib/api";
// File: src/pages/dashboard/slug_pages/Tanaman/CreateTanamanPage.tsx

import { useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { SelectField } from "@/components/SelectField";
import { InputField } from "@/components/InputField";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FormActions } from "@/components/FormActions";
import { useNavigate } from "react-router-dom";
import { useNotificationContext } from "@/context/NotificationContext";

type TanamanForm = {
  namaTanaman: string;
  pupuk: string;
};

export default function CreateTanamanPage() {
  const [formData, setFormData] = useState<TanamanForm>({
    namaTanaman: "",
    pupuk: "",
  });

  const handleChange = (field: keyof TanamanForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const navigate = useNavigate();
  const { addNotification } = useNotificationContext();
  const API = import.meta.env.VITE_API_URL;

  const handleSubmit = async () => {
    try {
      const payload = { ...formData };

      const response = await apiFetch(`${API}/tanaman`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Gagal membuat tanaman");

      await response.json();

      addNotification({
        variant: "success",
        title: "Berhasil!",
        message: "Data tanaman berhasil disimpan!",
        duration: 4000,
      });

      // reset form
      setFormData({
        namaTanaman: "",
        pupuk: "",
      });

      navigate("/admin/tanaman");
    } catch (error) {
      console.error(error);
      addNotification({
        variant: "error",
        title: "Error!",
        message: errorMessage(error, "Terjadi kesalahan saat menyimpan tanaman"),
        duration: 5000,
      });
    }
  };

  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Tanaman", to: "/admin/tanaman" },
          { label: "Create" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Tambahkan Tanaman</h1>
      </div>
      <form onSubmit={event => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>("[data-form-submit]")?.click(); }} className="rounded-lg border bg-white p-4 shadow-sm sm:p-6 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            {/* Input Nama Tanaman */}
            <div className="space-y-2">
              <InputField
                id="namaTanaman"
                label="Nama Tanaman"
                type="text"
                value={formData.namaTanaman}
                onChange={(val) => handleChange("namaTanaman", val)}
              />
            </div>
            <SelectField
              id="pupuk"
              label="Pupuk"
              required
              value={formData.pupuk}
              placeholder="Pilih pupuk"
              options={[
                { value: "Urea", label: "Urea" },
                { value: "NPK", label: "NPK" },
                { value: "Kompos", label: "Kompos" },
                { value: "Organik Cair", label: "Organik Cair" },
              ]}
              onChange={(val) => handleChange("pupuk", val)}
            />
          </div>
        </div>

        {/* Tombol Aksi */}
        <FormActions
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/tanaman")}
        />
      </form>
    </DashboardLayout>
  );
}
