export default function ProfileLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-[#12151D] min-h-screen max-w-2xl">
      <div className="h-8 w-32 bg-[#12151D] rounded" />
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 bg-[#12151D] rounded-full" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-[#12151D] rounded" />
          <div className="h-4 w-56 bg-[#1B1F2A] rounded" />
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 bg-[#12151D] rounded-xl border border-[#262A35]" />
      ))}
    </div>
  );
}
