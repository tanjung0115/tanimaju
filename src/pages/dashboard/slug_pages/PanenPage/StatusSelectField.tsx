import { SelectField } from "@/components/SelectField";
export function StatusSelectField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SelectField id="status" label="Status Penjualan" required value={value} onChange={onChange} options={[{ value: "Terjual", label: "Terjual" }, { value: "Belum Terjual", label: "Belum Terjual" }]} />;
}
