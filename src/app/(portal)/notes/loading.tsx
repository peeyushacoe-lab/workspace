export default function NotesLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0f1321] animate-pulse overflow-hidden">
      <div className="w-64 bg-[#0a0d1c] border-r border-[rgba(255,255,255,0.06)] p-4 flex flex-col gap-3">
        <div className="h-9 bg-[#1b1f2e] rounded-lg" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-[#1b1f2e] rounded-lg" />
        ))}
      </div>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-8 w-48 bg-[#1b1f2e] rounded" />
        <div className="flex-1 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
      </div>
    </div>
  );
}
