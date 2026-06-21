export default function ContactsLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6">
      <div className="h-8 w-40 bg-[#12151D] rounded" />
      <div className="bg-[#12151D] rounded-xl border border-[#262A35] overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-[#262A35]">
            <div className="h-8 w-8 rounded-full bg-[#1B1F2A]" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 w-32 bg-[#1B1F2A] rounded" />
              <div className="h-3 w-48 bg-[#303444] rounded" />
            </div>
            <div className="h-5 w-16 bg-[#303444] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
