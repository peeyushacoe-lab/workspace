export default function ComposeLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-white min-h-screen">
      <div className="h-8 w-40 bg-white rounded" />
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-white rounded-xl border border-[#e8eaed]" />
            ))}
          </div>
          <div className="h-64 bg-white rounded-xl border border-[#e8eaed]" />
          <div className="h-10 w-36 bg-white rounded-lg" />
        </div>
        <div className="h-96 bg-white rounded-xl border border-[#e8eaed]" />
      </div>
    </div>
  );
}
