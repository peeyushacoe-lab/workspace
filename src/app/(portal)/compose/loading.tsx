export default function ComposeLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-[#0f1321] min-h-screen">
      <div className="h-8 w-40 bg-[#1b1f2e] rounded" />
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
            ))}
          </div>
          <div className="h-64 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
          <div className="h-10 w-36 bg-[#1b1f2e] rounded-lg" />
        </div>
        <div className="h-96 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
      </div>
    </div>
  );
}
