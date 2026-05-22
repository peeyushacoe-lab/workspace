export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0f1321] overflow-hidden animate-pulse">
      <div className="w-64 bg-[#0a0d1c] flex flex-col flex-shrink-0 p-4 gap-3 border-r border-[rgba(0,255,255,0.08)]">
        <div className="h-5 w-36 bg-[#1b1f2e] rounded" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-[#1b1f2e] rounded-lg" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-[rgba(0,255,255,0.08)] flex items-center px-6 gap-3">
          <div className="h-5 w-40 bg-[#1b1f2e] rounded" />
        </div>
        <div className="flex-1 overflow-hidden p-4 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[#1b1f2e] flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-24 bg-[#1b1f2e] rounded" />
                <div className="h-3 w-3/4 bg-[#262939] rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-20 border-t border-[rgba(0,255,255,0.08)] bg-[#1b1f2e]" />
      </div>
    </div>
  );
}
