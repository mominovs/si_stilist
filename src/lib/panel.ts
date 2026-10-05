import { prisma } from "@/lib/db";
import { computeStats, type PanelStats, type RequestRow } from "@/lib/analytics";
import type { ParsedQuery } from "@/lib/query/schema";
import type { Period } from "@/lib/panel-periods";

export { parsePeriod, type Period } from "@/lib/panel-periods";

function since(period: Period): Date | undefined {
  const now = new Date();
  if (period === "bugun") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "7k") return new Date(now.getTime() - 7 * 86_400_000);
  if (period === "30k") return new Date(now.getTime() - 30 * 86_400_000);
  return undefined;
}

export async function loadPanelStats(period: Period): Promise<PanelStats & { period: Period }> {
  const from = since(period);
  const [rows, cats] = await Promise.all([
    prisma.request.findMany({
      where: from ? { createdAt: { gte: from } } : undefined,
      select: { id: true, createdAt: true, rawText: true, parsed: true, mode: true, status: true, resultCount: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.product.findMany({ distinct: ["category"], select: { category: true } }),
  ]);
  const stats = computeStats(
    rows.map((r): RequestRow => ({ ...r, parsed: (r.parsed as ParsedQuery | null) ?? null })),
    cats.map((c) => c.category),
  );
  return { ...stats, period };
}
