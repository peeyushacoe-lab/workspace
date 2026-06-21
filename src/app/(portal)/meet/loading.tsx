export default function MeetLoading() {
  return (
    <div className="h-full flex bg-[#12151D]">
      <div className="w-72 border-r border-[#262A35] p-4 space-y-3">
        <div className="h-8 bg-[#1B1F2A] rounded animate-pulse" />
        <div className="h-9 bg-[#12151D] rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#12151D] rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[#00C2FF] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
