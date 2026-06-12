export default function DocsLoading() {
  return (
    <div className="flex h-full bg-white animate-pulse">
      <aside className="w-56 flex-shrink-0 border-r border-[#e8eaed] bg-[#f8fafd] p-3 flex flex-col gap-2">
        <div className="h-4 w-24 bg-white rounded mb-2" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-7 bg-white rounded" />
        ))}
      </aside>
      <div className="flex-1 flex flex-col p-8 gap-4">
        <div className="h-8 w-64 bg-white rounded" />
        <div className="h-4 w-96 bg-[#f1f3f4] rounded" />
        <div className="flex-1 bg-white rounded-xl border border-[#e8eaed]" />
      </div>
    </div>
  );
}
