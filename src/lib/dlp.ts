import { prisma } from "@/lib/prisma";

type ScanResult = {
  violated: boolean;
  policyId: string;
  policyName: string;
  action: string;
  severity: string;
  snippets: string[];
};

/**
 * Scan text content against all active DLP policies for a given scope.
 * scope: "email" | "drive" | "chat"
 */
export async function scanContent(
  content: string,
  scope: string,
  resourceType: string,
  resourceId: string,
  userId?: string,
): Promise<ScanResult[]> {
  const policies = await prisma.dLPPolicy.findMany({
    where: { isActive: true, scope: { has: scope } },
  });

  const results: ScanResult[] = [];

  for (const policy of policies) {
    const patterns = policy.patterns as Array<{ type: string; value: string }>;
    const snippets: string[] = [];

    for (const pat of patterns) {
      if (pat.type === "keyword") {
        if (content.toLowerCase().includes(pat.value.toLowerCase())) {
          // Extract surrounding snippet
          const idx = content.toLowerCase().indexOf(pat.value.toLowerCase());
          snippets.push(content.slice(Math.max(0, idx - 30), idx + pat.value.length + 30));
        }
      } else if (pat.type === "regex") {
        try {
          const re = new RegExp(pat.value, "gi");
          const match = re.exec(content);
          if (match) snippets.push(match[0]);
        } catch {
          // invalid regex — skip
        }
      }
    }

    if (snippets.length > 0) {
      results.push({
        violated: true,
        policyId: policy.id,
        policyName: policy.name,
        action: policy.action,
        severity: policy.severity,
        snippets: snippets.slice(0, 3),
      });

      // Persist violation
      await prisma.dLPViolation.create({
        data: {
          policyId: policy.id,
          userId: userId ?? null,
          resourceType,
          resourceId,
          snippet: snippets[0] ?? null,
          action: policy.action,
        },
      }).catch(() => {});
    }
  }

  return results;
}
