export default function AdminLoading() {
  return (
    <div className="flex h-full bg-[#12151D] animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-[#262A35] bg-[#12151D] p-4 flex flex-col gap-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-9 bg-[#12151D] rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-7 w-48 bg-[#12151D] rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-[#12151D] rounded-xl border border-[#262A35]" />
          ))}
        </div>
        <div className="flex-1 bg-[#12151D] rounded-xl border border-[#262A35]" />
      </div>
    </div>
  );
}
