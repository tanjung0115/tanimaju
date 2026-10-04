import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Breadcrumb } from "@/components/Breadcrumb";
import { InputField } from "@/components/InputField";
import ImageUpload from "@/components/ImageUpload";
import { FormActions } from "@/components/FormActions";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/LoadingSpinner";
import { useNotificationContext } from "@/context/NotificationContext";

type ProductForm = {
  id: string;
  title: string;
  price: string;
  imageSrc: string | File | null;
  description: string;
  info: string;
  whatsappNumber: string;
};

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const [formData, setFormData] = useState<ProductForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const API = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();
  const { addNotification } = useNotificationContext();

  useEffect(() => {    
    // Pastikan id ada dan bukan string kosong
    if (!id || id.trim() === '') {
      console.error("ID produk tidak valid:", id);
      addNotification({
        variant: "error",
        title: "Error!",
        message: "ID produk tidak ditemukan atau tidak valid",
        duration: 5000,
      });
      navigate("/admin/item");
      return;
    }

    let isMounted = true;
    
    setLoading(true);
    
    apiFetch(`${API}/products/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal fetch produk`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setFormData({
            id: data.id,
            title: data.title || "",
            price: data.price || "",
            imageSrc: data.imageSrc || null,
            description: data.description || "",
            info: data.info || "",
            whatsappNumber: data.whatsappNumber || "",
          });
        }
      })
      .catch((err) => {
        setLoadError(errorMessage(err, "Data belum dapat dimuat."));
        console.error("Gagal memuat produk:", err);
        if (isMounted) {
          addNotification({
            variant: "error",
            title: "Error!",
            message: errorMessage(err, "Data produk belum dapat dimuat."),
            duration: 5000,
          });
          navigate("/admin/item");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id, API, navigate, addNotification]);

  const handleChange = (
    field: keyof ProductForm,
    value: string | File | null
  ) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  // ✅ Submit update data
  const handleSubmit = async () => {
    if (!formData || !id) {
      addNotification({
        variant: "error",
        title: "Error!",
        message: "Data tidak valid",
        duration: 5000,
      });
      return;
    }
    
    try {
      const form = new FormData();
      form.append("title", formData.title);
      form.append("price", formData.price);
      form.append("description", formData.description);
      form.append("info", formData.info);
      form.append("whatsappNumber", formData.whatsappNumber);

      // hanya append file baru jika user upload
      if (formData.imageSrc instanceof File) {
        form.append("imageSrc", formData.imageSrc);
      }

      const res = await apiFetch(`${API}/products/${id}`, {
        method: "PUT",
        body: form,
      });

      if (!res.ok) throw new Error("Gagal update produk");

      addNotification({
        variant: "success",
        title: "Berhasil!",
        message: "Produk berhasil diperbarui!",
        duration: 4000,
      });
      navigate("/admin/item");
    } catch (err) {
      console.error(err);
      addNotification({
        variant: "error",
        title: "Error!",
        message: errorMessage(err, "Terjadi kesalahan saat update produk"),
        duration: 5000,
      });
    }
  };

  if (loadError || (!loading && !formData)) return <DashboardLayout><div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-700">{loadError || "Data tidak ditemukan."}<button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>Coba kembali</button></div></DashboardLayout>;

  if (loading || !formData) {
    return (
      <DashboardLayout>
        <LoadingScreen />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <Breadcrumb
        items={[{ label: "Item", to: "/admin/item" }, { label: "Edit" }]}
      />

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Edit Produk</h1>
      </div>

      <form onSubmit={event => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>("[data-form-submit]")?.click(); }} className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <InputField
              id="title"
              label="Nama Produk"
              value={formData.title}
              onChange={(value) => handleChange("title", value)}
            />

            <InputField
              id="description"
              label="Deskripsi"
              value={formData.description}
              onChange={(value) => handleChange("description", value)}
            />

            <div className="space-y-2">
              <Label htmlFor="info">Informasi Lengkap</Label>
              <Textarea
                id="info"
                value={formData.info}
                onChange={(e) => handleChange("info", e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>
          </div>

          <div className="space-y-6">
            <InputField
              id="price"
              label="Harga (Rp)"
              value={formData.price}
              onChange={(value) => handleChange("price", value)}
            />

            <InputField
              id="whatsappNumber"
              label="Nomor WhatsApp"
              value={formData.whatsappNumber}
              onChange={(value) => handleChange("whatsappNumber", value)}
            />

            <ImageUpload
              _id="imageSrc"
              label="Gambar Produk"
              value={formData.imageSrc}
              onChange={(file) => handleChange("imageSrc", file)}
            />
          </div>
        </div>

        {/* Tombol Aksi */}
        <FormActions
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/item")}
          submitLabel="Simpan Perubahan"
          cancelLabel="Batal"
        />
      </form>
    </DashboardLayout>
  );
}
