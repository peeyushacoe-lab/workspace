export default function AdminLoading() {
  return (
    <div className="flex h-full bg-[#0f1321] animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] bg-[#0a0d1c] p-4 flex flex-col gap-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-9 bg-[#1b1f2e] rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-7 w-48 bg-[#1b1f2e] rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
        <div className="flex-1 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
      </div>
    </div>
  );
}
