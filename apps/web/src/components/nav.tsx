"use client";

import { Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

/** `short` is what phones show, so four links still fit next to the logo and buttons at 360–390px. */
const LINKS = [
  { href: "/apps", label: "My apps", short: "Apps" },
  { href: "/research", label: "Find keywords", short: "Keywords" },
  { href: "/agent", label: "AI research", short: "AI" },
  { href: "/extension", label: "Extension", short: "Extension" },
] as const;

/** Top navigation: the main destinations in plain words, settings, plus the one action every new user needs. */
export function Nav() {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[17px] font-bold tracking-tight">
          <Logo className="h-6 w-6" />
          <span className="hidden sm:inline">Ranklark</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 text-[13.5px] sm:gap-2 sm:text-[15px]">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-2 py-1.5 transition sm:px-3 ${active(l.href) ? "bg-white/[0.07] text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              <span className="md:hidden">{l.short}</span>
              <span className="hidden md:inline">{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={active("/settings") ? "page" : undefined}
            className={`grid h-8 w-8 place-items-center rounded-lg transition ${active("/settings") ? "bg-white/[0.07] text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            <Settings className="h-[18px] w-[18px]" />
          </Link>
          <Link href="/apps#add" className="btn-primary flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-semibold sm:px-3">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add app</span>
            <span className="sr-only sm:hidden">Add app</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
