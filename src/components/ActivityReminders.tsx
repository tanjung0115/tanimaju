import { apiFetch, errorMessage } from "@/lib/api";
import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { EntitySelect } from "@/components/ListFilters";
import { Button } from "@/components/ui/button";
type Reminder = {id:number;jenis_aktivitas:string;tanggal_rencana:string;nama_material:string|null;status:string;nama_lahan:string;tanaman_nama:string;petani_nama:string};
const blank={siklus_tanam_id:"",jenis_aktivitas:"pemupukan",tanggal_rencana:"",nama_material:"",catatan:""};
export function ActivityReminders() {
  const {role,user}=useAuth();
  const userId=user?.id;
  const currentUserId = useRef(userId); currentUserId.current = userId;
  const mutationLock = useRef(false);
  const canWrite=role==="admin"||role==="petani";
  const API=import.meta.env.VITE_API_URL;
  const [form,setForm]=useState(blank);
  const [data,setData]=useState<Reminder[]>([]);
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    if (!userId) return;
    setLoading(true);
    try {
      const response=await apiFetch(`${API}/reminders?page=${page}&limit=20`,{credentials:"include",signal});
      if(!response.ok)throw new Error("Jadwal belum dapat dimuat. Coba kembali.");
      const result=await response.json();if(signal?.aborted || currentUserId.current !== userId)return;
      setData(result.data);setTotalPages(result.pagination.totalPages);setError("");
    }catch(cause){if(!signal?.aborted && currentUserId.current === userId)setError(errorMessage(cause, "Jadwal gagal dimuat."));}
    finally{if(!signal?.aborted && currentUserId.current === userId)setLoading(false);}
  },[API,page,userId]);
  useEffect(()=>{setData([]);setPage(1);setBusy(false);setError("");setMessage("");},[userId]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setMessage("");
    try{
      const response=await apiFetch(`${API}/reminders`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,siklus_tanam_id:Number(form.siklus_tanam_id)})});
      if(!response.ok){const result=await response.json();throw new Error(result.error??"Jadwal gagal disimpan.");}
      if(currentUserId.current !== userId)return;
      setForm(blank);setMessage("Jadwal tersimpan. Pengingat masuk pada waktu yang dijadwalkan.");await load();
    }catch(cause){if(currentUserId.current === userId)setError(errorMessage(cause, "Jadwal gagal disimpan."));}finally{mutationLock.current=false;if(currentUserId.current === userId)setBusy(false);}
  };
  const close=async(id:number,status:string)=>{
    if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setMessage("");
    try{
      const response=await apiFetch(`${API}/reminders/${id}/status`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
      if(!response.ok){const result=await response.json();throw new Error(result.error??"Jadwal gagal diubah.");}
      if(currentUserId.current !== userId)return;
      setMessage("Status jadwal diperbarui.");await load();
    }catch(cause){if(currentUserId.current === userId)setError(errorMessage(cause, "Jadwal gagal diubah."));}finally{mutationLock.current=false;if(currentUserId.current === userId)setBusy(false);}
  };
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Jakarta"}).format(new Date());
  return <section id="jadwal-aktivitas" className="space-y-3 rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Jadwal Pemupukan & Pengobatan</h2><p className="text-sm text-gray-500">Jadwal ini terpisah dari histori. Tandai selesai setelah pelaksanaan, lalu catat kejadian melalui form Aktivitas.</p>{canWrite&&<form onSubmit={save} className="grid gap-3 sm:grid-cols-2"><div className="text-sm">Siklus Tanam<EntitySelect required field={{key:"siklus_tanam_id",label:"Siklus Tanam",endpoint:"siklus-tanam"}} value={form.siklus_tanam_id} onChange={value=>setForm({...form,siklus_tanam_id:value})}/></div><label className="text-sm">Jenis aktivitas<select className="mt-1 w-full rounded border p-2" value={form.jenis_aktivitas} onChange={event=>setForm({...form,jenis_aktivitas:event.target.value})}><option value="pemupukan">Pemupukan</option><option value="pengobatan">Pengobatan/Pestisida</option></select></label><label className="text-sm">Tanggal rencana (WIB)<input className="mt-1 w-full rounded border p-2" type="date" min={today} required value={form.tanggal_rencana} onChange={event=>setForm({...form,tanggal_rencana:event.target.value})}/></label><label className="text-sm">Material (opsional)<input className="mt-1 w-full rounded border p-2" maxLength={255} value={form.nama_material} onChange={event=>setForm({...form,nama_material:event.target.value})}/></label><label className="text-sm sm:col-span-2">Catatan (opsional)<textarea className="mt-1 w-full rounded border p-2" maxLength={1000} value={form.catatan} onChange={event=>setForm({...form,catatan:event.target.value})}/></label><Button className="w-fit" type="submit" disabled={busy||!form.siklus_tanam_id}>{busy?"Menyimpan...":"Simpan jadwal"}</Button></form>}{message&&<p role="status" className="text-sm text-green-700">{message}</p>}{error?<div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={()=>load()}>Coba kembali</button></div>:loading?<p className="text-sm">Memuat jadwal...</p>:!data.length?<p className="text-sm text-gray-500">Belum ada jadwal aktivitas.</p>:<div className="space-y-2">{data.map(item=><article key={item.id} className="flex flex-col justify-between gap-2 rounded border p-3 text-sm sm:flex-row"><div><strong>{item.jenis_aktivitas==="pemupukan"?"Pemupukan":"Pengobatan/Pestisida"}</strong> ? {String(item.tanggal_rencana).slice(0,10)}<p>{item.petani_nama} | {item.nama_lahan} | {item.tanaman_nama}</p><p className="text-gray-500">{item.nama_material??""} | {item.status}</p></div>{canWrite&&item.status==="terjadwal"&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>close(item.id,"selesai")}>Selesai</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>close(item.id,"dibatalkan")}>Batalkan</Button></div>}</article>)}</div>}<div className="flex justify-end gap-3 text-xs"><span>{page}/{Math.max(totalPages,1)}</span><button disabled={loading||page<=1} onClick={()=>setPage(page-1)}>Sebelumnya</button><button disabled={loading||page>=totalPages} onClick={()=>setPage(page+1)}>Berikutnya</button></div></section>;
}
