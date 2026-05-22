export default function ProfileLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6 bg-[#0f1321] min-h-screen max-w-2xl">
      <div className="h-8 w-32 bg-[#1b1f2e] rounded" />
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 bg-[#1b1f2e] rounded-full" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-[#1b1f2e] rounded" />
          <div className="h-4 w-56 bg-[#262939] rounded" />
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
      ))}
    </div>
  );
}
