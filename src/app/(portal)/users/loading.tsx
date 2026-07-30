export default function UsersLoading() {
  return (
    <div className="p-8 animate-pulse space-y-6">
      <div className="h-8 w-56 bg-surface rounded" />
      <div className="h-4 w-80 bg-surface-sunken rounded" />
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex gap-4">
          {["Name","Work Email","Role","Status","Joined"].map((h) => (
            <div key={h} className="h-4 w-24 bg-surface-sunken rounded" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-border">
            <div className="h-4 w-32 bg-surface-sunken rounded" />
            <div className="h-4 w-40 bg-hover rounded" />
            <div className="h-5 w-16 bg-hover rounded-full" />
            <div className="h-5 w-16 bg-hover rounded-full" />
            <div className="h-4 w-20 bg-hover rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
