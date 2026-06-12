export default function NotesLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-white animate-pulse overflow-hidden">
      <div className="w-64 bg-[#f8fafd] border-r border-[#e8eaed] p-4 flex flex-col gap-3">
        <div className="h-9 bg-white rounded-lg" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-lg" />
        ))}
      </div>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-8 w-48 bg-white rounded" />
        <div className="flex-1 bg-white rounded-xl border border-[#e8eaed]" />
      </div>
    </div>
  );
}
