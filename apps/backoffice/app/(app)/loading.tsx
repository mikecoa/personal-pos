/** Shown while the next page loads: a quiet outline of a page instead of a frozen screen. */
export default function Loading() {
  return (
    <div className="anim-fade mx-auto max-w-6xl" aria-busy="true" aria-live="polite">
      <div className="skeleton mb-2 h-8 w-56" />
      <div className="skeleton mb-7 h-4 w-80 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
      <div className="skeleton mt-6 h-64" />
    </div>
  );
}
