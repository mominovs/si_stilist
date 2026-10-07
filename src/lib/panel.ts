import { prisma } from "@/lib/db";
import { computeStats, type PanelStats, type RequestRow } from "@/lib/analytics";
import { withDefaults, type ParsedQuery } from "@/lib/query/schema";
import { fitAccuracy } from "@/lib/sizing";
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
export type Reservation = {
  id: number;
  code: string;
  name: string;
  sku: string | null;
  size: string;
  at: string;
  /** false: o'lcham omborda yo'q, buyurtma (jonli oynadan) */
  inStock: boolean;
  /** Jonli oyna tavsiya qilgan o'lcham va sotuvchi belgilagan haqiqatda to'g'ri kelgani */
  recommended: string | null;
  fitted: string | null;
  sizes: string[];
};

/** Jonli oyna o'lcham tavsiyasi: nechtasi tavsiya bilan, nechtasi belgilangan va aniqligi (sinov) */
export type SizeFitStats = { recommended: number; n: number; exact: number; within1: number };

export async function loadPanelStats(
  period: Period,
): Promise<PanelStats & { period: Period; reservations: Reservation[]; sizeFit: SizeFitStats }> {
  const from = since(period);
  const [rows, cats, reserved, fits] = await Promise.all([
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
      include: { product: { select: { name: true, sku: true, variants: { select: { size: true, stock: true }, orderBy: { id: "asc" } } } } },
      orderBy: { reservedAt: "desc" },
      take: 8,
    }),
    prisma.requestResult.findMany({
      where: { recommendedSize: { not: null }, ...(from ? { reservedAt: { gte: from } } : {}) },
      select: { recommendedSize: true, fittedSize: true },
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
    inStock: r.product.variants.some((v) => v.size === r.reservedSize && v.stock > 0),
    recommended: r.recommendedSize,
    fitted: r.fittedSize,
    sizes: r.product.variants.map((v) => v.size),
  }));
  const accuracy = fitAccuracy(
    fits.flatMap((f) => (f.recommendedSize && f.fittedSize ? [{ recommended: f.recommendedSize, fitted: f.fittedSize }] : [])),
  );
  return { ...stats, period, reservations, sizeFit: { recommended: fits.length, ...accuracy } };
}
