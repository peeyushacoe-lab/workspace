export default function DriveLoading() {
  return (
    <div className="flex h-full bg-[#12151D] animate-pulse">
      <aside className="w-56 flex-shrink-0 border-r border-[#262A35] bg-[#12151D] p-3 flex flex-col gap-1.5">
        <div className="h-4 w-24 bg-[#12151D] rounded mb-3" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-[#12151D] rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b border-[#262A35] flex items-center px-4 gap-3">
          <div className="h-5 w-32 bg-[#12151D] rounded" />
          <div className="flex-1" />
          <div className="h-8 w-28 bg-[#12151D] rounded-lg" />
        </div>
        <div className="flex-1 p-6 grid grid-cols-4 gap-4 content-start">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-[#12151D] rounded-xl border border-[#262A35]" />
          ))}
        </div>
      </div>
    </div>
  );
}
