import Link from "next/link";
import { CountrySelect, RefreshButton } from "@/components/actions";
import { AppIcon } from "@/components/ui";
import type { AppRow } from "@/server/db/rows";

export function AppHeader({
  app,
  country,
  countries,
  tab,
}: {
  app: AppRow;
  country: string;
  countries: string[];
  tab: "keywords" | "metadata" | "competitors";
}) {
  const q = `?country=${country}`;
  const tabs = [
    ["keywords", "Rankings", `/apps/${app.id}${q}`],
    ["metadata", "App Store text", `/apps/${app.id}/metadata${q}`],
    ["competitors", "Competitors", `/apps/${app.id}/competitors${q}`],
  ] as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/apps" className="btn-ghost flex h-9 items-center gap-2 px-2.5 text-[15px] font-semibold">
          <AppIcon src={app.icon} name={app.name} size={22} />
          <span className="max-w-56 truncate">{app.name}</span>
        </Link>
        <CountrySelect value={country} options={countries} />
        <div className="seg">
          {tabs.map(([k, label, href]) => (
            <Link key={k} href={href} data-active={tab === k}>
              {label}
            </Link>
          ))}
        </div>
      </div>
      <RefreshButton appId={app.id} country={country} />
    </div>
  );
}
