export default function DriveLoading() {
  return (
    <div className="flex h-full bg-[#0f1321] animate-pulse">
      <aside className="w-56 flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] bg-[#0a0d1c] p-3 flex flex-col gap-1.5">
        <div className="h-4 w-24 bg-[#1b1f2e] rounded mb-3" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-[#1b1f2e] rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b border-[rgba(255,255,255,0.06)] flex items-center px-4 gap-3">
          <div className="h-5 w-32 bg-[#1b1f2e] rounded" />
          <div className="flex-1" />
          <div className="h-8 w-28 bg-[#1b1f2e] rounded-lg" />
        </div>
        <div className="flex-1 p-6 grid grid-cols-4 gap-4 content-start">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
