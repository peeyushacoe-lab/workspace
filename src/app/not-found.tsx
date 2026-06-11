import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6] flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-[10px] text-[#00d2ff] mb-2">404</p>
        <h1 className="text-4xl font-semibold mb-2">Page not found</h1>
        <p className="text-[#5d6579] text-sm">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/inbox" className="px-5 py-2.5 rounded-lg bg-[#00d2ff]/15 text-[#00d2ff] border border-[#00d2ff]/30 text-sm font-medium hover:bg-[#00d2ff]/25 transition-colors">
          Go to Inbox
        </Link>
        <Link href="/login" className="px-5 py-2.5 rounded-lg bg-[#262939] text-[#9aa3b8] text-sm font-medium hover:bg-[#2e3347] transition-colors">
          Sign in
        </Link>
      </div>
    </div>
  );
}
