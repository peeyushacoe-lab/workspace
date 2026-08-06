/**
 * Skeleton for the one Connect page that does real server-side data fetching
 * before it can render (the team lookup). Every other Connect page renders a
 * client component immediately and owns its own loading state, so a
 * group-level `loading.tsx` would only add a flash of skeleton to navigations
 * that are already instant — which is why this is scoped here rather than to
 * the whole route group.
 *
 * Mirrors the real page's header geometry so the layout doesn't jump when the
 * data lands.
 */
export default function TeamDetailLoading() {
  return (
    <div className="flex h-full min-h-0 animate-pulse flex-col" aria-busy="true" aria-label="Loading team">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3">
        <div className="h-7 w-7 flex-shrink-0 rounded-lg bg-surface-sunken" />
        <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-surface-sunken" />
        <div className="min-w-0 space-y-1.5">
          <div className="h-3.5 w-40 rounded bg-surface-sunken" />
          <div className="h-2.5 w-28 rounded bg-surface-sunken" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Channel rail */}
        <div className="hidden w-64 flex-shrink-0 space-y-2 border-r border-border-soft p-3 sm:block">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-surface-sunken" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>

        {/* Message area */}
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-4 p-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-surface-sunken" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-surface-sunken" />
                <div className="h-3 rounded bg-surface-sunken" style={{ width: `${45 + ((i * 17) % 40)}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-2 h-11 rounded-xl bg-surface-sunken" />
        </div>
      </div>
    </div>
  );
}
