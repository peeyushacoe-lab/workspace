export default function SocLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-[#0f1321] min-h-screen">
      <div className="h-8 w-48 bg-[#1b1f2e] rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
        <div className="h-64 bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)]" />
      </div>
    </div>
  );
}
