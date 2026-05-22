export default function MeetLoading() {
  return (
    <div className="h-full flex bg-[#0f1321]">
      <div className="w-72 border-r border-[rgba(0,255,255,0.08)] p-4 space-y-3">
        <div className="h-8 bg-[#262939] rounded animate-pulse" />
        <div className="h-9 bg-[#1b1f2e] rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#1b1f2e] rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[#00d2ff] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
