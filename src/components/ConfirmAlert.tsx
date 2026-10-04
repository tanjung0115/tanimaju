import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmAlertProps {
  title?: string;
  message?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmLabel?: string;
  destructive?: boolean;
}
export function ConfirmAlert({ title = "Konfirmasi hapus", message = "Apakah Anda yakin ingin menghapus data ini?", onConfirm, onCancel, confirmLabel = "Hapus", destructive = true }: ConfirmAlertProps) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog open onOpenChange={open => { if (!open && !lock.current) onCancel(); }}>
    <DialogContent onOpenAutoFocus={event => { event.preventDefault(); cancelButton.current?.focus(); }} onCloseAutoFocus={event => {
      event.preventDefault();
      const target = returnFocus.current?.isConnected ? returnFocus.current : document.getElementById("dashboard-content");
      target?.focus();
    }} onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{message}</DialogDescription>
      <DialogFooter className="gap-2">
        <Button ref={cancelButton} type="button" variant="outline" disabled={busy} onClick={onCancel}>Batal</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} disabled={busy} onClick={async () => {
          if (lock.current) return;
          lock.current = true; setBusy(true);
          try { await onConfirm(); } finally { lock.current = false; setBusy(false); }
        }}>{busy ? "Memproses..." : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
