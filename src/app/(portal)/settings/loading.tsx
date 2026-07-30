export default function SettingsLoading() {
  return (
    <div className="flex h-full bg-surface animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-border bg-surface p-4 flex flex-col gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-9 bg-surface rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-6">
        <div className="h-7 w-40 bg-surface rounded" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-surface rounded-xl border border-border" />
          <div className="h-64 bg-surface rounded-xl border border-border" />
        </div>
      </div>
    </div>
  );
}
