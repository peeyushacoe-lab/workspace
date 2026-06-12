export default function SocLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-white min-h-screen">
      <div className="h-8 w-48 bg-white rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-[#e8eaed]" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 bg-white rounded-xl border border-[#e8eaed]" />
        <div className="h-64 bg-white rounded-xl border border-[#e8eaed]" />
      </div>
    </div>
  );
}
