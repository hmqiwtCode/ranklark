import Link from "next/link";
import { Logo } from "@/components/logo";

export function Nav() {
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <Logo className="h-6 w-6" />
          Ranklark
        </Link>
        <nav className="hidden items-center gap-8 text-[15px] text-ink/90 sm:flex">
          <Link href="/apps" className="hover:text-ink">
            Apps
          </Link>
          <Link href="/research" className="hover:text-ink">
            Research
          </Link>
          <Link href="/extension" className="hover:text-ink">
            Extension
          </Link>
          <Link href="/methodology" className="hover:text-ink">
            Methodology
          </Link>
        </nav>
        <Link href="/apps" className="btn-ghost px-3 py-1.5 text-sm font-medium">
          Dashboard
        </Link>
      </div>
    </header>
  );
}
