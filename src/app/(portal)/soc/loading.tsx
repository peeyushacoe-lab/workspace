export default function SocLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-surface min-h-full">
      <div className="h-8 w-48 bg-surface rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-surface rounded-xl border border-border" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 bg-surface rounded-xl border border-border" />
        <div className="h-64 bg-surface rounded-xl border border-border" />
      </div>
    </div>
  );
}
