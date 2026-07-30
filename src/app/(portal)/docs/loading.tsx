export default function DocsLoading() {
  return (
    <div className="flex h-full bg-surface animate-pulse">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-surface p-3 flex flex-col gap-2">
        <div className="h-4 w-24 bg-surface rounded mb-2" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-7 bg-surface rounded" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col p-8 gap-4">
        <div className="h-8 w-64 bg-surface rounded" />
        <div className="h-4 w-96 bg-surface-sunken rounded" />
        <div className="flex-1 bg-surface rounded-xl border border-border" />
      </div>
    </div>
  );
}
