import { apiFetch, errorMessage } from "@/lib/api";
import { useCallback, useEffect, useState, useRef } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Notice = { id:number; title:string; message:string; scheduled_at:string; read_at:string|null; related_entity_type:string; related_entity_id:number };
export function NotificationBell() {
  const { user } = useAuth();
  const [open,setOpen] = useState(false);
  const [count,setCount] = useState(0);
  const [data,setData] = useState<Notice[]>([]);
  const [page,setPage] = useState(1);
  const [totalPages,setTotalPages] = useState(0);
  const [loading,setLoading] = useState(false);
  const mutationLock = useRef(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const API=import.meta.env.VITE_API_URL;
  const userId=user?.id;
  const currentUserId=useRef(userId);
  currentUserId.current=userId;
  const load = useCallback(async(signal?:AbortSignal) => {
    if (!userId) return;
    if (open) setLoading(true);
    try {
      const countResponse=await apiFetch(`${API}/notifications/unread-count`,{credentials:"include",signal});
      if (!countResponse.ok) throw new Error("Notifikasi belum dapat dimuat. Coba kembali.");
      const result=await countResponse.json();
      if (signal?.aborted || currentUserId.current !== userId) return;
      setCount(result.unreadCount);
      if (open) {
        const response=await apiFetch(`${API}/notifications?page=${page}&limit=20`,{credentials:"include",signal});
        if (!response.ok) throw new Error("Notifikasi belum dapat dimuat. Coba kembali.");
        const notices=await response.json();
        if (signal?.aborted || currentUserId.current !== userId) return;
        setData(notices.data);setTotalPages(notices.pagination.totalPages);
      }
      setError("");
    } catch(cause) {if (!signal?.aborted && currentUserId.current === userId) setError(errorMessage(cause, "Notifikasi gagal dimuat."));}
    finally {if (!signal?.aborted && currentUserId.current === userId) setLoading(false);}
  },[API,userId,open,page]);
  useEffect(()=>{setData([]);setCount(0);setPage(1);setOpen(false);setError("");setBusy(false);},[userId]);
  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal);
    // Refresh only while the tab is visible; opening the panel always refreshes it.
    const timer=window.setInterval(()=>{if (!document.hidden) void load(controller.signal);},60000);
    const onVisibility=()=>{if (!document.hidden) void load(controller.signal);};
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{controller.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[load]);
  const mark = async(id?:number) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true);
    try {
      const response=await apiFetch(`${API}/notifications/${id===undefined?"read-all":`${id}/read`}`,{method:"PUT",credentials:"include"});
      if (!response.ok) throw new Error("Notifikasi gagal ditandai. Coba kembali.");
      await load();
    } catch(cause) {if (currentUserId.current === userId) setError(errorMessage(cause, "Notifikasi gagal ditandai."));}
    finally {mutationLock.current = false; if (currentUserId.current === userId) setBusy(false);}
  };
  if (!user) return null;
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value)setPage(1);}}><DialogTrigger asChild><button type="button" className="relative rounded-full p-3 hover:bg-gray-100" aria-label={`Notifikasi, ${count} belum dibaca`}><Bell className="h-5 w-5"/>{count>0&&<span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 text-white">{count>99?"99+":count}</span>}</button></DialogTrigger><DialogContent className="max-h-[85dvh] w-[calc(100vw_-_1.5rem)] overflow-y-auto rounded-lg sm:max-w-lg"><DialogHeader><DialogTitle>Notifikasi</DialogTitle><DialogDescription>Pengingat jadwal pertanian Anda. Waktu ditampilkan dalam WIB.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy||loading||!count} onClick={()=>mark()}>Tandai semua dibaca</Button><Button size="sm" variant="outline" disabled={busy||loading} onClick={()=>load()}>Muat ulang</Button></div>{error?<p role="alert" className="text-sm text-red-700">{error}</p>:loading?<p className="py-8 text-center text-sm">Memuat notifikasi...</p>:!data.length?<p className="py-8 text-center text-sm text-gray-500">Belum ada notifikasi.</p>:<div className="space-y-3">{data.map(notice=><article key={notice.id} className={`rounded border p-3 ${notice.read_at?"bg-white":"border-green-200 bg-green-50"}`}><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{notice.title}</h3><span className="whitespace-nowrap text-xs text-gray-500">{notice.read_at?"Dibaca":"Belum dibaca"}</span></div><p className="mt-1 text-sm">{notice.message}</p><time className="mt-2 block text-xs text-gray-500">{new Date(notice.scheduled_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB</time><div className="mt-2 flex gap-3 text-xs">{!notice.read_at&&<button type="button" className="text-green-700 underline disabled:opacity-50" disabled={busy} onClick={()=>mark(notice.id)}>Tandai dibaca</button>}<Link className="text-green-700 underline" to="/admin/aktivitas-pertanian" onClick={()=>setOpen(false)}>Lihat {notice.related_entity_type==="activity_reminder"?"jadwal aktivitas":"siklus tanam"}</Link></div></article>)}</div>}<div className="flex items-center justify-end gap-3 text-xs"><span>Halaman {page}/{Math.max(totalPages,1)}</span><button disabled={loading||page<=1} onClick={()=>setPage(page-1)}>Sebelumnya</button><button disabled={loading||page>=totalPages} onClick={()=>setPage(page+1)}>Berikutnya</button></div></DialogContent></Dialog>;
}
