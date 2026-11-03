"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "/apps", label: "My apps" },
  { href: "/research", label: "Find keywords" },
  { href: "/extension", label: "Extension" },
] as const;

/** Top navigation: three destinations in plain words, plus the one action every new user needs. */
export function Nav() {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[17px] font-bold tracking-tight">
          <Logo className="h-6 w-6" />
          <span className="hidden sm:inline">Ranklark</span>
        </Link>
        <nav className="flex items-center gap-1 text-[14px] sm:gap-2 sm:text-[15px]">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`rounded-lg px-2.5 py-1.5 transition sm:px-3 ${active(l.href) ? "bg-white/[0.07] text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/apps#add" className="btn-primary flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-semibold">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add app</span>
        </Link>
      </div>
    </header>
  );
}
