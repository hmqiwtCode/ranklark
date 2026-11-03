"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY } from "@/lib/glossary";

/**
 * "?" button with a plain-language explanation. The popover renders in a portal with fixed
 * positioning so it is never clipped by scrolling tables.
 */
export function Help({ term, className = "" }: { term: string; className?: string }) {
  const t = GLOSSARY[term];
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const [pinned, setPinned] = useState(false);

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + 180 > window.innerHeight;
    setPos({ x: Math.min(Math.max(12, r.left + r.width / 2 - 140), window.innerWidth - 292), y: above ? r.top - 8 : r.bottom + 8, above });
  };
  const hide = () => !pinned && setPos(null);

  useEffect(() => {
    if (!pinned) return;
    const close = (e: Event) => {
      if (!btn.current?.contains(e.target as Node)) {
        setPinned(false);
        setPos(null);
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pinned]);

  if (!t) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`What is ${t.title}?`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => !p);
          show();
        }}
        className={`ml-1 inline-grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border border-line-strong align-middle text-[9px] font-bold leading-none text-ink-3 transition hover:border-ink-3 hover:text-ink ${className}`}
      >
        ?
      </button>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-[280px] rounded-xl border border-line-strong bg-[oklch(19%_0_0)] p-3 text-left text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-ink-2 shadow-2xl shadow-black/50"
            style={{ left: pos.x, top: pos.y, transform: pos.above ? "translateY(-100%)" : undefined }}
          >
            <div className="mb-1 text-[13px] font-semibold text-ink">{t.title}</div>
            <div>{t.body}</div>
            {(t.good || t.source) && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px]">
                {t.good && (
                  <span className={t.good === "high" ? "text-good" : "text-sky"}>
                    {t.good === "high" ? "▲ Higher is better" : "▼ Lower is better"}
                  </span>
                )}
                {t.source && <span className="text-ink-3">Source: {t.source}</span>}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Table header / label text + its "?" */
export function L({ children, term }: { children: React.ReactNode; term: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      {children}
      <Help term={term} />
    </span>
  );
}
