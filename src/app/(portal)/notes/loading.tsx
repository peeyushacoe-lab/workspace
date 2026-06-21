export default function NotesLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#12151D] animate-pulse overflow-hidden">
      <div className="w-64 bg-[#12151D] border-r border-[#262A35] p-4 flex flex-col gap-3">
        <div className="h-9 bg-[#12151D] rounded-lg" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-[#12151D] rounded-lg" />
        ))}
      </div>
      <div className="flex-1 p-8 flex flex-col gap-4">
        <div className="h-8 w-48 bg-[#12151D] rounded" />
        <div className="flex-1 bg-[#12151D] rounded-xl border border-[#262A35]" />
      </div>
    </div>
  );
}
