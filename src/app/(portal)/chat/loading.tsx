export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#12151D] overflow-hidden animate-pulse">
      <div className="w-64 bg-[#12151D] flex flex-col flex-shrink-0 p-4 gap-3 border-r border-[#262A35]">
        <div className="h-5 w-36 bg-[#12151D] rounded" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-[#12151D] rounded-lg" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-[#262A35] flex items-center px-6 gap-3">
          <div className="h-5 w-40 bg-[#12151D] rounded" />
        </div>
        <div className="flex-1 overflow-hidden p-4 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[#12151D] flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-24 bg-[#12151D] rounded" />
                <div className="h-3 w-3/4 bg-[#1B1F2A] rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-20 border-t border-[#262A35] bg-[#12151D]" />
      </div>
    </div>
  );
}
