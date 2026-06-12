import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download CyberSage Desktop",
  description: "Download the CyberSage desktop app for Windows, macOS, and Linux.",
};

const REPO = "peeyushacoe-lab/workspace";
const GH_RELEASES = `https://api.github.com/repos/${REPO}/releases`;

type GHAsset = { name: string; browser_download_url: string; size: number };
type GHRelease = {
  tag_name: string;
  name: string;
  published_at: string;
  assets: GHAsset[];
};

type Platform = {
  key: string;
  label: string;
  icon: string;
  ext: string;
  hint: string;
  badge?: string;
};

const PLATFORMS: Platform[] = [
  { key: "win",   label: "Windows",  icon: "🪟", ext: ".exe",      hint: "Windows 10/11 · 64-bit", badge: "NSIS Installer" },
  { key: "mac",   label: "macOS",    icon: "🍎", ext: ".dmg",      hint: "macOS 12+ · Intel & Apple Silicon" },
  { key: "linux", label: "Linux",    icon: "🐧", ext: ".AppImage", hint: "Any Linux distro · 64-bit" },
  { key: "deb",   label: "Debian",   icon: "📦", ext: ".deb",      hint: "Ubuntu, Debian, Mint" },
];

async function getLatestRelease(): Promise<GHRelease | null> {
  try {
    const res = await fetch(`${GH_RELEASES}/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 }, // cache 5 minutes
    });
    if (!res.ok) return null;
    return res.json() as Promise<GHRelease>;
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function findAsset(assets: GHAsset[], ext: string): GHAsset | undefined {
  return assets.find((a) => a.name.toLowerCase().endsWith(ext));
}

const STEPS = [
  { n: "1", title: "Download",  desc: "Click the installer for your operating system below." },
  { n: "2", title: "Install",   desc: "Run the installer and follow the setup wizard (Windows) or drag to Applications (macOS)." },
  { n: "3", title: "Sign in",   desc: "CyberSage opens automatically. Log in with your existing account." },
];

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const version = release?.tag_name.replace("desktop-v", "") ?? null;
  const assets = release?.assets ?? [];
  const hasRelease = assets.length > 0;

  return (
    <div className="min-h-screen bg-[#f8fafd] text-[#202124]">
      {/* Nav */}
      <nav className="border-b border-[#e8eaed]">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-semibold text-[#1a56db]">CyberSage</Link>
          <Link href="/login" className="text-sm text-[#9aa0a6] hover:text-[#5f6368] transition-colors">Sign in →</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-[#1a56db]/10 border border-[#1a56db]/20 rounded-full px-4 py-1.5 text-xs text-[#7dd8f5] mb-6">
            Desktop app · Free for all plans
          </div>
          <h1 className="text-4xl font-semibold text-white mb-4 tracking-tight">
            CyberSage Desktop
          </h1>
          <p className="text-[#8899a6] text-lg max-w-xl mx-auto">
            Your full workspace in a native app — system tray, notifications, offline
            access, and auto-updates. No browser required.
          </p>
          {version && (
            <p className="mt-3 text-xs text-[#9aa0a6]">Latest version: <span className="text-[#1a56db]">{version}</span></p>
          )}
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-white border border-[#e8eaed] rounded-xl p-5">
              <div className="w-8 h-8 rounded-lg bg-[#1a56db]/15 text-[#1a56db] font-semibold text-sm flex items-center justify-center mb-3">{s.n}</div>
              <p className="font-semibold text-white text-sm mb-1">{s.title}</p>
              <p className="text-xs text-[#8899a6] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Download cards */}
        {!hasRelease ? (
          <div className="bg-white border border-[#e8eaed] rounded-2xl p-10 text-center">
            <p className="text-2xl mb-3">🚧</p>
            <p className="font-semibold text-white mb-2">Desktop app coming soon</p>
            <p className="text-sm text-[#8899a6] mb-6">
              We&apos;re finishing the first release. In the meantime,{" "}
              <Link href="/login" className="text-[#1a56db] hover:underline">use the web app</Link>{" "}
              — it works great in your browser.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1a56db] text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm"
            >
              Open web app →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            {PLATFORMS.map((p) => {
              const asset = findAsset(assets, p.ext);
              return (
                <div
                  key={p.key}
                  className="bg-white border border-[#e8eaed] rounded-xl p-6 hover:border-[#1a56db]/20 transition-colors"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{p.icon}</span>
                      <div>
                        <p className="font-semibold text-white">{p.label}</p>
                        <p className="text-xs text-[#9aa0a6]">{p.hint}</p>
                      </div>
                    </div>
                    {p.badge && (
                      <span className="text-[10px] text-[#1a56db] bg-[#1a56db]/10 px-2 py-0.5 rounded-full font-medium">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  {asset ? (
                    <a
                      href={asset.browser_download_url}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#1a56db] text-white font-semibold text-sm rounded-lg hover:opacity-90 transition-opacity"
                    >
                      ↓ Download · {formatSize(asset.size)}
                    </a>
                  ) : (
                    <div className="flex items-center justify-center w-full py-2.5 bg-[#f1f3f4] text-[#9aa0a6] text-sm rounded-lg">
                      Not available in this release
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* All releases link */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-[#e8eaed] rounded-xl px-5 py-4 text-sm">
          <div>
            <p className="font-medium text-white">Need an older version?</p>
            <p className="text-[#9aa0a6] text-xs mt-0.5">All releases with changelogs are on GitHub.</p>
          </div>
          <a
            href={`https://github.com/${REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1a56db] hover:underline flex-shrink-0"
          >
            View all releases →
          </a>
        </div>

        {/* Already have account */}
        <p className="text-center text-sm text-[#9aa0a6] mt-10">
          Don&apos;t have an account yet?{" "}
          <Link href="/register" className="text-[#1a56db] hover:underline">Create one free</Link>
          {" "}— it takes 30 seconds.
        </p>
      </div>
    </div>
  );
}
