export default function AdminLoading() {
  return (
    <div className="flex h-full bg-white animate-pulse">
      <aside className="w-52 flex-shrink-0 border-r border-[#e8eaed] bg-[#f8fafd] p-4 flex flex-col gap-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-9 bg-white rounded-lg" />
        ))}
      </aside>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-7 w-48 bg-white rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-[#e8eaed]" />
          ))}
        </div>
        <div className="flex-1 bg-white rounded-xl border border-[#e8eaed]" />
      </div>
    </div>
  );
}
