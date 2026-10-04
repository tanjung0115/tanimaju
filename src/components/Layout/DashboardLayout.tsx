import type { ReactNode } from "react";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/pages/dashboard/Sidebar/Sidebar";
import { TopBar } from "@/pages/dashboard/TopBar";
import { NotificationBell } from "@/components/NotificationBell";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return <div className="relative flex h-dvh bg-gray-50 font-cascadia">
    <a href="#dashboard-content" className="sr-only z-[60] rounded bg-white p-3 focus:not-sr-only focus:absolute">Lewati navigasi</a>
    <div className="absolute right-5 top-2 z-30 lg:right-20 lg:top-4"><NotificationBell /></div>
    <aside className="hidden w-64 shrink-0 border-r bg-white lg:block" aria-label="Navigasi dashboard"><Sidebar /></aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-2 lg:hidden">
        <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <DialogTrigger asChild><button type="button" aria-label="Buka navigasi" className="rounded p-3 hover:bg-gray-100"><Menu className="h-5 w-5" /></button></DialogTrigger>
          <DialogContent aria-describedby={undefined} className="left-0 top-0 flex h-dvh max-h-dvh w-64 max-w-[90vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0" onClick={event => { if ((event.target as HTMLElement).closest("a")) setSidebarOpen(false); }}>
            <DialogTitle className="shrink-0 border-b px-4 py-5">Dashboard</DialogTitle><div className="min-h-0 flex-1"><Sidebar /></div>
          </DialogContent>
        </Dialog>
        <span className="text-lg font-semibold">Dashboard</span><span className="w-11" aria-hidden="true" />
      </header>
      <div className="hidden shrink-0 lg:block"><TopBar /></div>
      <main id="dashboard-content" tabIndex={-1} className="dashboard-content min-h-0 flex-1 overflow-auto p-3 sm:p-6">{children}</main>
    </div>
  </div>;
}
