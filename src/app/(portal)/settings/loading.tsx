export default function SettingsLoading() {
  return (
    <div className="flex h-full bg-white animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-[#e8eaed] bg-[#f8fafd] p-4 flex flex-col gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-9 bg-white rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-6">
        <div className="h-7 w-40 bg-white rounded" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-white rounded-xl border border-[#e8eaed]" />
          <div className="h-64 bg-white rounded-xl border border-[#e8eaed]" />
        </div>
      </div>
    </div>
  );
}
