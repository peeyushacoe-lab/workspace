export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-7.25rem)] lg:h-full lg:h-full bg-surface overflow-hidden animate-pulse">
      <div className="w-64 bg-surface flex flex-col flex-shrink-0 p-4 gap-3 border-r border-border">
        <div className="h-5 w-36 bg-surface rounded" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-surface rounded-lg" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-border flex items-center px-6 gap-3">
          <div className="h-5 w-40 bg-surface rounded" />
        </div>
        <div className="flex-1 overflow-hidden p-4 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-surface flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-24 bg-surface rounded" />
                <div className="h-3 w-3/4 bg-surface-sunken rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-20 border-t border-border bg-surface" />
      </div>
    </div>
  );
}
