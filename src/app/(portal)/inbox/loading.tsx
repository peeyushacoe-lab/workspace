export default function InboxLoading() {
  return (
    <div className="p-8">
      <div className="mb-8 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded-lg mb-2" />
        <div className="h-4 w-72 bg-surface-sunken rounded" />
      </div>
      <div className="flex h-[calc(100vh-130px)] bg-surface rounded-xl border border-border overflow-hidden">
        <div className="hidden md:flex w-44 flex-shrink-0 flex-col border-r border-border bg-surface p-3 gap-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-surface rounded-lg" />
          ))}
        </div>
        <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border space-y-2 animate-pulse">
            <div className="h-6 w-24 bg-surface-sunken rounded" />
            <div className="h-7 bg-surface rounded-lg" />
          </div>
          <div className="flex-1 divide-y divide-border animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-3 flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-surface-sunken flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-3/4 bg-surface-sunken rounded" />
                  <div className="h-3 w-1/2 bg-hover rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 bg-surface flex items-center justify-center">
          <div className="text-muted/40 text-sm">Loading inbox…</div>
        </div>
      </div>
    </div>
  );
}
