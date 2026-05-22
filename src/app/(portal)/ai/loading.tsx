export default function AiLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0f1321] animate-pulse overflow-hidden">
      <div className="flex-1 flex flex-col p-6 gap-4 max-w-3xl mx-auto w-full">
        <div className="h-8 w-48 bg-[#1b1f2e] rounded" />
        <div className="h-4 w-80 bg-[#262939] rounded" />
        <div className="flex-1 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
        <div className="h-14 bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)]" />
      </div>
    </div>
  );
}
