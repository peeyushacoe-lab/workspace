import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white text-[#202124] flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-[10px] text-[#1a56db] mb-2">404</p>
        <h1 className="text-4xl font-semibold mb-2">Page not found</h1>
        <p className="text-[#9aa0a6] text-sm">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/inbox" className="px-5 py-2.5 rounded-lg bg-[#1a56db]/15 text-[#1a56db] border border-[#1a56db]/30 text-sm font-medium hover:bg-[#1a56db]/25 transition-colors">
          Go to Inbox
        </Link>
        <Link href="/login" className="px-5 py-2.5 rounded-lg bg-[#f1f3f4] text-[#5f6368] text-sm font-medium hover:bg-[#2e3347] transition-colors">
          Sign in
        </Link>
      </div>
    </div>
  );
}
