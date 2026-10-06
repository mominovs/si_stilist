import { prisma } from "@/lib/db";
import { computeStats, type PanelStats, type RequestRow } from "@/lib/analytics";
import { withDefaults, type ParsedQuery } from "@/lib/query/schema";
import type { Period } from "@/lib/panel-periods";

export { parsePeriod, type Period } from "@/lib/panel-periods";

function since(period: Period): Date | undefined {
  const now = new Date();
  if (period === "bugun") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "7k") return new Date(now.getTime() - 7 * 86_400_000);
  if (period === "30k") return new Date(now.getTime() - 30 * 86_400_000);
  return undefined;
}

/** Xaridor sotuvchiga ko'rsatgan tovar: sotuvchi panelda kod bo'yicha topadi */
export type Reservation = { id: number; code: string; name: string; sku: string | null; size: string; at: string };

export async function loadPanelStats(period: Period): Promise<PanelStats & { period: Period; reservations: Reservation[] }> {
  const from = since(period);
  const [rows, cats, reserved] = await Promise.all([
    prisma.request.findMany({
      where: from ? { createdAt: { gte: from } } : undefined,
      select: {
        id: true,
        createdAt: true,
        rawText: true,
        parsed: true,
        mode: true,
        status: true,
        resultCount: true,
        feedback: true,
        _count: { select: { results: { where: { reservedAt: { not: null } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.product.findMany({ distinct: ["category"], select: { category: true } }),
    prisma.requestResult.findMany({
      where: { reservedAt: from ? { gte: from } : { not: null } },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { reservedAt: "desc" },
      take: 8,
    }),
  ]);
  const stats = computeStats(
    rows.map(({ _count, parsed, ...r }): RequestRow => ({
      ...r,
      // Eski yozuvlarda keyin qo'shilgan maydonlar (narx_max) yo'q
      parsed: parsed ? withDefaults(parsed as Partial<ParsedQuery>) : null,
      reserved: _count.results,
    })),
    cats.map((c) => c.category),
  );
  const reservations = reserved.map((r) => ({
    id: r.id,
    code: String(r.requestId),
    name: r.product.name,
    sku: r.product.sku,
    size: r.reservedSize ?? "",
    at: (r.reservedAt ?? new Date()).toISOString(),
  }));
  return { ...stats, period, reservations };
}
