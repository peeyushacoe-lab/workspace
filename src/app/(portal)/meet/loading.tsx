export default function MeetLoading() {
  return (
    <div className="h-full flex bg-surface">
      <div className="w-72 border-r border-border p-4 space-y-3">
        <div className="h-8 bg-surface-sunken rounded animate-pulse" />
        <div className="h-9 bg-surface rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-surface rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
