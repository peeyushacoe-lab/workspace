export default function CalendarLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4 bg-[#0f1321] min-h-screen">
      <div className="h-8 w-40 bg-[#1b1f2e] rounded" />
      <div className="flex gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex-1 h-8 bg-[#1b1f2e] rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="h-24 bg-[#1b1f2e] rounded-lg border border-[rgba(255,255,255,0.06)]" />
        ))}
      </div>
    </div>
  );
}
