export type Period = "month" | "year" | "30days" | "custom";

export function getDashboardRange(period: Period, start: string, end: string, now = new Date()) {
  if (period === "custom") return { start, end };
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(now);
  if (period === "year") return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (period === "30days") {
    const first = new Date(`${today}T00:00:00Z`);
    first.setUTCDate(first.getUTCDate() - 29);
    return { start: first.toISOString().slice(0, 10), end: today };
  }
  return { start: `${today.slice(0, 7)}-01`, end: today };
}
