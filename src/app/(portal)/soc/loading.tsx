export default function SocLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-[#12151D] min-h-screen">
      <div className="h-8 w-48 bg-[#12151D] rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-[#12151D] rounded-xl border border-[#262A35]" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 bg-[#12151D] rounded-xl border border-[#262A35]" />
        <div className="h-64 bg-[#12151D] rounded-xl border border-[#262A35]" />
      </div>
    </div>
  );
}
