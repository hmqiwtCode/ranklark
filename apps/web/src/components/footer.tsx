import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line/60 px-4 py-6 text-xs text-ink-3">
      <span>Ranklark · open-source ASO · your data stays on this machine</span>
      <span className="flex gap-4">
        <Link href="/methodology" className="hover:text-ink-2">
          How the numbers work
        </Link>
        <a href="https://github.com/hmqiwtCode/ranklark" target="_blank" rel="noreferrer" className="hover:text-ink-2">
          GitHub
        </a>
      </span>
    </footer>
  );
}
