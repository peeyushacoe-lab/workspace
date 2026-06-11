import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResourceType = "room" | "equipment" | "vehicle";

export type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  capacity?: number;
  location?: string;
  description?: string;
  available: boolean;
  createdAt: string;
};

// ─── Redis key ────────────────────────────────────────────────────────────────

const REGISTRY_KEY = "resources:registry"; // hash: id → JSON

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAllResources(): Promise<Resource[]> {
  const raw = await redis.hgetall(REGISTRY_KEY);
  if (!raw) return [];
  return Object.values(raw).map((v) => JSON.parse(v) as Resource);
}

// ─── GET /api/admin/resources ─────────────────────────────────────────────────
// Anyone authenticated can list resources.
// Optional query param: ?type=room|equipment|vehicle
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const typeFilter = req.nextUrl.searchParams.get("type") as ResourceType | null;

  let resources = await getAllResources();

  if (typeFilter) {
    resources = resources.filter((r) => r.type === typeFilter);
  }

  resources.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json(resources);
}

// ─── POST /api/admin/resources ────────────────────────────────────────────────
// ADMIN only. Body: Partial<Resource> minus id/createdAt.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as Partial<Resource>;

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.type || !["room", "equipment", "vehicle"].includes(body.type)) {
    return NextResponse.json({ error: "type must be room, equipment, or vehicle" }, { status: 400 });
  }

  const resource: Resource = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    type: body.type as ResourceType,
    capacity: body.type === "room" && body.capacity != null ? Number(body.capacity) : undefined,
    location: body.location?.trim() ?? undefined,
    description: body.description?.trim() ?? undefined,
    available: body.available !== false,
    createdAt: new Date().toISOString(),
  };

  await redis.hset(REGISTRY_KEY, resource.id, JSON.stringify(resource));

  return NextResponse.json(resource, { status: 201 });
}

// ─── PATCH /api/admin/resources ───────────────────────────────────────────────
// ADMIN only. Body must include `id`.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as Partial<Resource> & { id?: string };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await redis.hget(REGISTRY_KEY, body.id);
  if (!existing) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  const current = JSON.parse(existing) as Resource;

  const updated: Resource = {
    ...current,
    name: body.name?.trim() ?? current.name,
    type: (body.type as ResourceType | undefined) ?? current.type,
    capacity:
      body.capacity != null
        ? Number(body.capacity)
        : current.capacity,
    location: body.location?.trim() ?? current.location,
    description: body.description?.trim() ?? current.description,
    available: body.available !== undefined ? Boolean(body.available) : current.available,
  };

  await redis.hset(REGISTRY_KEY, updated.id, JSON.stringify(updated));

  return NextResponse.json(updated);
}

// ─── DELETE /api/admin/resources?id=xxx ───────────────────────────────────────
// ADMIN only.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const existing = await redis.hget(REGISTRY_KEY, id);
  if (!existing) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  await redis.hdel(REGISTRY_KEY, id);
  // Also purge all bookings for this resource
  await redis.del(`resource:bookings:${id}`);

  return NextResponse.json({ ok: true });
}
