export default function DocsLoading() {
  return (
    <div className="flex h-full bg-[#12151D] animate-pulse">
      <aside className="w-56 flex-shrink-0 border-r border-[#262A35] bg-[#12151D] p-3 flex flex-col gap-2">
        <div className="h-4 w-24 bg-[#12151D] rounded mb-2" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-7 bg-[#12151D] rounded" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col p-8 gap-4">
        <div className="h-8 w-64 bg-[#12151D] rounded" />
        <div className="h-4 w-96 bg-[#1B1F2A] rounded" />
        <div className="flex-1 bg-[#12151D] rounded-xl border border-[#262A35]" />
      </div>
    </div>
  );
}
