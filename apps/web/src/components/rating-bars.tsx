import { compact } from "@/lib/format";

/** 5★ → 1★ horizontal bars (one magnitude, one hue). */
export function RatingBars({ histogram }: { histogram: number[] | null }) {
  if (!histogram) return <p className="text-sm text-ink-3">Not available for this app.</p>;
  const total = histogram.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...histogram, 1);
  return (
    <div className="flex flex-col gap-1.5">
      {histogram.map((n, i) => (
        <div key={i} className="flex items-center gap-3 text-[13px]">
          <span className="w-7 shrink-0 text-ink-2">{5 - i}★</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-series-blue" style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right tabular text-ink-2">
            {compact(n)} <span className="text-ink-3">· {Math.round((n / total) * 100)}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}
