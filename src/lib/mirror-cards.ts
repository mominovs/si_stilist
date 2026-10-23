import { MIRROR_CATEGORIES } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { priceTiers } from "@/lib/matching";
import { toCard } from "@/lib/search";
import type { MirrorCard } from "@/components/mirror/MirrorView";

/** Jonli oyna tovarlari: faqat omborda bor ustki kiyimlar (DM-VTON shular uchun o'qitilgan). /oyna va /efir */
export async function mirrorCards(): Promise<MirrorCard[]> {
  const products = await prisma.product.findMany({
    where: { category: { in: [...MIRROR_CATEGORIES] }, variants: { some: { stock: { gt: 0 } } } },
    include: { variants: { orderBy: { id: "asc" } }, store: true },
    orderBy: [{ category: "asc" }, { price: "asc" }],
  });
  const tiers = priceTiers(products);
  return products.map((p) => ({ ...toCard(p, tiers.get(p.id) ?? "orta"), gender: p.gender }));
}

// Jonli oyna vaqt bilan cheklanmagan (lokal model bepul): kadrda shuncha soniya odam ko'rinmasa yopiladi.
// .env da MIRROR_IDLE_SECONDS (15..600, standart 60)
export function idleSeconds(): number {
  const n = Number(process.env.MIRROR_IDLE_SECONDS);
  return Number.isFinite(n) && n >= 15 ? Math.min(600, Math.round(n)) : 60;
}
