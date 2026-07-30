export default function CalendarLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4 bg-surface min-h-full">
      <div className="h-8 w-40 bg-surface rounded" />
      <div className="flex gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex-1 h-8 bg-surface rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="h-24 bg-surface rounded-lg border border-border" />
        ))}
      </div>
    </div>
  );
}
