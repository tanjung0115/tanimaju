import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export function useListFilters(prefix: string) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(Array.from(params.entries()).filter(([key]) => key.startsWith(`${prefix}_`)).map(([key, value]) => [key.slice(prefix.length + 1), value])), [params, prefix]);
  const update = useCallback((key: string, value: string) => {
    setParams(current => { const next = new URLSearchParams(current); if (value) next.set(`${prefix}_${key}`, value); else next.delete(`${prefix}_${key}`); return next; }, { replace: true });
  }, [prefix, setParams]);
  const reset = useCallback(() => { setParams(current => { const next = new URLSearchParams(current); Array.from(next.keys()).forEach(key => { if (key.startsWith(`${prefix}_`)) next.delete(key); }); return next; }, { replace: true }); }, [prefix, setParams]);
  return { filters, update, reset };
}
