import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface text-foreground flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-[10px] text-accent mb-2">404</p>
        <h1 className="text-4xl font-semibold mb-2">Page not found</h1>
        <p className="text-subtle text-sm">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/inbox" className="px-5 py-2.5 rounded-lg bg-accent/15 text-accent border border-accent/30 text-sm font-medium hover:bg-accent/25 transition-colors">
          Go to Inbox
        </Link>
        <Link href="/login" className="px-5 py-2.5 rounded-lg bg-surface-sunken text-muted text-sm font-medium hover:bg-hover transition-colors">
          Sign in
        </Link>
      </div>
    </div>
  );
}
