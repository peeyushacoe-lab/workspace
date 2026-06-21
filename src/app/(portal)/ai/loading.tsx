export default function AiLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#12151D] animate-pulse overflow-hidden">
      <div className="flex-1 flex flex-col p-6 gap-4 max-w-3xl mx-auto w-full">
        <div className="h-8 w-48 bg-[#12151D] rounded" />
        <div className="h-4 w-80 bg-[#1B1F2A] rounded" />
        <div className="flex-1 bg-[#12151D] rounded-xl border border-[#262A35]" />
        <div className="h-14 bg-[#12151D] rounded-xl border border-[#262A35]" />
      </div>
    </div>
  );
}
