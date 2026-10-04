import { ConfirmAlert, type ConfirmAlertProps } from "@/components/ConfirmAlert";
export function Konfirmasi(props: ConfirmAlertProps) {
  return <ConfirmAlert confirmLabel="Konfirmasi" destructive={false} {...props} />;
}
