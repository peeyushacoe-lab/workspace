export default function UsersLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6">
      <div className="h-8 w-56 bg-[#1b1f2e] rounded" />
      <div className="h-4 w-80 bg-[#262939] rounded" />
      <div className="bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] flex gap-4">
          {["Name","Work Email","Role","Status","Joined"].map((h) => (
            <div key={h} className="h-4 w-24 bg-[#262939] rounded" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-[rgba(255,255,255,0.05)]">
            <div className="h-4 w-32 bg-[#262939] rounded" />
            <div className="h-4 w-40 bg-[#303444] rounded" />
            <div className="h-5 w-16 bg-[#303444] rounded-full" />
            <div className="h-5 w-16 bg-[#303444] rounded-full" />
            <div className="h-4 w-20 bg-[#303444] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
