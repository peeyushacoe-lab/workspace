export default function CalendarLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4 bg-[#12151D] min-h-screen">
      <div className="h-8 w-40 bg-[#12151D] rounded" />
      <div className="flex gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex-1 h-8 bg-[#12151D] rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="h-24 bg-[#12151D] rounded-lg border border-[#262A35]" />
        ))}
      </div>
    </div>
  );
}
