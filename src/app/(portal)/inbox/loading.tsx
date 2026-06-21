export default function InboxLoading() {
  return (
    <div className="p-8">
      <div className="mb-8 animate-pulse">
        <div className="h-8 w-48 bg-[#12151D] rounded-lg mb-2" />
        <div className="h-4 w-72 bg-[#1B1F2A] rounded" />
      </div>
      <div className="flex h-[calc(100vh-130px)] bg-[#12151D] rounded-xl border border-[#262A35] overflow-hidden">
        <div className="hidden md:flex w-44 flex-shrink-0 flex-col border-r border-[#262A35] bg-[#12151D] p-3 gap-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-[#12151D] rounded-lg" />
          ))}
        </div>
        <div className="w-72 flex-shrink-0 border-r border-[#262A35] flex flex-col">
          <div className="p-3 border-b border-[#262A35] space-y-2 animate-pulse">
            <div className="h-6 w-24 bg-[#1B1F2A] rounded" />
            <div className="h-7 bg-[#12151D] rounded-lg" />
          </div>
          <div className="flex-1 divide-y divide-[rgba(255,255,255,0.05)] animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-3 flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-[#1B1F2A] flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-3/4 bg-[#1B1F2A] rounded" />
                  <div className="h-3 w-1/2 bg-[#303444] rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 bg-[#12151D] flex items-center justify-center">
          <div className="text-[#8A92A6]/40 text-sm">Loading inbox…</div>
        </div>
      </div>
    </div>
  );
}
