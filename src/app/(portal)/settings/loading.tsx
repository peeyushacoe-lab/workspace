export default function SettingsLoading() {
  return (
    <div className="flex h-full bg-[#0f1321] animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-[rgba(0,255,255,0.08)] bg-[#0a0d1c] p-4 flex flex-col gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-9 bg-[#1b1f2e] rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-6">
        <div className="h-7 w-40 bg-[#1b1f2e] rounded" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
          <div className="h-64 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
        </div>
      </div>
    </div>
  );
}
