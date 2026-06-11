export default function DocsLoading() {
  return (
    <div className="flex h-full bg-[#0f1321] animate-pulse">
      <aside className="w-56 flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] bg-[#0a0d1c] p-3 flex flex-col gap-2">
        <div className="h-4 w-24 bg-[#1b1f2e] rounded mb-2" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-7 bg-[#1b1f2e] rounded" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col p-8 gap-4">
        <div className="h-8 w-64 bg-[#1b1f2e] rounded" />
        <div className="h-4 w-96 bg-[#262939] rounded" />
        <div className="flex-1 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
      </div>
    </div>
  );
}
