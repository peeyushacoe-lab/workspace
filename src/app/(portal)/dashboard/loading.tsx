export default function DashboardLoading() {
  return (
    <div className="p-8 animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-64 bg-surface rounded-lg mb-2" />
        <div className="h-4 w-80 bg-surface-sunken rounded" />
      </div>
      <div className="grid lg:grid-cols-[1fr_350px] gap-8">
        <div className="space-y-4">
          <div className="h-7 w-40 bg-surface rounded" />
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-surface-sunken flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 bg-surface-sunken rounded" />
                    <div className="h-3 w-56 bg-hover rounded" />
                  </div>
                  <div className="h-5 w-16 bg-hover rounded-full" />
                  <div className="h-3 w-20 bg-hover rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-7 w-36 bg-surface rounded" />
          <div className="bg-surface rounded-xl border border-border h-96" />
        </div>
      </div>
    </div>
  );
}
