/** Orda's mark: an "O" drawn as a coffee cup seen from above (same drawing as brand/orda-mark.svg). */
export function OrdaMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={`shrink-0 ${className}`} role="img" aria-label="Orda">
      <rect width="1024" height="1024" rx="256" fill="var(--accent)" />
      <path d="M690 404 H772 A108 108 0 0 1 772 620 H690" fill="none" stroke="#fff" strokeWidth="58" strokeLinecap="round" />
      <circle cx="452" cy="512" r="246" fill="none" stroke="#fff" strokeWidth="84" />
      <circle cx="452" cy="512" r="122" fill="#e0a23b" />
    </svg>
  );
}

/** Mark plus the name, e.g. on the sign-in page. */
export function OrdaLogo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <OrdaMark size={size} />
      <span className="font-semibold tracking-[-0.02em] text-accent" style={{ fontSize: size * 0.72 }}>orda</span>
    </span>
  );
}
