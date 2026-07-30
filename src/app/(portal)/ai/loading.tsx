export default function AiLoading() {
  return (
    <div className="flex h-[calc(100vh-7.25rem)] lg:h-full lg:h-full bg-surface animate-pulse overflow-hidden">
      <div className="flex-1 flex flex-col p-6 gap-4 max-w-3xl mx-auto w-full">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-4 w-80 bg-surface-sunken rounded" />
        <div className="flex-1 bg-surface rounded-xl border border-border" />
        <div className="h-14 bg-surface rounded-xl border border-border" />
      </div>
    </div>
  );
}
