import { NextRequest, NextResponse }  from "next/server";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { prisma }                     from "@/lib/prisma";
import { runIntegrationSync }         from "@/lib/hospitality/sync";

// POST /api/hospitality/integrations/[id]/sync
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireHospitalityApi("manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id }   = await params;

  // Demo IDs bypass org check.
  if (!id.startsWith("demo-integration-") && !id.startsWith("demo-int-")) {
    try {
      const row = await prisma.hotelIntegration.findUnique({
        where:   { id },
        include: { property: { select: { organizationId: true } } },
      });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (row.property.organizationId !== (user.organizationId ?? null)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }
  }

  const result = await runIntegrationSync(id, user.id);
  const status  = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
