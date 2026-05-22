export default function ContactsLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6">
      <div className="h-8 w-40 bg-[#1b1f2e] rounded" />
      <div className="bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)] overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-[rgba(0,255,255,0.08)]">
            <div className="h-8 w-8 rounded-full bg-[#262939]" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 w-32 bg-[#262939] rounded" />
              <div className="h-3 w-48 bg-[#303444] rounded" />
            </div>
            <div className="h-5 w-16 bg-[#303444] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
