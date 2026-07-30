export default function NotesLoading() {
  return (
    <div className="flex h-[calc(100vh-7.25rem)] lg:h-full lg:h-full bg-surface animate-pulse overflow-hidden">
      <div className="w-64 bg-surface border-r border-border p-4 flex flex-col gap-3">
        <div className="h-9 bg-surface rounded-lg" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-surface rounded-lg" />
        ))}
      </div>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="flex-1 bg-surface rounded-xl border border-border" />
      </div>
    </div>
  );
}
