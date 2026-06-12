export default function AiLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-white animate-pulse overflow-hidden">
      <div className="flex-1 flex flex-col p-6 gap-4 max-w-3xl mx-auto w-full">
        <div className="h-8 w-48 bg-white rounded" />
        <div className="h-4 w-80 bg-[#f1f3f4] rounded" />
        <div className="flex-1 bg-white rounded-xl border border-[#e8eaed]" />
        <div className="h-14 bg-white rounded-xl border border-[#e8eaed]" />
      </div>
    </div>
  );
}
