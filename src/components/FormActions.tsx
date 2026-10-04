import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type FormActionsProps = {
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
};
export function FormActions({ onSubmit, onCancel, submitLabel = "Simpan", cancelLabel = "Batal" }: FormActionsProps) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return <div className="mt-8 flex flex-wrap gap-3 border-t pt-6" aria-busy={busy}>
    <Button type="submit" data-form-submit disabled={busy} className="bg-green-700 text-white hover:bg-green-800" onClick={async event => {
      event.preventDefault();
      if (lock.current || !event.currentTarget.form?.reportValidity()) return;
      lock.current = true; setBusy(true);
      try { await onSubmit(); } finally { lock.current = false; setBusy(false); }
    }}>{busy ? "Menyimpan..." : submitLabel}</Button>
    <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
  </div>;
}
