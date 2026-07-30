export default function ComposeLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-surface min-h-full">
      <div className="h-8 w-40 bg-surface rounded" />
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-surface rounded-xl border border-border" />
            ))}
          </div>
          <div className="h-64 bg-surface rounded-xl border border-border" />
          <div className="h-10 w-36 bg-surface rounded-lg" />
        </div>
        <div className="h-96 bg-surface rounded-xl border border-border" />
      </div>
    </div>
  );
}
