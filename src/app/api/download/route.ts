import { NextResponse, type NextRequest } from "next/server";

// No auth required — this is a public download endpoint.
// GET /api/download?os=win  → 302 to latest Windows .exe
// GET /api/download?os=mac  → 302 to latest macOS .dmg
// GET /api/download?os=linux → 302 to latest Linux .AppImage

const REPO = "peeyushacoe-lab/workspace";

type GHAsset = { name: string; browser_download_url: string };
type GHRelease = { tag_name: string; assets: GHAsset[] };

const EXT: Record<string, string> = {
  win:   ".exe",
  mac:   ".dmg",
  linux: ".AppImage",
  deb:   ".deb",
};

async function getLatestRelease(): Promise<GHRelease | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<GHRelease>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const os = request.nextUrl.searchParams.get("os") ?? "win";
  const ext = EXT[os] ?? ".exe";

  const release = await getLatestRelease();

  if (!release || release.assets.length === 0) {
    // No release yet — send them to the GitHub releases page
    return NextResponse.redirect(
      `https://github.com/${REPO}/releases`,
      { status: 302 },
    );
  }

  const asset = release.assets.find((a) =>
    a.name.toLowerCase().endsWith(ext),
  );

  if (!asset) {
    // Right OS not in this release — fall back to releases page
    return NextResponse.redirect(
      `https://github.com/${REPO}/releases/tag/${release.tag_name}`,
      { status: 302 },
    );
  }

  // 302 redirect → browser downloads the file, user stays on the current page
  return NextResponse.redirect(asset.browser_download_url, { status: 302 });
}
