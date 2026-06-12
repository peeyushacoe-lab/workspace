export default function DashboardLoading() {
  return (
    <div className="p-8 animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-64 bg-white rounded-lg mb-2" />
        <div className="h-4 w-80 bg-[#f1f3f4] rounded" />
      </div>
      <div className="grid lg:grid-cols-[1fr_350px] gap-8">
        <div className="space-y-4">
          <div className="h-7 w-40 bg-white rounded" />
          <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden">
            <div className="divide-y divide-[rgba(255,255,255,0.05)]">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-[#f1f3f4] flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 bg-[#f1f3f4] rounded" />
                    <div className="h-3 w-56 bg-[#303444] rounded" />
                  </div>
                  <div className="h-5 w-16 bg-[#303444] rounded-full" />
                  <div className="h-3 w-20 bg-[#303444] rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-7 w-36 bg-white rounded" />
          <div className="bg-white rounded-xl border border-[#e8eaed] h-96" />
        </div>
      </div>
    </div>
  );
}
