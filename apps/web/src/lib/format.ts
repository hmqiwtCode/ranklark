export const compact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(n < 10 ? 1 : 0)}%`);

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const t = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { day: "2-digit", month: "short", timeZone: "UTC" });
