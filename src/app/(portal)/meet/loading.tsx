export default function MeetLoading() {
  return (
    <div className="h-full flex bg-white">
      <div className="w-72 border-r border-[#e8eaed] p-4 space-y-3">
        <div className="h-8 bg-[#f1f3f4] rounded animate-pulse" />
        <div className="h-9 bg-white rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
