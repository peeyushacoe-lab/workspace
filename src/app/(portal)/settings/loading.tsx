export default function SettingsLoading() {
  return (
    <div className="flex h-full bg-[#12151D] animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-[#262A35] bg-[#12151D] p-4 flex flex-col gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-9 bg-[#12151D] rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-6">
        <div className="h-7 w-40 bg-[#12151D] rounded" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-[#12151D] rounded-xl border border-[#262A35]" />
          <div className="h-64 bg-[#12151D] rounded-xl border border-[#262A35]" />
        </div>
      </div>
    </div>
  );
}
