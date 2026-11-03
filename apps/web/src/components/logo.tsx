export function Logo({ className = "" }: { className?: string }) {
  // three rising bars + a dot: "climbing the ranks"
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect x="3" y="14" width="5" height="11" rx="2.5" fill="var(--color-primary)" opacity="0.55" />
      <rect x="11.5" y="9" width="5" height="16" rx="2.5" fill="var(--color-primary)" opacity="0.8" />
      <rect x="20" y="3" width="5" height="22" rx="2.5" fill="var(--color-primary)" />
    </svg>
  );
}
