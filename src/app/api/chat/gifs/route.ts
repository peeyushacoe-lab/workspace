import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

const GIPHY_KEY = process.env.GIPHY_API_KEY ?? "";
const BASE = "https://api.giphy.com/v1/gifs";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // `configured` tells the picker WHY the list is empty. Previously this route
  // just returned `{ results: [] }` for a missing key, an invalid key, a rate
  // limit, and a genuine no-matches search — indistinguishable to the client,
  // so "GIFs don't work" produced no signal to debug from. The client-side
  // code also used to guess at this by reading `NEXT_PUBLIC_GIPHY_KEY`, a
  // variable that was never set anywhere (the real key is server-only
  // `GIPHY_API_KEY`), so the "not configured" message showed unconditionally
  // regardless of whether the key was actually present.
  if (!GIPHY_KEY) return NextResponse.json({ results: [], configured: false });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const type = searchParams.get("type") === "sticker" ? "stickers" : "gifs";

  const url = q
    ? `${BASE.replace("gifs", type)}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`
    : `${BASE.replace("gifs", type)}/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      // Surface the failure server-side instead of swallowing it — a 401/403
      // here almost always means the key is present but wrong/revoked, which
      // "configured: false" would mislabel as "no key set".
      const body = await res.text().catch(() => "");
      console.error(`[api/chat/gifs] Giphy ${type} request failed: ${res.status} ${body.slice(0, 300)}`);
      return NextResponse.json(
        { results: [], configured: true, error: res.status === 401 || res.status === 403 ? "invalid_key" : "upstream" },
        { status: 200 },
      );
    }
    const json = await res.json() as { data: { id: string; title: string; images: { fixed_height: { url: string; width: string; height: string }; fixed_height_small: { url: string } } }[] };

    const results = json.data.map((g) => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.url,
      previewUrl: g.images.fixed_height_small.url,
      width: parseInt(g.images.fixed_height.width, 10),
      height: parseInt(g.images.fixed_height.height, 10),
    }));

    return NextResponse.json({ results, configured: true });
  } catch (err) {
    console.error("[api/chat/gifs] request threw:", err);
    return NextResponse.json({ results: [], configured: true, error: "upstream" });
  }
}
