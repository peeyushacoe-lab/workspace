export default function ContactsLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6">
      <div className="h-8 w-40 bg-white rounded" />
      <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-[#e8eaed]">
            <div className="h-8 w-8 rounded-full bg-[#f1f3f4]" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 w-32 bg-[#f1f3f4] rounded" />
              <div className="h-3 w-48 bg-[#303444] rounded" />
            </div>
            <div className="h-5 w-16 bg-[#303444] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
