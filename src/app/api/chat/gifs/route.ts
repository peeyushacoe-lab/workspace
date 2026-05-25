import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

const GIPHY_KEY = process.env.GIPHY_API_KEY ?? "";
const BASE = "https://api.giphy.com/v1/gifs";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GIPHY_KEY) return NextResponse.json({ results: [] });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const type = searchParams.get("type") === "sticker" ? "stickers" : "gifs";

  const url = q
    ? `${BASE.replace("gifs", type)}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`
    : `${BASE.replace("gifs", type)}/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ results: [] });
    const json = await res.json() as { data: { id: string; title: string; images: { fixed_height: { url: string; width: string; height: string }; fixed_height_small: { url: string } } }[] };

    const results = json.data.map((g) => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.url,
      previewUrl: g.images.fixed_height_small.url,
      width: parseInt(g.images.fixed_height.width, 10),
      height: parseInt(g.images.fixed_height.height, 10),
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
